-- =============================================================================
-- Resultados electorales por sección
--
-- Guarda el resultado oficial de cada proceso electoral a nivel sección, para
-- comparar el desempeño territorial entre elecciones.
--
-- Qué son estos datos: cifras oficiales, públicas y AGREGADAS por sección,
-- publicadas por el INE y el IEEZ. No describen a ninguna persona. El principio
-- de la plataforma —no inferir ni almacenar preferencias políticas de personas—
-- se mantiene intacto: aquí no hay ningún vínculo con la tabla de contactos.
--
-- Por qué `resultados` es jsonb y no columnas por partido: cada elección tiene
-- partidos y coaliciones distintos. Con columnas fijas, cada nuevo proceso
-- exigiría una migración; con jsonb, el importador decide la composición y la
-- interfaz la lee tal cual.
--
-- Los votos se guardan agrupados en BLOQUES, no por partido suelto. En una
-- coalición el voto se reparte entre la columna de cada partido y las columnas
-- de cada combinación marcada en la boleta; sumar solo "MORENA" perdería los
-- votos emitidos marcando MORENA junto al PT. Ver scripts/etl_resultados_electorales.py.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.section_election_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- Clave de sección a cuatro dígitos, igual que territorial_units.section_code.
  -- Sin FK a propósito: hay secciones con resultado histórico que ya no existen
  -- en el catálogo vigente por el reseccionamiento, y perderlas falsearía el
  -- comparativo de las que sí siguen vivas.
  section_code text NOT NULL,

  election_year integer NOT NULL,
  election_type text NOT NULL,
  election_label text NOT NULL,

  lista_nominal integer NOT NULL DEFAULT 0,
  total_votos integer NOT NULL DEFAULT 0,
  votos_nulos integer NOT NULL DEFAULT 0,
  no_registrados integer NOT NULL DEFAULT 0,
  actas integer NOT NULL DEFAULT 0,
  participacion numeric(5, 2),

  /* Bloque más votado. Redundante con `resultados`, pero evita desempaquetar el
     jsonb para pintar el mapa por fuerza ganadora. */
  ganador text,

  /* [{ bloque, etiqueta, votos, porcentaje }], ordenado de mayor a menor. */
  resultados jsonb NOT NULL DEFAULT '[]'::jsonb,

  source text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT section_election_results_unica
    UNIQUE (org_id, section_code, election_year, election_type)
);

COMMENT ON TABLE public.section_election_results IS
  'Resultados electorales oficiales agregados por sección. Datos públicos del '
  'INE y el IEEZ; no contienen información de personas.';

CREATE INDEX IF NOT EXISTS idx_resultados_seccion
  ON public.section_election_results(org_id, section_code);

CREATE INDEX IF NOT EXISTS idx_resultados_proceso
  ON public.section_election_results(org_id, election_year, election_type);

-- RLS con el mismo criterio que territorial_units: lectura para la organización,
-- escritura solo para administradores.
ALTER TABLE public.section_election_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "resultados read in org" ON public.section_election_results;
CREATE POLICY "resultados read in org" ON public.section_election_results
FOR SELECT TO authenticated
USING (org_id = public.current_org() OR public.is_super_admin());

DROP POLICY IF EXISTS "resultados write in org" ON public.section_election_results;
CREATE POLICY "resultados write in org" ON public.section_election_results
FOR ALL TO authenticated
USING (org_id = public.current_org() AND public.can_admin())
WITH CHECK (org_id = public.current_org() AND public.can_admin());
