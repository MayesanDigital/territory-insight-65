-- =============================================================================
-- Ficha de la candidatura y metas de contacto por sección
--
-- Dos necesidades distintas que comparten migración porque llegan juntas:
--
--   candidates      La campaña que usa la plataforma. Una por organización, con
--                   nombre, fotografía y datos de la elección que persigue. Se
--                   muestra en la cabecera para dar contexto a todo lo demás.
--
--   section_goals   Objetivo de contactos que la campaña se fija en cada sección,
--                   capturado a mano. Permite medir avance real: cuántos de los
--                   contactos previstos ya se registraron y cómo se reparten
--                   entre fidelizados y seguros.
--
-- Ninguna de las dos guarda datos de personas ajenas a la campaña.
-- =============================================================================

-- --- Candidatura --------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  full_name text NOT NULL,
  /* URL de la fotografía. Se admite cualquier origen accesible por HTTPS para no
     obligar a montar almacenamiento antes de poder usar la ficha. */
  photo_url text,
  cargo text,
  partido text,
  municipio text,
  distrito text,
  eslogan text,
  /* Fecha de la jornada electoral, para la cuenta atrás de la cabecera. */
  fecha_eleccion date,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Una sola candidatura por organización: la cabecera no tendría cuál elegir.
  CONSTRAINT candidates_una_por_org UNIQUE (org_id)
);

COMMENT ON TABLE public.candidates IS
  'Ficha de la candidatura que opera la plataforma. Una por organización.';

ALTER TABLE public.candidates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "candidato read in org" ON public.candidates;
CREATE POLICY "candidato read in org" ON public.candidates
FOR SELECT TO authenticated
USING (org_id = public.current_org() OR public.is_super_admin());

DROP POLICY IF EXISTS "candidato write in org" ON public.candidates;
CREATE POLICY "candidato write in org" ON public.candidates
FOR ALL TO authenticated
USING (org_id = public.current_org() AND public.can_admin())
WITH CHECK (org_id = public.current_org() AND public.can_admin());

-- --- Metas por sección --------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.section_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  /* Clave a cuatro dígitos, igual que territorial_units.section_code. Sin FK por
     el mismo motivo que en los resultados electorales: el reseccionamiento deja
     claves que ya no están en el catálogo vigente y perder la meta fijada sobre
     ellas sería peor que conservarla huérfana. */
  section_code text NOT NULL,

  meta_contactos integer NOT NULL DEFAULT 0
    CONSTRAINT section_goals_meta_no_negativa CHECK (meta_contactos >= 0),

  notas text,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT section_goals_una_por_seccion UNIQUE (org_id, section_code)
);

COMMENT ON TABLE public.section_goals IS
  'Meta de contactos por sección, capturada manualmente por la campaña.';

CREATE INDEX IF NOT EXISTS idx_section_goals_seccion
  ON public.section_goals(org_id, section_code);

ALTER TABLE public.section_goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "metas read in org" ON public.section_goals;
CREATE POLICY "metas read in org" ON public.section_goals
FOR SELECT TO authenticated
USING (org_id = public.current_org() OR public.is_super_admin());

DROP POLICY IF EXISTS "metas write in org" ON public.section_goals;
CREATE POLICY "metas write in org" ON public.section_goals
FOR ALL TO authenticated
USING (org_id = public.current_org() AND public.can_admin())
WITH CHECK (org_id = public.current_org() AND public.can_admin());
