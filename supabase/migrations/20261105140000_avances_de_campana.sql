-- =============================================================================
-- Avances de campaña: mediciones por sección y agenda de visitas
-- =============================================================================
-- El ciclo que se opera en campo tiene tres pasos por sección, y el orden no es
-- casual:
--
--   1. Primera medición. Se levantan muestras en la sección ANTES de que el
--      candidato ponga un pie ahí. Mide el punto de partida y, sobre todo,
--      recoge con palabras de la gente qué necesita el territorio.
--   2. Visita del candidato, dos días después, con un discurso construido a
--      partir de esas respuestas.
--   3. Segunda medición, dos días después de la visita. Mide si la visita movió
--      el conocimiento y la aceptación del candidato.
--
-- Las dos mediciones van en la MISMA tabla, distinguidas por `etapa`. Separarlas
-- en dos tablas obligaría a unirlas para cada comparación, que es lo único que
-- se hace con ellas.
--
-- Datos personales: `nombre` es opcional a propósito —una encuesta de intención
-- de voto se responde mejor sin dar el nombre— y cuando se llena queda sujeto a
-- la misma RLS por organización que los contactos. No se guarda teléfono, ni
-- dirección, ni ningún otro identificador.
-- =============================================================================

-- --- Respuestas de las mediciones --------------------------------------------

CREATE TABLE IF NOT EXISTS public.survey_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  /* Clave a cuatro dígitos, igual que territorial_units.section_code. Sin FK por
     el mismo motivo que en los resultados electorales: el reseccionamiento deja
     claves fuera del catálogo vigente, y perder las muestras levantadas sobre
     ellas sería peor que conservarlas huérfanas. */
  section_code text NOT NULL,

  /* 'medicion'   - primera medición, antes de la visita.
     'resultados' - segunda medición, después de la visita. */
  etapa text NOT NULL
    CONSTRAINT survey_responses_etapa_valida CHECK (etapa IN ('medicion', 'resultados')),

  nombre text,

  /* Común a las dos etapas: es la única pregunta que permite compararlas.
     Se guarda codificado y no en texto libre porque de aquí salen los
     porcentajes: morena, Morena y 4T escritos a mano serían tres respuestas
     distintas. Siglas del catálogo, o NO_SABE / NINGUNO / OTRO. */
  voto_partido text,
  /* Lo que respondió con sus palabras, si dio un nombre. Complementa al código,
     no lo sustituye. */
  voto_detalle text,

  -- Solo primera medición.
  promesas_incumplidas text,
  necesidad_entidad text,
  necesidad_municipio text,

  -- Solo segunda medición. Nulo significa que no se preguntó, no que dijera no.
  conoce_candidato boolean,
  cree_cambio boolean,
  votaria_por_el boolean,

  notas text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.survey_responses IS
  'Muestras levantadas en una seccion, antes (etapa=medicion) y despues (etapa=resultados) de la visita del candidato.';
COMMENT ON COLUMN public.survey_responses.voto_partido IS
  'Siglas del catalogo de partidos, o NO_SABE / NINGUNO / OTRO.';

CREATE INDEX IF NOT EXISTS idx_survey_responses_seccion
  ON public.survey_responses (org_id, section_code, etapa);

ALTER TABLE public.survey_responses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "encuestas read in org" ON public.survey_responses;
CREATE POLICY "encuestas read in org" ON public.survey_responses
  FOR SELECT TO authenticated
  USING ((org_id = ( SELECT public.current_org() )) OR ( SELECT public.is_super_admin() ));

/* Capturar es trabajo de campo: alcanza con poder escribir, igual que dar de
   alta un contacto. Corregir y borrar quedan en administración, porque una
   muestra retocada desplaza el porcentaje sin dejar rastro. */
DROP POLICY IF EXISTS "encuestas write in org insert" ON public.survey_responses;
CREATE POLICY "encuestas write in org insert" ON public.survey_responses
  FOR INSERT TO authenticated
  WITH CHECK ((org_id = ( SELECT public.current_org() )) AND ( SELECT public.can_write() ));
