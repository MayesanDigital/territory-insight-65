-- =============================================================================
-- Esquema completo del PRD §18
--
-- El esquema inicial metió demografía y geometría como columnas de
-- territorial_units, el consentimiento como dos booleanos en contacts, y
-- sentimiento y tema como texto suelto en web_mentions. Eso impide tres cosas
-- que el PRD pide explícitamente:
--
--   · demografía con `source` y `year` (§6): con columnas planas solo cabe una
--     versión del dato, así que cargar el censo 2030 borraría el de 2020.
--   · historial de consentimiento (§7, §8): un booleano no registra cuándo se
--     otorgó, por qué medio, ni si fue revocado.
--   · reanálisis de sentimiento (§16): sin guardar qué motor produjo cada
--     veredicto, cambiar de motor hace incomparables los datos viejos.
--
-- Las tablas normalizadas pasan a ser la fuente de verdad. Para que la
-- aplicación siga leyendo una forma plana, se crean vistas con
-- security_invoker: sin esa opción una vista se ejecuta con los privilegios de
-- su dueño y saltaría RLS por completo.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. demographics
-- -----------------------------------------------------------------------------
CREATE TABLE public.demographics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  territorial_unit_id uuid NOT NULL REFERENCES public.territorial_units(id) ON DELETE CASCADE,
  population integer NOT NULL DEFAULT 0,
  age_0_17 integer NOT NULL DEFAULT 0,
  age_18_29 integer NOT NULL DEFAULT 0,
  age_30_44 integer NOT NULL DEFAULT 0,
  age_45_59 integer NOT NULL DEFAULT 0,
  age_60_plus integer NOT NULL DEFAULT 0,
  gender_female integer NOT NULL DEFAULT 0,
  gender_male integer NOT NULL DEFAULT 0,
  gender_other integer NOT NULL DEFAULT 0,
  households integer NOT NULL DEFAULT 0,
  -- Procedencia y temporalidad: sin esto un indicador agregado no es auditable.
  source text NOT NULL DEFAULT 'manual',
  year integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT demographics_year_valid CHECK (year BETWEEN 1900 AND 2200),
  CONSTRAINT demographics_non_negative CHECK (
    population >= 0 AND age_0_17 >= 0 AND age_18_29 >= 0 AND age_30_44 >= 0
    AND age_45_59 >= 0 AND age_60_plus >= 0 AND gender_female >= 0
    AND gender_male >= 0 AND gender_other >= 0 AND households >= 0
  ),
  UNIQUE (territorial_unit_id, source, year)
);
CREATE INDEX idx_demographics_unit ON public.demographics(territorial_unit_id);
CREATE INDEX idx_demographics_org ON public.demographics(org_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.demographics TO authenticated;
GRANT ALL ON public.demographics TO service_role;
ALTER TABLE public.demographics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "demographics read in org" ON public.demographics
FOR SELECT TO authenticated
USING (org_id = public.current_org() OR public.is_super_admin());
CREATE POLICY "demographics write in org" ON public.demographics
FOR ALL TO authenticated
USING (org_id = public.current_org() AND public.can_admin())
WITH CHECK (org_id = public.current_org() AND public.can_admin());

CREATE TRIGGER demographics_updated_at BEFORE UPDATE ON public.demographics
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- 2. territorial_geometries
-- Sacar la geometría de la tabla principal es lo que permite listar secciones
-- sin arrastrar polígonos: un GeoJSON por fila multiplica por mil el peso de un
-- listado que solo necesita código, municipio y población.
-- -----------------------------------------------------------------------------
CREATE TABLE public.territorial_geometries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  territorial_unit_id uuid NOT NULL REFERENCES public.territorial_units(id) ON DELETE CASCADE,
  geometry jsonb NOT NULL,
  geometry_type text NOT NULL,
  centroid_lat double precision,
  centroid_lng double precision,
  source text NOT NULL DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT geometry_type_valid CHECK (
    geometry_type IN ('Polygon', 'MultiPolygon', 'Point', 'LineString', 'MultiLineString')
  ),
  UNIQUE (territorial_unit_id, source)
);
CREATE INDEX idx_geometries_unit ON public.territorial_geometries(territorial_unit_id);
CREATE INDEX idx_geometries_org ON public.territorial_geometries(org_id);
-- El mapa filtra por recuadro visible; sin índice sobre el centroide eso es un
-- recorrido completo de la tabla en cada desplazamiento.
CREATE INDEX idx_geometries_centroid ON public.territorial_geometries(centroid_lat, centroid_lng);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.territorial_geometries TO authenticated;
GRANT ALL ON public.territorial_geometries TO service_role;
ALTER TABLE public.territorial_geometries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "geometries read in org" ON public.territorial_geometries
FOR SELECT TO authenticated
USING (org_id = public.current_org() OR public.is_super_admin());
CREATE POLICY "geometries write in org" ON public.territorial_geometries
FOR ALL TO authenticated
USING (org_id = public.current_org() AND public.can_admin())
WITH CHECK (org_id = public.current_org() AND public.can_admin());

