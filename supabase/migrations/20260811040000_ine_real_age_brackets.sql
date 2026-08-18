-- =============================================================================
-- Rangos de edad reales de la fuente, y metadatos de sección electoral
--
-- El PRD §6 pide las franjas 0–17, 18–29, 30–44, 45–59 y 60+. Los datos que
-- realmente publica el INE/INEGI a escala de sección electoral (ECEG 2020) no
-- tienen cortes en 29, 44 ni 59: solo P_0A17, P_18A24, P_18YMAS y P_60YMAS.
--
-- Inventar los tres rangos intermedios exigiría repartir población con una
-- distribución supuesta, y el resultado se mostraría en la interfaz como si
-- fuera un dato del censo. Se prefiere reflejar la fuente:
--
--     0–17   = P_0A17                             (exacto)
--     18–24  = P_18A24                            (exacto)
--     25–59  = P_18YMAS − P_18A24 − P_60YMAS      (derivado por resta)
--     60+    = P_60YMAS                           (exacto)
--
-- Los 227 indicadores del ECEG se conservan íntegros en `indicators`, así que
-- nada de lo descargado se pierde por no caber en una columna.
-- =============================================================================

DROP VIEW IF EXISTS public.territorial_units_detailed;
DROP VIEW IF EXISTS public.territorial_units_summary;

ALTER TABLE public.demographics
  RENAME COLUMN age_18_29 TO age_18_24;
ALTER TABLE public.demographics
  RENAME COLUMN age_30_44 TO age_25_59;

-- Las filas ya cargadas (datos de demostración) se consolidan en el nuevo rango
-- para no perder el total de población adulta.
UPDATE public.demographics SET age_25_59 = age_25_59 + age_45_59 WHERE age_45_59 > 0;
ALTER TABLE public.demographics DROP COLUMN age_45_59;

ALTER TABLE public.demographics
  ADD COLUMN IF NOT EXISTS adults_18_plus integer NOT NULL DEFAULT 0,
  -- Los 227 indicadores del ECEG: escolaridad, vivienda, servicios, salud,
  -- discapacidad. No caben como columnas y tampoco deben perderse.
  ADD COLUMN IF NOT EXISTS indicators jsonb;

ALTER TABLE public.demographics
  DROP CONSTRAINT IF EXISTS demographics_non_negative,
  ADD CONSTRAINT demographics_non_negative CHECK (
    population >= 0 AND age_0_17 >= 0 AND age_18_24 >= 0 AND age_25_59 >= 0
    AND age_60_plus >= 0 AND gender_female >= 0 AND gender_male >= 0
    AND gender_other >= 0 AND households >= 0 AND adults_18_plus >= 0
  );

COMMENT ON COLUMN public.demographics.age_25_59 IS
  'Derivado: P_18YMAS - P_18A24 - P_60YMAS. La fuente no publica cortes en 29, 44 ni 59.';
COMMENT ON COLUMN public.demographics.indicators IS
  'Payload completo del ECEG (227 indicadores del Censo 2020 a escala seccional).';

-- -----------------------------------------------------------------------------
-- Metadatos propios de la sección electoral
-- -----------------------------------------------------------------------------
ALTER TABLE public.territorial_units
  ADD COLUMN IF NOT EXISTS district integer,
  ADD COLUMN IF NOT EXISTS section_type text,
  -- La cartografía del INE es de 2021 y el catálogo vigente de 2026. El
  -- reseccionamiento 2025-2026 hace que ambos conjuntos no coincidan, y esa
  -- diferencia debe verse en la interfaz en vez de disimularse.
  ADD COLUMN IF NOT EXISTS data_status text NOT NULL DEFAULT 'complete';

ALTER TABLE public.territorial_units
  DROP CONSTRAINT IF EXISTS territorial_units_data_status_valid,
  ADD CONSTRAINT territorial_units_data_status_valid
  CHECK (data_status IN ('complete', 'catalog_only', 'census_only'));

COMMENT ON COLUMN public.territorial_units.data_status IS
  'complete: geometría + censo + catálogo vigente. '
  'catalog_only: sección vigente sin datos censales (creada en el reseccionamiento). '
  'census_only: sección con censo y geometría pero ya extinta en el catálogo vigente.';

CREATE INDEX IF NOT EXISTS idx_units_status ON public.territorial_units(data_status);

