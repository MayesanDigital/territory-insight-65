-- =============================================================================
-- Nivel de pobreza por sección y pobreza municipal oficial
-- =============================================================================
-- section_marginacion: índice de marginación por sección electoral, calculado
-- con el método de CONAPO (DP2 + Dalenius–Hodges) sobre las carencias del Censo
-- 2020 asignado a sección (ECEG). Lo genera scripts/ine/build-marginacion.py.
--
-- municipal_poverty: porcentaje y personas en pobreza por municipio, medición
-- oficial de CONEVAL 2020. Es la escala más fina que publica.
--
-- Ambas son datos de referencia agregados: se cargan con la clave de servicio y
-- desde la app solo se leen.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.section_marginacion (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  /* Clave a cuatro dígitos, igual que territorial_units.section_code. */
  section_code text NOT NULL,
  /* Índice normalizado 0–100: 100 es la sección más marginada del estado. */
  index_value numeric(7,4) NOT NULL,
  /* Distancia DP2 sin normalizar, por si se recalculan cortes. */
  dp2 numeric(12,6) NOT NULL,
  grade text NOT NULL
    CONSTRAINT section_marginacion_grado CHECK (grade IN ('muy_alto', 'alto', 'medio', 'bajo', 'muy_bajo')),
  /* 1 = sección más marginada del estado. */
  state_rank integer NOT NULL CONSTRAINT section_marginacion_rank CHECK (state_rank > 0),
  population integer NOT NULL DEFAULT 0,
  /* Porcentaje de cada carencia usada en el índice. */
  indicators jsonb NOT NULL DEFAULT '{}'::jsonb,
  source text NOT NULL DEFAULT 'conapo-dp2-eceg-2020',
  year integer NOT NULL DEFAULT 2020,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, section_code, source, year)
);

CREATE INDEX IF NOT EXISTS idx_section_marginacion_rank
  ON public.section_marginacion (org_id, state_rank);

ALTER TABLE public.section_marginacion ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.section_marginacion TO authenticated;
GRANT ALL ON public.section_marginacion TO service_role;

DROP POLICY IF EXISTS "marginacion read in org" ON public.section_marginacion;
CREATE POLICY "marginacion read in org" ON public.section_marginacion
FOR SELECT TO authenticated
USING (org_id = public.current_org() OR public.is_super_admin());


CREATE TABLE IF NOT EXISTS public.municipal_poverty (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  municipio text NOT NULL,
  /* Mayúsculas sin acentos, para cruzar con el catálogo del INE. */
  municipio_key text NOT NULL,
  municipio_code text,
  population integer NOT NULL DEFAULT 0,
  poverty_pct numeric(6,2) NOT NULL,
  poverty_people integer NOT NULL DEFAULT 0,
  extreme_poverty_pct numeric(6,2) NOT NULL,
  extreme_poverty_people integer NOT NULL DEFAULT 0,
  moderate_poverty_pct numeric(6,2),
  source text NOT NULL DEFAULT 'coneval-2020',
  year integer NOT NULL DEFAULT 2020,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, municipio_key, source, year)
);

ALTER TABLE public.municipal_poverty ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.municipal_poverty TO authenticated;
GRANT ALL ON public.municipal_poverty TO service_role;

DROP POLICY IF EXISTS "pobreza municipal read in org" ON public.municipal_poverty;
CREATE POLICY "pobreza municipal read in org" ON public.municipal_poverty
FOR SELECT TO authenticated
USING (org_id = public.current_org() OR public.is_super_admin());