-- -----------------------------------------------------------------------------
-- 3. contact_consents
-- El consentimiento deja de ser un booleano y pasa a ser un historial: quién lo
-- otorgó, cuándo, por qué medio y si lo revocó. Es lo que hace defendible el
-- tratamiento de datos personales ante una reclamación.
-- -----------------------------------------------------------------------------
CREATE TABLE public.contact_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  consent_type text NOT NULL,
  granted boolean NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  method text NOT NULL DEFAULT 'form',
  notes text,
  recorded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT consent_type_valid CHECK (consent_type IN ('storage', 'communications')),
  CONSTRAINT consent_method_valid CHECK (method IN ('form', 'import', 'verbal', 'written', 'digital'))
);
CREATE INDEX idx_consents_contact ON public.contact_consents(contact_id);
CREATE INDEX idx_consents_org ON public.contact_consents(org_id);
GRANT SELECT, INSERT, UPDATE ON public.contact_consents TO authenticated;
GRANT ALL ON public.contact_consents TO service_role;
ALTER TABLE public.contact_consents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "consents read in org" ON public.contact_consents
FOR SELECT TO authenticated
USING (org_id = public.current_org() OR public.is_super_admin());
CREATE POLICY "consents write in org" ON public.contact_consents
FOR ALL TO authenticated
USING (org_id = public.current_org() AND public.can_admin())
WITH CHECK (org_id = public.current_org() AND public.can_admin());

