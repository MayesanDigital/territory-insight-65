-- =============================================================================
-- SEGURIDAD: multi-tenancy real, RBAC por organización y auditoría no falsificable
--
-- Corrige tres fallas del esquema inicial que impedían salir a producción:
--   1. handle_new_user() metía a CUALQUIER usuario que se registrara en la
--      organización demo con rol ADMIN. Escalación de privilegios trivial.
--   2. user_roles no tenía org_id, así que los roles eran globales: un ADMIN
--      de una organización lo era de todas.
--   3. La política INSERT de audit_logs no validaba el actor, de modo que
--      cualquiera podía fabricar entradas de auditoría a nombre de otro.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. profiles.org_id pasa a ser nullable
-- Un usuario recién registrado sin invitación queda sin organización. Es el
-- estado seguro por defecto: current_org() devuelve NULL y toda política RLS
-- evalúa a falso, así que no ve absolutamente nada hasta que se le asigne.
-- -----------------------------------------------------------------------------
ALTER TABLE public.profiles ALTER COLUMN org_id DROP NOT NULL;

-- Leer el propio perfil no puede depender de tener organización, o el onboarding
-- se bloquea a sí mismo: sin perfil legible la app no sabe que falta la org.
DROP POLICY IF EXISTS "read profiles in org" ON public.profiles;
CREATE POLICY "read own profile" ON public.profiles
FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "read profiles in same org" ON public.profiles
FOR SELECT TO authenticated
USING (org_id IS NOT NULL AND org_id = public.current_org());

-- -----------------------------------------------------------------------------
-- 2. Roles con alcance de organización
-- SUPER_ADMIN es un rol de plataforma y por eso admite org_id NULL; el resto
-- solo existe dentro de una organización concreta.
-- -----------------------------------------------------------------------------
ALTER TABLE public.user_roles
  ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS granted_by uuid,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

-- Backfill: los roles existentes pertenecen a la organización de su perfil.
UPDATE public.user_roles ur
SET org_id = p.org_id
FROM public.profiles p
WHERE p.id = ur.user_id AND ur.org_id IS NULL AND ur.role <> 'SUPER_ADMIN';

ALTER TABLE public.user_roles
  DROP CONSTRAINT IF EXISTS user_roles_user_id_role_key;
CREATE UNIQUE INDEX IF NOT EXISTS user_roles_unique_scope
  ON public.user_roles (user_id, COALESCE(org_id, '00000000-0000-0000-0000-000000000000'::uuid), role);

ALTER TABLE public.user_roles
  DROP CONSTRAINT IF EXISTS user_roles_super_admin_is_global,
  ADD CONSTRAINT user_roles_super_admin_is_global
  CHECK (role = 'SUPER_ADMIN' OR org_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_user_roles_user ON public.user_roles(user_id);

-- -----------------------------------------------------------------------------
-- 3. Helpers de autorización
-- Todos son SECURITY DEFINER y consultan user_roles directamente: si evaluaran
-- RLS sobre la propia tabla que protegen, entrarían en recursión infinita.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'SUPER_ADMIN'
  );
$$;

