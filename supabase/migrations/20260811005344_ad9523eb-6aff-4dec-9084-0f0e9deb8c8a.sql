
-- ENUMS
CREATE TYPE public.app_role AS ENUM ('SUPER_ADMIN','ADMIN','ANALYST','VIEWER');
CREATE TYPE public.sentiment_label AS ENUM ('positive','neutral','negative');

-- ORGANIZATIONS
CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- PROFILES
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  full_name text,
  email text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- USER ROLES
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- HELPERS
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.current_org()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT org_id FROM public.profiles WHERE id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION public.can_write()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role IN ('SUPER_ADMIN','ADMIN','ANALYST')
  );
$$;

CREATE POLICY "org members read organization" ON public.organizations
FOR SELECT TO authenticated USING (id = public.current_org());

CREATE POLICY "read profiles in org" ON public.profiles
FOR SELECT TO authenticated USING (org_id = public.current_org());
CREATE POLICY "update own profile" ON public.profiles
FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE POLICY "read own roles" ON public.user_roles
FOR SELECT TO authenticated USING (user_id = auth.uid());

-- TERRITORIAL UNITS (aggregated demographics only)
CREATE TABLE public.territorial_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  section_code text NOT NULL,
  municipio text NOT NULL,
  localidad text,
  population integer NOT NULL DEFAULT 0,
  pop_0_17 integer NOT NULL DEFAULT 0,
  pop_18_29 integer NOT NULL DEFAULT 0,
  pop_30_44 integer NOT NULL DEFAULT 0,
  pop_45_59 integer NOT NULL DEFAULT 0,
  pop_60_plus integer NOT NULL DEFAULT 0,
  women integer NOT NULL DEFAULT 0,
  men integer NOT NULL DEFAULT 0,
  gender_other integer NOT NULL DEFAULT 0,
  households integer NOT NULL DEFAULT 0,
  centroid_lat double precision,
  centroid_lng double precision,
  geometry jsonb,
  source text DEFAULT 'demo',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, section_code)
);
CREATE INDEX idx_units_org ON public.territorial_units(org_id);
CREATE INDEX idx_units_muni ON public.territorial_units(municipio);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.territorial_units TO authenticated;
GRANT ALL ON public.territorial_units TO service_role;
ALTER TABLE public.territorial_units ENABLE ROW LEVEL SECURITY;
CREATE POLICY "units read in org" ON public.territorial_units
FOR SELECT TO authenticated USING (org_id = public.current_org());
CREATE POLICY "units write in org" ON public.territorial_units
FOR ALL TO authenticated USING (org_id = public.current_org() AND public.can_write())
WITH CHECK (org_id = public.current_org() AND public.can_write());

