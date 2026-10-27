-- =============================================================================
-- Permisos por vista
-- =============================================================================
-- Hasta ahora el acceso dependía solo del rol: un ANALYST veía todas las
-- pantallas de análisis y un VIEWER todas las de lectura. Hacía falta poder
-- decir, usuario por usuario, qué pantallas puede abrir y qué puede hacer en
-- ellas: un promotor que solo captura contactos no tiene por qué ver el
-- comparativo de monitoreo ni el análisis electoral.
--
-- Los permisos ACOTAN al rol, nunca lo amplían. Quien no puede escribir por su
-- rol sigue sin poder aunque se le marque la casilla: RLS manda, y estas filas
-- solo recortan.
--
-- Compatibilidad: un usuario SIN filas en esta tabla conserva todo lo que su
-- rol le permitía. Así nadie pierde acceso al desplegar, y los permisos se
-- vuelven explícitos solo cuando alguien los edita.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.user_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  /* Clave del permiso: una vista ("mapa", "contactos") o una acción
     ("reportes.imprimir", "contactos.exportar"). Se valida contra el catálogo
     de abajo para que un error de dedo no cree un permiso fantasma que nadie
     comprueba. */
  permiso text NOT NULL,

  granted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (user_id, permiso)
);

CREATE INDEX IF NOT EXISTS idx_user_permissions_user ON public.user_permissions (user_id);

-- Catálogo de permisos reconocidos. Vive en la base porque la comprueban tanto
-- la interfaz como las políticas; duplicarlo en el código los separaría.
CREATE TABLE IF NOT EXISTS public.permission_catalog (
  permiso text PRIMARY KEY,
  grupo text NOT NULL,
  etiqueta text NOT NULL,
  descripcion text,
  /* Acciones que, además del permiso, exigen rol: imprimir y exportar mueven
     datos personales fuera de la plataforma. */
  requiere_rol public.app_role[],
  orden integer NOT NULL DEFAULT 0
);

INSERT INTO public.permission_catalog (permiso, grupo, etiqueta, descripcion, requiere_rol, orden) VALUES
  ('dashboard',            'Territorio', 'Dashboard',            'Indicadores generales de la campaña.', NULL, 10),
  ('mapa',                 'Territorio', 'Mapa Territorial',     'Mapa por secciones con sus capas.', NULL, 20),
  ('secciones',            'Territorio', 'Secciones',            'Catálogo de secciones y sus indicadores.', NULL, 30),
  ('contactos',            'Territorio', 'Contactos',            'Listado de contactos de la organización.', NULL, 40),
  ('contactos.imprimir',   'Territorio', 'Imprimir contactos',   'Imprimir y exportar el listado de contactos.', ARRAY['SUPER_ADMIN','ADMIN','ANALYST']::public.app_role[], 45),
  ('analytics',            'Territorio', 'Analytics',            'Analítica demográfica agregada.', NULL, 50),
  ('analisis-estrategico', 'Territorio', 'Análisis estratégico', 'Clasificación electoral de secciones.', NULL, 60),
  ('monitor',              'Monitoreo',  'Monitor Público',      'Búsqueda de menciones en medios y redes.', NULL, 70),
  ('menciones',            'Monitoreo',  'Menciones',            'Listado de menciones detectadas.', NULL, 80),
  ('comparativo',          'Monitoreo',  'Comparativo',          'Comparación entre búsquedas del monitor.', NULL, 90),
  ('reportes',             'Gestión',    'Reportes',             'Historial de reportes generados.', NULL, 100),
  ('reportes.imprimir',    'Gestión',    'Imprimir reportes',    'Generar e imprimir reportes en PDF.', ARRAY['SUPER_ADMIN','ADMIN','ANALYST']::public.app_role[], 105),
  ('importar',             'Gestión',    'Importar datos',       'Carga masiva de territorio y contactos.', ARRAY['SUPER_ADMIN','ADMIN']::public.app_role[], 110),
  ('configuracion',        'Gestión',    'Configuración',        'Cuenta, usuarios y políticas.', NULL, 120)
ON CONFLICT (permiso) DO UPDATE
  SET grupo = EXCLUDED.grupo,
      etiqueta = EXCLUDED.etiqueta,
      descripcion = EXCLUDED.descripcion,
      requiere_rol = EXCLUDED.requiere_rol,
      orden = EXCLUDED.orden;

