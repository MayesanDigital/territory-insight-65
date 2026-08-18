-- =============================================================================
-- Pipeline de monitoreo público
--
-- Añade lo que el ingestor necesita para ser idempotente y auditable:
-- deduplicación por URL, estado de la última corrida y control de frecuencia.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Deduplicación
-- Un mismo enlace reaparece en cada corrida del monitor. Sin unicidad, cada
-- ejecución duplicaría todas las menciones y las métricas se dispararían.
-- El índice va sobre el hash porque una URL puede superar el límite de tamaño
-- de un índice B-tree.
-- -----------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS idx_mentions_unique_url
  ON public.web_mentions (monitor_id, md5(url))
  WHERE url IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_mentions_org_published
  ON public.web_mentions (org_id, published_at DESC);

-- -----------------------------------------------------------------------------
-- Estado del monitor
-- -----------------------------------------------------------------------------
ALTER TABLE public.web_monitors
  ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'es',
  ADD COLUMN IF NOT EXISTS country text NOT NULL DEFAULT 'MX',
  ADD COLUMN IF NOT EXISTS last_run_status text,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS mention_count integer NOT NULL DEFAULT 0,
  -- Sin una marca de la última corrida no hay forma de aplicar un mínimo entre
  -- ejecuciones, y un usuario impaciente puede martillear las fuentes.
  ADD COLUMN IF NOT EXISTS last_started_at timestamptz;

ALTER TABLE public.web_monitors
  DROP CONSTRAINT IF EXISTS web_monitors_run_status_valid,
  ADD CONSTRAINT web_monitors_run_status_valid
  CHECK (last_run_status IS NULL OR last_run_status IN ('ok', 'partial', 'error', 'running'));

ALTER TABLE public.web_monitors
  DROP CONSTRAINT IF EXISTS web_monitors_query_not_empty,
  ADD CONSTRAINT web_monitors_query_not_empty CHECK (length(trim(query)) >= 2);

CREATE INDEX IF NOT EXISTS idx_monitors_org_active ON public.web_monitors(org_id, active);

-- -----------------------------------------------------------------------------
-- Registro de corridas: qué fuente se consultó, cuánto tardó y qué devolvió.
-- Es lo que permite demostrar que el crawler se comportó bien si una fuente
-- reclama, y detectar feeds rotos sin revisar a mano.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.monitor_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  monitor_id uuid NOT NULL REFERENCES public.web_monitors(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  status text NOT NULL DEFAULT 'running',
  sources_checked integer NOT NULL DEFAULT 0,
  items_found integer NOT NULL DEFAULT 0,
  items_new integer NOT NULL DEFAULT 0,
  errors jsonb,
  CONSTRAINT monitor_runs_status_valid CHECK (status IN ('running', 'ok', 'partial', 'error'))
);

CREATE INDEX IF NOT EXISTS idx_monitor_runs_monitor ON public.monitor_runs(monitor_id, started_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.monitor_runs TO authenticated;
GRANT ALL ON public.monitor_runs TO service_role;
ALTER TABLE public.monitor_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "runs read in org" ON public.monitor_runs
FOR SELECT TO authenticated
USING (org_id = public.current_org() OR public.is_super_admin());

CREATE POLICY "runs write in org" ON public.monitor_runs
FOR ALL TO authenticated
USING (org_id = public.current_org() AND public.can_analyze())
WITH CHECK (org_id = public.current_org() AND public.can_analyze());

-- -----------------------------------------------------------------------------
-- Crear un monitor y devolverlo listo para ejecutar.
-- Va en una función para validar el término y evitar duplicados por nombre
-- dentro de la organización.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_monitor(
  _name text,
  _query text,
  _subject_type text DEFAULT 'person'
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _org uuid := public.current_org();
  _id uuid;
BEGIN
  IF _org IS NULL OR NOT public.can_analyze() THEN
    RAISE EXCEPTION 'Se requiere rol ADMIN o ANALYST en la organización';
  END IF;
  IF _query IS NULL OR length(trim(_query)) < 2 THEN
    RAISE EXCEPTION 'El término de búsqueda debe tener al menos 2 caracteres';
  END IF;

  SELECT id INTO _id
  FROM public.web_monitors
  WHERE org_id = _org AND lower(trim(query)) = lower(trim(_query));

  IF _id IS NOT NULL THEN
    RETURN _id;
  END IF;

  INSERT INTO public.web_monitors (org_id, name, query, subject_type, created_by)
  VALUES (_org, COALESCE(NULLIF(trim(_name), ''), trim(_query)), trim(_query),
          COALESCE(_subject_type, 'person'), auth.uid())
  RETURNING id INTO _id;

  RETURN _id;
END; $$;

REVOKE ALL ON FUNCTION public.create_monitor(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_monitor(text, text, text) TO authenticated;