-- CONTACTS
CREATE TABLE public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  age integer,
  gender text,
  phone text,
  email text,
  unit_id uuid REFERENCES public.territorial_units(id) ON DELETE SET NULL,
  section_code text,
  municipio text,
  status text NOT NULL DEFAULT 'active',
  notes text,
  consent_storage boolean NOT NULL DEFAULT false,
  consent_comms boolean NOT NULL DEFAULT false,
  consent_at timestamptz,
  registered_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contacts_age_valid CHECK (age IS NULL OR (age >= 18 AND age <= 120)),
  CONSTRAINT contacts_consent_required CHECK (consent_storage = true)
);
CREATE INDEX idx_contacts_org ON public.contacts(org_id);
CREATE INDEX idx_contacts_unit ON public.contacts(unit_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contacts TO authenticated;
GRANT ALL ON public.contacts TO service_role;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "contacts read in org" ON public.contacts
FOR SELECT TO authenticated USING (org_id = public.current_org());
CREATE POLICY "contacts write in org" ON public.contacts
FOR ALL TO authenticated USING (org_id = public.current_org() AND public.can_write())
WITH CHECK (org_id = public.current_org() AND public.can_write());

-- CONTACT HISTORY
CREATE TABLE public.contact_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE CASCADE,
  action text NOT NULL,
  details jsonb,
  actor uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_history_contact ON public.contact_history(contact_id);
GRANT SELECT, INSERT ON public.contact_history TO authenticated;
GRANT ALL ON public.contact_history TO service_role;
ALTER TABLE public.contact_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "history read in org" ON public.contact_history
FOR SELECT TO authenticated USING (org_id = public.current_org());
CREATE POLICY "history insert in org" ON public.contact_history
FOR INSERT TO authenticated WITH CHECK (org_id = public.current_org() AND public.can_write());

-- WEB MONITORS
CREATE TABLE public.web_monitors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  query text NOT NULL,
  subject_type text NOT NULL DEFAULT 'person',
  active boolean NOT NULL DEFAULT true,
  last_run_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.web_monitors TO authenticated;
GRANT ALL ON public.web_monitors TO service_role;
ALTER TABLE public.web_monitors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "monitors read in org" ON public.web_monitors
FOR SELECT TO authenticated USING (org_id = public.current_org());
CREATE POLICY "monitors write in org" ON public.web_monitors
FOR ALL TO authenticated USING (org_id = public.current_org() AND public.can_write())
WITH CHECK (org_id = public.current_org() AND public.can_write());

-- WEB SOURCES
CREATE TABLE public.web_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  domain text NOT NULL,
  name text,
  source_type text NOT NULL DEFAULT 'news',
  rss_url text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.web_sources TO authenticated;
GRANT ALL ON public.web_sources TO service_role;
ALTER TABLE public.web_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sources read in org" ON public.web_sources
FOR SELECT TO authenticated USING (org_id = public.current_org());
CREATE POLICY "sources write in org" ON public.web_sources
FOR ALL TO authenticated USING (org_id = public.current_org() AND public.can_write())
WITH CHECK (org_id = public.current_org() AND public.can_write());

-- WEB MENTIONS
CREATE TABLE public.web_mentions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  monitor_id uuid REFERENCES public.web_monitors(id) ON DELETE CASCADE,
  title text NOT NULL,
  url text,
  excerpt text,
  source_domain text,
  source_type text DEFAULT 'news',
  author text,
  language text DEFAULT 'es',
  sentiment public.sentiment_label DEFAULT 'neutral',
  sentiment_score numeric DEFAULT 0,
  topic text,
  relevance numeric DEFAULT 0.5,
  reach integer DEFAULT 0,
  engagement integer DEFAULT 0,
  published_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_mentions_monitor ON public.web_mentions(monitor_id);
CREATE INDEX idx_mentions_published ON public.web_mentions(published_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.web_mentions TO authenticated;
GRANT ALL ON public.web_mentions TO service_role;
ALTER TABLE public.web_mentions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mentions read in org" ON public.web_mentions
FOR SELECT TO authenticated USING (org_id = public.current_org());
CREATE POLICY "mentions write in org" ON public.web_mentions
FOR ALL TO authenticated USING (org_id = public.current_org() AND public.can_write())
WITH CHECK (org_id = public.current_org() AND public.can_write());

-- REPORTS
CREATE TABLE public.reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  report_type text NOT NULL,
  format text NOT NULL DEFAULT 'csv',
  params jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.reports TO authenticated;
GRANT ALL ON public.reports TO service_role;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reports read in org" ON public.reports
FOR SELECT TO authenticated USING (org_id = public.current_org());
CREATE POLICY "reports write in org" ON public.reports
FOR ALL TO authenticated USING (org_id = public.current_org() AND public.can_write())
WITH CHECK (org_id = public.current_org() AND public.can_write());

-- AUDIT LOGS
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor uuid,
  action text NOT NULL,
  entity text,
  entity_id uuid,
  meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit read in org" ON public.audit_logs
FOR SELECT TO authenticated USING (org_id = public.current_org());
CREATE POLICY "audit insert in org" ON public.audit_logs
FOR INSERT TO authenticated WITH CHECK (org_id = public.current_org());

-- UPDATED AT
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER contacts_updated_at BEFORE UPDATE ON public.contacts
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- DEMO ORG + NEW USER HANDLER
INSERT INTO public.organizations (id, name, slug)
VALUES ('11111111-1111-1111-1111-111111111111','Territorio Intelligence Demo','demo');

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, org_id, full_name, email)
  VALUES (NEW.id, '11111111-1111-1111-1111-111111111111',
          COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)), NEW.email);
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'ADMIN');
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- SEED: territorial units (fictitious demo data)
INSERT INTO public.territorial_units
 (org_id, section_code, municipio, localidad, population, pop_0_17, pop_18_29, pop_30_44, pop_45_59, pop_60_plus, women, men, gender_other, households, centroid_lat, centroid_lng, geometry)
SELECT
  '11111111-1111-1111-1111-111111111111',
  lpad(g::text, 4, '0'),
  m.name,
  m.name || ' - Zona ' || ((g % 5) + 1),
  pop.total,
  round(pop.total * 0.28)::int,
  round(pop.total * 0.21)::int,
  round(pop.total * 0.23)::int,
  round(pop.total * 0.16)::int,
  round(pop.total * 0.12)::int,
  round(pop.total * 0.51)::int,
  round(pop.total * 0.485)::int,
  round(pop.total * 0.005)::int,
  round(pop.total / 3.4)::int,
  m.lat + ((g % 7) - 3) * 0.012,
  m.lng + ((g % 5) - 2) * 0.014,
  jsonb_build_object(
    'type','Polygon',
    'coordinates', jsonb_build_array(jsonb_build_array(
      jsonb_build_array(m.lng + ((g % 5) - 2) * 0.014 - 0.007, m.lat + ((g % 7) - 3) * 0.012 - 0.006),
      jsonb_build_array(m.lng + ((g % 5) - 2) * 0.014 + 0.007, m.lat + ((g % 7) - 3) * 0.012 - 0.006),
      jsonb_build_array(m.lng + ((g % 5) - 2) * 0.014 + 0.007, m.lat + ((g % 7) - 3) * 0.012 + 0.006),
      jsonb_build_array(m.lng + ((g % 5) - 2) * 0.014 - 0.007, m.lat + ((g % 7) - 3) * 0.012 + 0.006),
      jsonb_build_array(m.lng + ((g % 5) - 2) * 0.014 - 0.007, m.lat + ((g % 7) - 3) * 0.012 - 0.006)
    ))
  )