ALTER TABLE public.user_permissions
  ADD CONSTRAINT user_permissions_catalogo
  FOREIGN KEY (permiso) REFERENCES public.permission_catalog(permiso) ON DELETE CASCADE;

-- -----------------------------------------------------------------------------
-- Consulta de permisos
-- -----------------------------------------------------------------------------

/**
 * ¿El usuario actual tiene este permiso?
 *
 * Sin filas propias, vale lo que su rol permitía: así nadie se queda fuera al
 * estrenar la tabla. Con filas, manda la lista, y las acciones del catálogo que
 * exigen rol lo siguen exigiendo aunque la casilla esté marcada.
 */
CREATE OR REPLACE FUNCTION public.tiene_permiso(_permiso text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    CASE
      WHEN public.is_super_admin() THEN true
      -- El permiso exige un rol que el usuario no tiene.
      WHEN EXISTS (
        SELECT 1 FROM public.permission_catalog c
        WHERE c.permiso = _permiso
          AND c.requiere_rol IS NOT NULL
          AND NOT public.has_org_role(c.requiere_rol)
      ) THEN false
      -- Sin permisos explícitos, el rol decide como antes.
      WHEN NOT EXISTS (
        SELECT 1 FROM public.user_permissions p WHERE p.user_id = auth.uid()
      ) THEN true
      ELSE EXISTS (
        SELECT 1 FROM public.user_permissions p
        WHERE p.user_id = auth.uid() AND p.permiso = _permiso
      )
    END;
$$;

REVOKE ALL ON FUNCTION public.tiene_permiso(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tiene_permiso(text) TO authenticated;

/** Permisos efectivos del usuario actual, ya resueltos contra su rol. */
CREATE OR REPLACE FUNCTION public.mis_permisos()
RETURNS TABLE (permiso text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.permiso
  FROM public.permission_catalog c
  WHERE public.tiene_permiso(c.permiso);
$$;

REVOKE ALL ON FUNCTION public.mis_permisos() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mis_permisos() TO authenticated;

-- -----------------------------------------------------------------------------
-- Acceso a las tablas
-- -----------------------------------------------------------------------------

ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permission_catalog ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.permission_catalog TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.user_permissions TO authenticated;
GRANT ALL ON public.user_permissions TO service_role;
GRANT ALL ON public.permission_catalog TO service_role;

DROP POLICY IF EXISTS "catalogo de permisos visible" ON public.permission_catalog;
CREATE POLICY "catalogo de permisos visible" ON public.permission_catalog
FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "permisos propios y de la org" ON public.user_permissions;
CREATE POLICY "permisos propios y de la org" ON public.user_permissions
FOR SELECT TO authenticated
USING (
  user_id = (SELECT auth.uid())
  OR (org_id = (SELECT public.current_org()) AND (SELECT public.can_admin()))
  OR (SELECT public.is_super_admin())
);

DROP POLICY IF EXISTS "permisos los otorga un admin" ON public.user_permissions;
CREATE POLICY "permisos los otorga un admin" ON public.user_permissions
FOR INSERT TO authenticated
WITH CHECK (org_id = (SELECT public.current_org()) AND (SELECT public.can_admin()));

DROP POLICY IF EXISTS "permisos los retira un admin" ON public.user_permissions;
CREATE POLICY "permisos los retira un admin" ON public.user_permissions
FOR DELETE TO authenticated
USING (org_id = (SELECT public.current_org()) AND (SELECT public.can_admin()));

-- -----------------------------------------------------------------------------
-- Los contactos son el dato sensible: aquí el permiso también vale en la base
-- -----------------------------------------------------------------------------
-- En el resto de las vistas el permiso recorta la interfaz. En contactos se
-- comprueba también en RLS, porque son datos personales y una consulta directa
-- a la API saltaría cualquier control de pantalla.

DROP POLICY IF EXISTS "contacts read in org" ON public.contacts;
CREATE POLICY "contacts read in org" ON public.contacts
FOR SELECT TO authenticated
USING (
  (org_id = (SELECT public.current_org()) AND (SELECT public.tiene_permiso('contactos')))
  OR (SELECT public.is_super_admin())
);
