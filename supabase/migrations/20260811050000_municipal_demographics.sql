-- =============================================================================
-- Demografía municipal con los rangos de edad del PRD
--
-- Los rangos del PRD §6 (18–29, 30–44, 45–59) no son obtenibles a escala de
-- sección: el INEGI solo publica grupos quinquenales a nivel LOCALIDAD, y la
-- asignación a sección electoral exige granularidad de MANZANA, donde esos
-- grupos están suprimidos por confidencialidad (0 de 18 presentes).
--
-- A nivel municipio, en cambio, el ITER agrega limpio y los rangos son exactos.
-- Esta tabla los guarda para el módulo de Analytics, que compara municipios.
-- La malla seccional conserva sus propios rangos (0–17, 18–24, 25–59, 60+),
-- que son los que su fuente permite.
--
-- Las dos fuentes coinciden a la persona: 1,622,138 habitantes tanto sumando
-- las 1,777 secciones del ECEG como los 58 municipios del ITER.
-- =============================================================================

CREATE TABLE public.municipal_demographics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  municipio text NOT NULL,
  /** Nombre normalizado (mayúsculas, sin acentos) para cruzar con el catálogo del INE. */
  municipio_key text NOT NULL,
  municipio_code text,
  population integer NOT NULL DEFAULT 0,
  age_0_17 integer NOT NULL DEFAULT 0,
  age_18_29 integer NOT NULL DEFAULT 0,
  age_30_44 integer NOT NULL DEFAULT 0,
  age_45_59 integer NOT NULL DEFAULT 0,
  age_60_plus integer NOT NULL DEFAULT 0,
  -- El censo deja población sin edad declarada; sin esta columna la suma de
  -- rangos no cuadraría con el total y parecería un error de carga.
  age_unspecified integer NOT NULL DEFAULT 0,
  gender_female integer NOT NULL DEFAULT 0,
  gender_male integer NOT NULL DEFAULT 0,
  households integer NOT NULL DEFAULT 0,
  indicators jsonb,
  source text NOT NULL DEFAULT 'inegi-iter-2020',
  year integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT municipal_year_valid CHECK (year BETWEEN 1900 AND 2200),
  UNIQUE (org_id, municipio_key, source, year)
);

CREATE INDEX idx_municipal_demo_org ON public.municipal_demographics(org_id);
CREATE INDEX idx_municipal_demo_key ON public.municipal_demographics(municipio_key);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.municipal_demographics TO authenticated;
GRANT ALL ON public.municipal_demographics TO service_role;
ALTER TABLE public.municipal_demographics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "municipal demo read in org" ON public.municipal_demographics
FOR SELECT TO authenticated
USING (org_id = public.current_org() OR public.is_super_admin());

CREATE POLICY "municipal demo write in org" ON public.municipal_demographics
FOR ALL TO authenticated
USING (org_id = public.current_org() AND public.can_admin())
WITH CHECK (org_id = public.current_org() AND public.can_admin());

CREATE TRIGGER municipal_demographics_updated_at BEFORE UPDATE ON public.municipal_demographics
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.municipal_demographics IS
  'Demografía por municipio del Censo 2020 (INEGI, ITER). Es la única escala en '
  'la que los rangos de edad del PRD son exactos; a nivel sección la fuente no '
  'publica cortes en 29, 44 ni 59.';