-- Verdadero si el usuario tiene alguno de los roles pedidos DENTRO de su
-- organización actual. SUPER_ADMIN satisface cualquier comprobación.
CREATE OR REPLACE FUNCTION public.has_org_role(_roles public.app_role[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_super_admin() OR EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.profiles p ON p.id = ur.user_id
    WHERE ur.user_id = auth.uid()
      AND ur.role = ANY(_roles)
      AND ur.org_id IS NOT NULL
      AND ur.org_id = p.org_id
  );
$$;

-- Administra datos personales y territoriales: contactos, secciones, usuarios.
CREATE OR REPLACE FUNCTION public.can_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_org_role(ARRAY['ADMIN']::public.app_role[]);
$$;

-- Ejecuta análisis: monitores, fuentes, reportes. No toca datos personales.
CREATE OR REPLACE FUNCTION public.can_analyze()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_org_role(ARRAY['ADMIN','ANALYST']::public.app_role[]);
$$;

-- can_write() se conserva como alias del permiso de análisis para no romper
-- políticas heredadas; el código nuevo debe usar can_admin/can_analyze.
CREATE OR REPLACE FUNCTION public.can_write()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.can_analyze();
$$;

REVOKE ALL ON FUNCTION public.is_super_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_org_role(public.app_role[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_analyze() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_org_role(public.app_role[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_analyze() TO authenticated;

-- -----------------------------------------------------------------------------
-- 4. Invitaciones
-- Sustituyen al alta automática. Un ADMIN invita por correo con un rol concreto;
-- al registrarse esa dirección, el trigger la incorpora con ese rol y nada más.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organization_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  role public.app_role NOT NULL DEFAULT 'VIEWER',
  invited_by uuid,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '14 days',
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Nadie reparte SUPER_ADMIN por invitación: es un rol de plataforma.
  CONSTRAINT invitation_role_not_super CHECK (role <> 'SUPER_ADMIN'),
  UNIQUE (org_id, email)
);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON public.organization_invitations(lower(email));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_invitations TO authenticated;
GRANT ALL ON public.organization_invitations TO service_role;
ALTER TABLE public.organization_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invitations read in org" ON public.organization_invitations
FOR SELECT TO authenticated
USING (org_id = public.current_org() OR public.is_super_admin());

CREATE POLICY "invitations managed by admins" ON public.organization_invitations
FOR ALL TO authenticated
USING (org_id = public.current_org() AND public.can_admin())
WITH CHECK (org_id = public.current_org() AND public.can_admin());

-- -----------------------------------------------------------------------------
-- 5. Alta de usuarios sin privilegios automáticos
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _inv public.organization_invitations%ROWTYPE;
BEGIN
  SELECT * INTO _inv
  FROM public.organization_invitations
  WHERE lower(email) = lower(NEW.email)
    AND accepted_at IS NULL
    AND expires_at > now()
  ORDER BY created_at DESC
  LIMIT 1;

  -- Sin invitación, _inv.org_id es NULL y el usuario queda en onboarding.
  INSERT INTO public.profiles (id, org_id, full_name, email)
  VALUES (
    NEW.id,
    _inv.org_id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email
  );

  IF _inv.id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, org_id, role)
    VALUES (NEW.id, _inv.org_id, _inv.role);

    UPDATE public.organization_invitations
    SET accepted_at = now()
    WHERE id = _inv.id;

    INSERT INTO public.audit_logs (org_id, actor, action, entity, entity_id, meta)
    VALUES (_inv.org_id, NEW.id, 'LOGIN', 'profiles', NEW.id,
            jsonb_build_object('via', 'invitation', 'role', _inv.role));
  END IF;

  RETURN NEW;
END; $$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 6. Crear organización
-- Es la vía por la que un usuario nuevo se convierte en ADMIN, y solo de la
-- organización que acaba de crear. Va en SECURITY DEFINER porque quien la llama
-- todavía no tiene permisos para insertar en organizations.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_organization(_name text, _slug text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _org uuid;
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'No autenticado';
  END IF;

  IF _name IS NULL OR length(trim(_name)) < 2 THEN
    RAISE EXCEPTION 'El nombre de la organización debe tener al menos 2 caracteres';
  END IF;

  IF _slug !~ '^[a-z0-9]([a-z0-9-]{1,46}[a-z0-9])$' THEN
    RAISE EXCEPTION 'Identificador inválido: usa minúsculas, números y guiones (3 a 48 caracteres)';
  END IF;

  -- Pertenecer ya a una organización cierra esta puerta: crear organizaciones
  -- adicionales es competencia del Super Admin.
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = _uid AND org_id IS NOT NULL)
     AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Ya perteneces a una organización';
  END IF;

  INSERT INTO public.organizations (name, slug)
  VALUES (trim(_name), _slug)
  RETURNING id INTO _org;

  UPDATE public.profiles SET org_id = _org WHERE id = _uid;

  INSERT INTO public.user_roles (user_id, org_id, role, granted_by)
  VALUES (_uid, _org, 'ADMIN', _uid)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.audit_logs (org_id, actor, action, entity, entity_id, meta)
  VALUES (_org, _uid, 'CREATE', 'organizations', _org,
          jsonb_build_object('name', trim(_name), 'slug', _slug));

  RETURN _org;
END; $$;

REVOKE ALL ON FUNCTION public.create_organization(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_organization(text, text) TO authenticated;

-- -----------------------------------------------------------------------------
-- 7. Auditoría no falsificable
-- -----------------------------------------------------------------------------
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS ip_hash text,
  ALTER COLUMN actor SET DEFAULT auth.uid();

-- El actor deja de ser un campo libre: solo puedes registrar acciones tuyas.
DROP POLICY IF EXISTS "audit insert in org" ON public.audit_logs;
CREATE POLICY "audit insert as self" ON public.audit_logs
FOR INSERT TO authenticated
WITH CHECK (org_id = public.current_org() AND actor = auth.uid());

DROP POLICY IF EXISTS "audit read in org" ON public.audit_logs;
-- La auditoría es material de supervisión: la leen administradores, no cualquiera.
CREATE POLICY "audit read by admins" ON public.audit_logs
FOR SELECT TO authenticated
USING ((org_id = public.current_org() AND public.can_admin()) OR public.is_super_admin());

-- Sin UPDATE ni DELETE para authenticated: el registro es append-only.
REVOKE UPDATE, DELETE ON public.audit_logs FROM authenticated;

CREATE INDEX IF NOT EXISTS idx_audit_org_created ON public.audit_logs(org_id, created_at DESC);

-- Trigger genérico de auditoría.
-- Deliberadamente NO copia los valores de las filas: auditar contactos volcando
-- su contenido duplicaría datos personales fuera de la tabla que los protege.
-- Solo se registra qué columnas cambiaron.
CREATE OR REPLACE FUNCTION public.audit_row()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _org uuid;
  _id uuid;
  _action text;
  _meta jsonb := NULL;
BEGIN
  IF TG_OP = 'DELETE' THEN
    _org := OLD.org_id; _id := OLD.id; _action := 'DELETE';
  ELSIF TG_OP = 'INSERT' THEN
    _org := NEW.org_id; _id := NEW.id; _action := 'CREATE';
  ELSE
    _org := NEW.org_id; _id := NEW.id; _action := 'UPDATE';
    SELECT jsonb_build_object('changed', COALESCE(jsonb_agg(n.key), '[]'::jsonb))
    INTO _meta
    FROM jsonb_each(to_jsonb(NEW)) n
    WHERE n.value IS DISTINCT FROM (to_jsonb(OLD) -> n.key);
  END IF;

  INSERT INTO public.audit_logs (org_id, actor, action, entity, entity_id, meta)
  VALUES (_org, auth.uid(), _action, TG_TABLE_NAME, _id, _meta);

  RETURN COALESCE(NEW, OLD);
END; $$;

REVOKE ALL ON FUNCTION public.audit_row() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS audit_contacts ON public.contacts;
CREATE TRIGGER audit_contacts
AFTER INSERT OR UPDATE OR DELETE ON public.contacts
FOR EACH ROW EXECUTE FUNCTION public.audit_row();

DROP TRIGGER IF EXISTS audit_units ON public.territorial_units;
CREATE TRIGGER audit_units
AFTER INSERT OR UPDATE OR DELETE ON public.territorial_units
FOR EACH ROW EXECUTE FUNCTION public.audit_row();

DROP TRIGGER IF EXISTS audit_monitors ON public.web_monitors;
CREATE TRIGGER audit_monitors
AFTER INSERT OR UPDATE OR DELETE ON public.web_monitors
FOR EACH ROW EXECUTE FUNCTION public.audit_row();

DROP TRIGGER IF EXISTS audit_reports ON public.reports;
CREATE TRIGGER audit_reports
AFTER INSERT OR DELETE ON public.reports
FOR EACH ROW EXECUTE FUNCTION public.audit_row();

-- -----------------------------------------------------------------------------
-- 8. Políticas por rol
-- Contactos y territorios son ADMIN; monitores, fuentes, menciones y reportes
-- son ADMIN o ANALYST; VIEWER solo lee. Coincide con el PRD §3.
-- -----------------------------------------------------------------------------

-- Organizaciones
DROP POLICY IF EXISTS "org members read organization" ON public.organizations;
CREATE POLICY "org members read organization" ON public.organizations
FOR SELECT TO authenticated
USING (id = public.current_org() OR public.is_super_admin());

CREATE POLICY "org updated by admins" ON public.organizations
FOR UPDATE TO authenticated
USING (id = public.current_org() AND public.can_admin())
WITH CHECK (id = public.current_org() AND public.can_admin());

CREATE POLICY "org managed by super admin" ON public.organizations
FOR ALL TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

GRANT UPDATE, INSERT, DELETE ON public.organizations TO authenticated;

-- Roles: visibles para los administradores de la organización, y solo ellos
-- pueden asignarlos. SUPER_ADMIN nunca se otorga desde la aplicación.
DROP POLICY IF EXISTS "read own roles" ON public.user_roles;
CREATE POLICY "read own roles" ON public.user_roles
FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "admins read org roles" ON public.user_roles
FOR SELECT TO authenticated
USING ((org_id = public.current_org() AND public.can_admin()) OR public.is_super_admin());

CREATE POLICY "admins grant org roles" ON public.user_roles
FOR ALL TO authenticated
USING (org_id = public.current_org() AND public.can_admin() AND role <> 'SUPER_ADMIN')
WITH CHECK (org_id = public.current_org() AND public.can_admin() AND role <> 'SUPER_ADMIN');

GRANT INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;

-- Territorios: escritura solo ADMIN.
DROP POLICY IF EXISTS "units write in org" ON public.territorial_units;
CREATE POLICY "units write in org" ON public.territorial_units
FOR ALL TO authenticated
USING (org_id = public.current_org() AND public.can_admin())
WITH CHECK (org_id = public.current_org() AND public.can_admin());

-- Contactos: datos personales, escritura solo ADMIN.
DROP POLICY IF EXISTS "contacts write in org" ON public.contacts;
CREATE POLICY "contacts write in org" ON public.contacts
FOR ALL TO authenticated
USING (org_id = public.current_org() AND public.can_admin())
WITH CHECK (org_id = public.current_org() AND public.can_admin());

DROP POLICY IF EXISTS "history insert in org" ON public.contact_history;
CREATE POLICY "history insert in org" ON public.contact_history
FOR INSERT TO authenticated
WITH CHECK (org_id = public.current_org() AND public.can_admin());

-- Monitoreo y reportes: ADMIN o ANALYST.
DROP POLICY IF EXISTS "monitors write in org" ON public.web_monitors;
CREATE POLICY "monitors write in org" ON public.web_monitors
FOR ALL TO authenticated
USING (org_id = public.current_org() AND public.can_analyze())
WITH CHECK (org_id = public.current_org() AND public.can_analyze());

DROP POLICY IF EXISTS "sources write in org" ON public.web_sources;
CREATE POLICY "sources write in org" ON public.web_sources
FOR ALL TO authenticated
USING (org_id = public.current_org() AND public.can_analyze())
WITH CHECK (org_id = public.current_org() AND public.can_analyze());

DROP POLICY IF EXISTS "mentions write in org" ON public.web_mentions;
CREATE POLICY "mentions write in org" ON public.web_mentions
FOR ALL TO authenticated
USING (org_id = public.current_org() AND public.can_analyze())
WITH CHECK (org_id = public.current_org() AND public.can_analyze());

DROP POLICY IF EXISTS "reports write in org" ON public.reports;
CREATE POLICY "reports write in org" ON public.reports
FOR ALL TO authenticated
USING (org_id = public.current_org() AND public.can_analyze())
WITH CHECK (org_id = public.current_org() AND public.can_analyze());

-- Lectura para SUPER_ADMIN en las tablas de datos.
DROP POLICY IF EXISTS "units read in org" ON public.territorial_units;
CREATE POLICY "units read in org" ON public.territorial_units
FOR SELECT TO authenticated
USING (org_id = public.current_org() OR public.is_super_admin());

DROP POLICY IF EXISTS "contacts read in org" ON public.contacts;
CREATE POLICY "contacts read in org" ON public.contacts
FOR SELECT TO authenticated
USING (org_id = public.current_org() OR public.is_super_admin());