-- -----------------------------------------------------------------------------
-- Vistas reconstruidas
-- -----------------------------------------------------------------------------
CREATE VIEW public.territorial_units_summary
WITH (security_invoker = true) AS
SELECT
  u.id,
  u.org_id,
  u.section_code,
  u.municipio,
  u.localidad,
  u.district,
  u.section_type,
  u.data_status,
  COALESCE(d.population, u.population) AS population,
  COALESCE(d.age_0_17, 0) AS pop_0_17,
  COALESCE(d.age_18_24, 0) AS pop_18_24,
  COALESCE(d.age_25_59, 0) AS pop_25_59,
  COALESCE(d.age_60_plus, 0) AS pop_60_plus,
  COALESCE(d.adults_18_plus, 0) AS adults_18_plus,
  COALESCE(d.gender_female, 0) AS women,
  COALESCE(d.gender_male, 0) AS men,
  COALESCE(d.gender_other, 0) AS gender_other,
  COALESCE(d.households, 0) AS households,
  d.source AS demographics_source,
  d.year AS demographics_year,
  (d.id IS NOT NULL) AS has_demographics,
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

-- -----------------------------------------------------------------------------
-- upsert_territorial_unit actualizado
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.upsert_territorial_unit(text, text, text, jsonb, jsonb, text, integer);

CREATE OR REPLACE FUNCTION public.upsert_territorial_unit(
  _section_code text,
  _municipio text,
  _localidad text,
  _demographics jsonb,
  _geometry jsonb,
  _source text,
  _year integer,
  _district integer DEFAULT NULL,
  _section_type text DEFAULT NULL,
  _data_status text DEFAULT 'complete'
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

  INSERT INTO public.territorial_units
    (org_id, section_code, municipio, localidad, population, source, district, section_type, data_status)
  VALUES (
    _org, trim(_section_code), trim(_municipio),
    NULLIF(trim(COALESCE(_localidad, '')), ''), _pop, _source,
    _district, _section_type, COALESCE(_data_status, 'complete')
  )
  ON CONFLICT (org_id, section_code) DO UPDATE
    SET municipio = EXCLUDED.municipio,
        localidad = EXCLUDED.localidad,
        population = EXCLUDED.population,
        district = COALESCE(EXCLUDED.district, territorial_units.district),
        section_type = COALESCE(EXCLUDED.section_type, territorial_units.section_type),
        data_status = EXCLUDED.data_status
  RETURNING id INTO _unit;

  IF _demographics IS NOT NULL AND _demographics ? 'population' THEN
    INSERT INTO public.demographics (
      org_id, territorial_unit_id, population,
      age_0_17, age_18_24, age_25_59, age_60_plus, adults_18_plus,
      gender_female, gender_male, gender_other, households, indicators, source, year
    )
    VALUES (
      _org, _unit, _pop,
      COALESCE((_demographics->>'age_0_17')::integer, 0),
      COALESCE((_demographics->>'age_18_24')::integer, 0),
      COALESCE((_demographics->>'age_25_59')::integer, 0),
      COALESCE((_demographics->>'age_60_plus')::integer, 0),
      COALESCE((_demographics->>'adults_18_plus')::integer, 0),
      COALESCE((_demographics->>'gender_female')::integer, 0),
      COALESCE((_demographics->>'gender_male')::integer, 0),
      COALESCE((_demographics->>'gender_other')::integer, 0),
      COALESCE((_demographics->>'households')::integer, 0),
      _demographics->'indicators',
      _source, COALESCE(_year, EXTRACT(YEAR FROM now())::integer)
    )
    ON CONFLICT (territorial_unit_id, source, year) DO UPDATE
      SET population = EXCLUDED.population,
          age_0_17 = EXCLUDED.age_0_17,
          age_18_24 = EXCLUDED.age_18_24,
          age_25_59 = EXCLUDED.age_25_59,
          age_60_plus = EXCLUDED.age_60_plus,
          adults_18_plus = EXCLUDED.adults_18_plus,
          gender_female = EXCLUDED.gender_female,
          gender_male = EXCLUDED.gender_male,
          gender_other = EXCLUDED.gender_other,
          households = EXCLUDED.households,
          indicators = EXCLUDED.indicators;
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

REVOKE ALL ON FUNCTION public.upsert_territorial_unit(text, text, text, jsonb, jsonb, text, integer, integer, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_territorial_unit(text, text, text, jsonb, jsonb, text, integer, integer, text, text) TO authenticated;