DROP POLICY IF EXISTS "encuestas write in org update" ON public.survey_responses;
CREATE POLICY "encuestas write in org update" ON public.survey_responses
  FOR UPDATE TO authenticated
  USING ((org_id = ( SELECT public.current_org() )) AND ( SELECT public.can_admin() ))
  WITH CHECK ((org_id = ( SELECT public.current_org() )) AND ( SELECT public.can_admin() ));
DROP POLICY IF EXISTS "encuestas write in org delete" ON public.survey_responses;
CREATE POLICY "encuestas write in org delete" ON public.survey_responses
  FOR DELETE TO authenticated
  USING ((org_id = ( SELECT public.current_org() )) AND ( SELECT public.can_admin() ));

-- --- Agenda del ciclo ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.campaign_agenda (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  section_code text NOT NULL,

  /* Los tres hitos del ciclo. Las fechas se guardan explícitas en vez de
     derivarlas de la primera: la separación de dos días es el plan, y en campo
     una visita se mueve sin que eso deba recalcular lo ya hecho. */
  fecha_medicion date NOT NULL,
  fecha_visita date NOT NULL,
  fecha_resultados date NOT NULL,

  estado text NOT NULL DEFAULT 'planeada'
    CONSTRAINT campaign_agenda_estado_valido
    CHECK (estado IN ('planeada', 'midiendo', 'visitada', 'cerrada')),

  notas text,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),

  -- Un ciclo por sección: dos filas abiertas a la vez no dirían en qué paso va.
  CONSTRAINT campaign_agenda_una_por_seccion UNIQUE (org_id, section_code),

  /* El orden de los hitos es el método, no una preferencia: medir después de la
     visita ya no mide el punto de partida. */
  CONSTRAINT campaign_agenda_orden CHECK (
    fecha_visita >= fecha_medicion AND fecha_resultados >= fecha_visita
  )
);

COMMENT ON TABLE public.campaign_agenda IS
  'Ciclo planeado en cada seccion: primera medicion, visita del candidato y segunda medicion.';

CREATE INDEX IF NOT EXISTS idx_campaign_agenda_fechas
  ON public.campaign_agenda (org_id, fecha_medicion);

ALTER TABLE public.campaign_agenda ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agenda read in org" ON public.campaign_agenda;
CREATE POLICY "agenda read in org" ON public.campaign_agenda
  FOR SELECT TO authenticated
  USING ((org_id = ( SELECT public.current_org() )) OR ( SELECT public.is_super_admin() ));

DROP POLICY IF EXISTS "agenda write in org insert" ON public.campaign_agenda;
CREATE POLICY "agenda write in org insert" ON public.campaign_agenda
  FOR INSERT TO authenticated
  WITH CHECK ((org_id = ( SELECT public.current_org() )) AND ( SELECT public.can_admin() ));
DROP POLICY IF EXISTS "agenda write in org update" ON public.campaign_agenda;
CREATE POLICY "agenda write in org update" ON public.campaign_agenda
  FOR UPDATE TO authenticated
  USING ((org_id = ( SELECT public.current_org() )) AND ( SELECT public.can_admin() ))
  WITH CHECK ((org_id = ( SELECT public.current_org() )) AND ( SELECT public.can_admin() ));
DROP POLICY IF EXISTS "agenda write in org delete" ON public.campaign_agenda;
CREATE POLICY "agenda write in org delete" ON public.campaign_agenda
  FOR DELETE TO authenticated
  USING ((org_id = ( SELECT public.current_org() )) AND ( SELECT public.can_admin() ));

-- --- Permiso de la pantalla ---------------------------------------------------

INSERT INTO public.permission_catalog (permiso, grupo, etiqueta, descripcion, requiere_rol, orden)
VALUES (
  'avances', 'Territorio', 'Avances de campana',
  'Mediciones por seccion, agenda de visitas y discurso del candidato.',
  NULL, 65
)
ON CONFLICT (permiso) DO UPDATE
  SET grupo = EXCLUDED.grupo,
      etiqueta = EXCLUDED.etiqueta,
      descripcion = EXCLUDED.descripcion,
      requiere_rol = EXCLUDED.requiere_rol,
      orden = EXCLUDED.orden;