FROM generate_series(1, 36) g
CROSS JOIN LATERAL (
  SELECT * FROM (VALUES
    ('Zacatecas', 22.7709, -102.5832),
    ('Guadalupe', 22.7470, -102.5080),
    ('Fresnillo', 23.1750, -102.8710),
    ('Jerez', 22.6490, -102.9930),
    ('Sombrerete', 23.6350, -103.6410),
    ('Río Grande', 23.8250, -103.0270)
  ) AS t(name, lat, lng) OFFSET ((g - 1) % 6) LIMIT 1
) m
CROSS JOIN LATERAL (SELECT (1200 + (g * 137) % 3400)::int AS total) pop;

-- SEED: contacts
INSERT INTO public.contacts (org_id, full_name, age, gender, phone, unit_id, section_code, municipio, status, consent_storage, consent_comms, consent_at, registered_at)
SELECT
  '11111111-1111-1111-1111-111111111111',
  (ARRAY['María','José','Ana','Luis','Carmen','Jorge','Sofía','Miguel','Laura','Ricardo'])[1 + (i % 10)] || ' ' ||
  (ARRAY['Hernández','López','García','Martínez','Ramírez','Torres','Flores','Vargas'])[1 + (i % 8)],
  22 + (i % 45),
  (ARRAY['femenino','masculino','no_especificado'])[1 + (i % 3)],
  '49' || lpad(((1000000 + i * 7919) % 10000000)::text, 7, '0'),
  u.id, u.section_code, u.municipio,
  'active', true, (i % 3 <> 0), now() - ((i % 300) || ' days')::interval,
  now() - ((i % 300) || ' days')::interval
FROM generate_series(1, 240) i
CROSS JOIN LATERAL (
  SELECT id, section_code, municipio FROM public.territorial_units
  ORDER BY section_code OFFSET (i % 36) LIMIT 1
) u;

-- SEED: monitors, sources, mentions
INSERT INTO public.web_monitors (id, org_id, name, query, subject_type) VALUES
 ('22222222-2222-2222-2222-222222222221','11111111-1111-1111-1111-111111111111','Gobierno de Zacatecas','"Gobierno de Zacatecas"','organization'),
 ('22222222-2222-2222-2222-222222222222','11111111-1111-1111-1111-111111111111','Obra pública municipal','"obra pública" Zacatecas','topic');

INSERT INTO public.web_sources (org_id, domain, name, source_type, rss_url) VALUES
 ('11111111-1111-1111-1111-111111111111','ejemplo-noticias.mx','Ejemplo Noticias','news','https://ejemplo-noticias.mx/rss'),
 ('11111111-1111-1111-1111-111111111111','diario-demo.mx','Diario Demo','news','https://diario-demo.mx/rss'),
 ('11111111-1111-1111-1111-111111111111','blog-territorio.mx','Blog Territorio','blog',null),
 ('11111111-1111-1111-1111-111111111111','radio-publica.mx','Radio Pública','radio',null);

INSERT INTO public.web_mentions (org_id, monitor_id, title, url, excerpt, source_domain, source_type, author, sentiment, sentiment_score, topic, relevance, reach, engagement, published_at)
SELECT
  '11111111-1111-1111-1111-111111111111',
  CASE WHEN i % 2 = 0 THEN '22222222-2222-2222-2222-222222222221'::uuid ELSE '22222222-2222-2222-2222-222222222222'::uuid END,
  (ARRAY['Avance en infraestructura urbana','Nuevo programa de servicios públicos','Análisis: movilidad en la capital','Reporte de transparencia municipal','Cobertura de agua potable','Rehabilitación de centro histórico'])[1 + (i % 6)] || ' #' || i,
  'https://ejemplo-noticias.mx/nota/' || i,
  'Resumen ficticio de una publicación pública utilizada como dato de demostración.',
  (ARRAY['ejemplo-noticias.mx','diario-demo.mx','blog-territorio.mx','radio-publica.mx'])[1 + (i % 4)],
  (ARRAY['news','news','blog','radio'])[1 + (i % 4)],
  'Redacción',
  (ARRAY['positive','neutral','negative','neutral','positive'])[1 + (i % 5)]::public.sentiment_label,
  round((((i % 5) - 2) * 0.3)::numeric, 2),
  (ARRAY['infraestructura','servicios','movilidad','transparencia','agua','patrimonio'])[1 + (i % 6)],
  round((0.4 + (i % 6) * 0.1)::numeric, 2),
  (800 + (i * 373) % 42000),
  (5 + (i * 17) % 480),
  now() - ((i % 90) || ' days')::interval
FROM generate_series(1, 180) i;