-- -----------------------------------------------------------------------------
-- 4. topics y su relación con menciones
-- -----------------------------------------------------------------------------
CREATE TABLE public.topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  mention_count integer NOT NULL DEFAULT 0,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, slug)
);
CREATE INDEX idx_topics_org ON public.topics(org_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.topics TO authenticated;
GRANT ALL ON public.topics TO service_role;
ALTER TABLE public.topics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "topics read in org" ON public.topics
FOR SELECT TO authenticated
USING (org_id = public.current_org() OR public.is_super_admin());
CREATE POLICY "topics write in org" ON public.topics
FOR ALL TO authenticated
USING (org_id = public.current_org() AND public.can_analyze())
WITH CHECK (org_id = public.current_org() AND public.can_analyze());

CREATE TABLE public.mention_topics (
  mention_id uuid NOT NULL REFERENCES public.web_mentions(id) ON DELETE CASCADE,
  topic_id uuid NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  weight numeric NOT NULL DEFAULT 1,
  PRIMARY KEY (mention_id, topic_id)
);
CREATE INDEX idx_mention_topics_topic ON public.mention_topics(topic_id);
GRANT SELECT, INSERT, DELETE ON public.mention_topics TO authenticated;
GRANT ALL ON public.mention_topics TO service_role;
ALTER TABLE public.mention_topics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mention topics read in org" ON public.mention_topics
FOR SELECT TO authenticated
USING (org_id = public.current_org() OR public.is_super_admin());
CREATE POLICY "mention topics write in org" ON public.mention_topics
FOR ALL TO authenticated
USING (org_id = public.current_org() AND public.can_analyze())
WITH CHECK (org_id = public.current_org() AND public.can_analyze());

-- -----------------------------------------------------------------------------
-- 5. sentiment_analysis
-- web_mentions conserva el veredicto vigente para poder filtrar rápido; esta
-- tabla guarda cada análisis con el motor que lo produjo, de modo que cambiar
-- de heurística a un proveedor de IA sea comparable en vez de destructivo.
-- -----------------------------------------------------------------------------
CREATE TABLE public.sentiment_analysis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  mention_id uuid NOT NULL REFERENCES public.web_mentions(id) ON DELETE CASCADE,
  label public.sentiment_label NOT NULL,
  score numeric NOT NULL DEFAULT 0,
  matches integer NOT NULL DEFAULT 0,
  relevance numeric,
  engine text NOT NULL DEFAULT 'heuristic-es-v1',
  analyzed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sentiment_score_range CHECK (score >= -1 AND score <= 1),
  UNIQUE (mention_id, engine)
);
CREATE INDEX idx_sentiment_mention ON public.sentiment_analysis(mention_id);
CREATE INDEX idx_sentiment_org ON public.sentiment_analysis(org_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sentiment_analysis TO authenticated;
GRANT ALL ON public.sentiment_analysis TO service_role;
ALTER TABLE public.sentiment_analysis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sentiment read in org" ON public.sentiment_analysis
FOR SELECT TO authenticated
USING (org_id = public.current_org() OR public.is_super_admin());
CREATE POLICY "sentiment write in org" ON public.sentiment_analysis
FOR ALL TO authenticated
USING (org_id = public.current_org() AND public.can_analyze())
WITH CHECK (org_id = public.current_org() AND public.can_analyze());

-- -----------------------------------------------------------------------------
-- 6. Migración de los datos existentes
-- -----------------------------------------------------------------------------

-- La demografía plana se conserva como el año del censo mexicano vigente al
-- construirse el seed. Marcarla con su origen real evita que un dato de
-- demostración se confunda después con uno oficial.
INSERT INTO public.demographics (
  org_id, territorial_unit_id, population,
  age_0_17, age_18_29, age_30_44, age_45_59, age_60_plus,
  gender_female, gender_male, gender_other, households, source, year
)
SELECT
  u.org_id, u.id, u.population,
  u.pop_0_17, u.pop_18_29, u.pop_30_44, u.pop_45_59, u.pop_60_plus,
  u.women, u.men, u.gender_other, u.households,
  COALESCE(NULLIF(u.source, ''), 'manual'), 2020
FROM public.territorial_units u
ON CONFLICT (territorial_unit_id, source, year) DO NOTHING;

INSERT INTO public.territorial_geometries (
  org_id, territorial_unit_id, geometry, geometry_type, centroid_lat, centroid_lng, source
)
SELECT
  u.org_id, u.id, u.geometry,
  COALESCE(u.geometry->>'type', 'Polygon'),
  u.centroid_lat, u.centroid_lng,
  COALESCE(NULLIF(u.source, ''), 'manual')
FROM public.territorial_units u
WHERE u.geometry IS NOT NULL
ON CONFLICT (territorial_unit_id, source) DO NOTHING;

-- Los booleanos de consentimiento se convierten en registros con fecha.
INSERT INTO public.contact_consents (org_id, contact_id, consent_type, granted, granted_at, method, notes)
SELECT c.org_id, c.id, 'storage', c.consent_storage,
       COALESCE(c.consent_at, c.registered_at, c.created_at), 'form',
       'Migrado desde el campo consent_storage del esquema inicial'
FROM public.contacts c
WHERE c.consent_storage = true;

INSERT INTO public.contact_consents (org_id, contact_id, consent_type, granted, granted_at, method, notes)
SELECT c.org_id, c.id, 'communications', c.consent_comms,
       COALESCE(c.consent_at, c.registered_at, c.created_at), 'form',
       'Migrado desde el campo consent_comms del esquema inicial'
FROM public.contacts c
WHERE c.consent_comms = true;

-- El sentimiento existente se atribuye a 'seed' y no al motor heurístico: no lo
-- produjo, y marcarlo como tal falsearía cualquier comparación posterior.
INSERT INTO public.sentiment_analysis (org_id, mention_id, label, score, engine, analyzed_at)
SELECT m.org_id, m.id, COALESCE(m.sentiment, 'neutral'),
       GREATEST(-1, LEAST(1, COALESCE(m.sentiment_score, 0))), 'seed', m.created_at
FROM public.web_mentions m
ON CONFLICT (mention_id, engine) DO NOTHING;

INSERT INTO public.topics (org_id, name, slug, mention_count, first_seen_at, last_seen_at)
SELECT m.org_id, m.topic, lower(m.topic), count(*), min(m.published_at), max(m.published_at)
FROM public.web_mentions m
WHERE m.topic IS NOT NULL AND m.topic <> ''
GROUP BY m.org_id, m.topic
ON CONFLICT (org_id, slug) DO NOTHING;

INSERT INTO public.mention_topics (mention_id, topic_id, org_id, weight)
SELECT m.id, t.id, m.org_id, 1
FROM public.web_mentions m
JOIN public.topics t ON t.org_id = m.org_id AND t.slug = lower(m.topic)
WHERE m.topic IS NOT NULL AND m.topic <> ''
ON CONFLICT DO NOTHING;

-- -----------------------------------------------------------------------------
-- 7. Vistas de lectura
-- security_invoker = true es obligatorio: por omisión una vista se ejecuta con
-- los privilegios de su dueño, lo que dejaría a cualquier usuario leer los datos
-- de todas las organizaciones a través de la vista.
-- -----------------------------------------------------------------------------

-- Última demografía conocida por unidad: la del año más reciente cargado.
CREATE VIEW public.territorial_units_summary
WITH (security_invoker = true) AS
SELECT
  u.id,
  u.org_id,
  u.section_code,
  u.municipio,
  u.localidad,
  COALESCE(d.population, u.population) AS population,
  COALESCE(d.age_0_17, 0) AS pop_0_17,
  COALESCE(d.age_18_29, 0) AS pop_18_29,
  COALESCE(d.age_30_44, 0) AS pop_30_44,
  COALESCE(d.age_45_59, 0) AS pop_45_59,
  COALESCE(d.age_60_plus, 0) AS pop_60_plus,
  COALESCE(d.gender_female, 0) AS women,
  COALESCE(d.gender_male, 0) AS men,
  COALESCE(d.gender_other, 0) AS gender_other,
  COALESCE(d.households, 0) AS households,
  d.source AS demographics_source,
  d.year AS demographics_year,
  g.centroid_lat,
  g.centroid_lng,
  (g.id IS NOT NULL) AS has_geometry,
  u.created_at
FROM public.territorial_units u
LEFT JOIN LATERAL (
  SELECT * FROM public.demographics dd
  WHERE dd.territorial_unit_id = u.id
  ORDER BY dd.year DESC, dd.created_at DESC
  LIMIT 1
) d ON true
LEFT JOIN LATERAL (
  SELECT * FROM public.territorial_geometries gg
  WHERE gg.territorial_unit_id = u.id
  ORDER BY gg.created_at DESC
  LIMIT 1
) g ON true;

-- Igual que la anterior pero con el polígono. Se consulta solo cuando el mapa
-- necesita dibujar, nunca para poblar tablas o selectores.
CREATE VIEW public.territorial_units_detailed
WITH (security_invoker = true) AS
SELECT s.*, g.geometry, g.geometry_type
FROM public.territorial_units_summary s
LEFT JOIN LATERAL (
  SELECT * FROM public.territorial_geometries gg
  WHERE gg.territorial_unit_id = s.id
  ORDER BY gg.created_at DESC
  LIMIT 1
) g ON true;

GRANT SELECT ON public.territorial_units_summary TO authenticated;
GRANT SELECT ON public.territorial_units_detailed TO authenticated;

-- Estado vigente del consentimiento por contacto y tipo.
CREATE VIEW public.contact_consent_status
WITH (security_invoker = true) AS
SELECT DISTINCT ON (cc.contact_id, cc.consent_type)
  cc.contact_id,
  cc.org_id,
  cc.consent_type,
  (cc.granted AND cc.revoked_at IS NULL) AS active,
  cc.granted_at,
  cc.revoked_at,
  cc.method
FROM public.contact_consents cc
ORDER BY cc.contact_id, cc.consent_type, cc.granted_at DESC;

GRANT SELECT ON public.contact_consent_status TO authenticated;

-- -----------------------------------------------------------------------------
-- 8. Las columnas planas quedan marcadas como obsoletas
-- No se eliminan en esta migración: hacerlo rompería cualquier consulta en
-- vuelo. La aplicación pasa a leer de las vistas y a escribir por las funciones
-- de abajo; el DROP va en una migración posterior, ya sin lectores.
-- -----------------------------------------------------------------------------
COMMENT ON COLUMN public.territorial_units.population IS 'OBSOLETO: usa demographics.population vía territorial_units_summary';
COMMENT ON COLUMN public.territorial_units.pop_0_17 IS 'OBSOLETO: usa demographics.age_0_17';
COMMENT ON COLUMN public.territorial_units.geometry IS 'OBSOLETO: usa territorial_geometries.geometry';
COMMENT ON COLUMN public.contacts.consent_storage IS 'OBSOLETO como historial: la traza vive en contact_consents. Se conserva porque el CHECK de consentimiento obligatorio depende de él.';

-- -----------------------------------------------------------------------------
-- 9. Escritura atómica
-- Importar una sección toca tres tablas. Sin una función que las escriba juntas,
-- un fallo a mitad dejaría unidades sin demografía o geometría huérfana.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_territorial_unit(
  _section_code text,
  _municipio text,
  _localidad text,
  _demographics jsonb,
  _geometry jsonb,
  _source text,
  _year integer
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _org uuid := public.current_org();
  _unit uuid;
  _pop integer := COALESCE((_demographics->>'population')::integer, 0);
BEGIN
  IF _org IS NULL THEN
    RAISE EXCEPTION 'Sin organización asignada';
  END IF;
  IF NOT public.can_admin() THEN
    RAISE EXCEPTION 'Se requiere rol ADMIN para importar territorios';
  END IF;
  IF _section_code IS NULL OR trim(_section_code) = '' THEN
    RAISE EXCEPTION 'La sección es obligatoria';
  END IF;
  IF _municipio IS NULL OR trim(_municipio) = '' THEN
    RAISE EXCEPTION 'El municipio es obligatorio';
  END IF;

  INSERT INTO public.territorial_units (org_id, section_code, municipio, localidad, population, source)
  VALUES (_org, trim(_section_code), trim(_municipio), NULLIF(trim(COALESCE(_localidad, '')), ''), _pop, _source)
  ON CONFLICT (org_id, section_code) DO UPDATE
    SET municipio = EXCLUDED.municipio,
        localidad = EXCLUDED.localidad,
        population = EXCLUDED.population
  RETURNING id INTO _unit;

  IF _demographics IS NOT NULL THEN
    INSERT INTO public.demographics (
      org_id, territorial_unit_id, population,
      age_0_17, age_18_29, age_30_44, age_45_59, age_60_plus,
      gender_female, gender_male, gender_other, households, source, year
    )
    VALUES (
      _org, _unit, _pop,
      COALESCE((_demographics->>'age_0_17')::integer, 0),
      COALESCE((_demographics->>'age_18_29')::integer, 0),
      COALESCE((_demographics->>'age_30_44')::integer, 0),
      COALESCE((_demographics->>'age_45_59')::integer, 0),
      COALESCE((_demographics->>'age_60_plus')::integer, 0),
      COALESCE((_demographics->>'gender_female')::integer, 0),
      COALESCE((_demographics->>'gender_male')::integer, 0),
      COALESCE((_demographics->>'gender_other')::integer, 0),
      COALESCE((_demographics->>'households')::integer, 0),
      _source, COALESCE(_year, EXTRACT(YEAR FROM now())::integer)
    )
    ON CONFLICT (territorial_unit_id, source, year) DO UPDATE
      SET population = EXCLUDED.population,
          age_0_17 = EXCLUDED.age_0_17,
          age_18_29 = EXCLUDED.age_18_29,
          age_30_44 = EXCLUDED.age_30_44,
          age_45_59 = EXCLUDED.age_45_59,
          age_60_plus = EXCLUDED.age_60_plus,
          gender_female = EXCLUDED.gender_female,
          gender_male = EXCLUDED.gender_male,
          gender_other = EXCLUDED.gender_other,
          households = EXCLUDED.households;
  END IF;

  IF _geometry IS NOT NULL AND _geometry->>'type' IS NOT NULL THEN
    INSERT INTO public.territorial_geometries (
      org_id, territorial_unit_id, geometry, geometry_type,
      centroid_lat, centroid_lng, source
    )
    VALUES (
      _org, _unit, _geometry, _geometry->>'type',
      (_demographics->>'centroid_lat')::double precision,
      (_demographics->>'centroid_lng')::double precision,
      _source
    )
    ON CONFLICT (territorial_unit_id, source) DO UPDATE
      SET geometry = EXCLUDED.geometry,
          geometry_type = EXCLUDED.geometry_type,
          centroid_lat = EXCLUDED.centroid_lat,
          centroid_lng = EXCLUDED.centroid_lng;
  END IF;

  RETURN _unit;
END; $$;

REVOKE ALL ON FUNCTION public.upsert_territorial_unit(text, text, text, jsonb, jsonb, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_territorial_unit(text, text, text, jsonb, jsonb, text, integer) TO authenticated;

-- Registra un consentimiento manteniendo sincronizado el booleano de contacts,
-- del que depende el CHECK de consentimiento obligatorio.
CREATE OR REPLACE FUNCTION public.record_consent(
  _contact_id uuid,
  _consent_type text,
  _granted boolean,
  _method text DEFAULT 'form',
  _notes text DEFAULT NULL
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _org uuid := public.current_org();
  _id uuid;
BEGIN
  IF _org IS NULL OR NOT public.can_admin() THEN
    RAISE EXCEPTION 'Se requiere rol ADMIN en la organización';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.contacts WHERE id = _contact_id AND org_id = _org) THEN
    RAISE EXCEPTION 'El contacto no pertenece a tu organización';
  END IF;

  -- Revocar cierra el registro vigente en vez de borrarlo: la traza es el punto.
  UPDATE public.contact_consents
  SET revoked_at = now()
  WHERE contact_id = _contact_id
    AND consent_type = _consent_type
    AND revoked_at IS NULL
    AND granted = true
    AND _granted = false;

  INSERT INTO public.contact_consents
    (org_id, contact_id, consent_type, granted, method, notes, recorded_by)
  VALUES (_org, _contact_id, _consent_type, _granted, _method, _notes, auth.uid())
  RETURNING id INTO _id;

  IF _consent_type = 'storage' THEN
    UPDATE public.contacts SET consent_storage = _granted, consent_at = now() WHERE id = _contact_id;
  ELSE
    UPDATE public.contacts SET consent_comms = _granted WHERE id = _contact_id;
  END IF;

  RETURN _id;
END; $$;

REVOKE ALL ON FUNCTION public.record_consent(uuid, text, boolean, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_consent(uuid, text, boolean, text, text) TO authenticated;
