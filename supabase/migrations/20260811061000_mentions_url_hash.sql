-- =============================================================================
-- Deduplicación de menciones por columna, no por expresión
--
-- El índice anterior era UNIQUE (monitor_id, md5(url)). Postgres lo acepta,
-- pero `ON CONFLICT` necesita nombrar exactamente las columnas del índice y
-- PostgREST no sabe expresar `md5(url)` en su parámetro on_conflict: el upsert
-- del ingestor fallaría con "no unique or exclusion constraint matching".
--
-- Una columna generada resuelve las dos cosas a la vez: se puede nombrar en
-- on_conflict y evita el límite de tamaño del índice B-tree con URLs largas,
-- que es la razón por la que no se indexa `url` directamente.
-- =============================================================================

DROP INDEX IF EXISTS public.idx_mentions_unique_url;

ALTER TABLE public.web_mentions
  ADD COLUMN IF NOT EXISTS url_hash text GENERATED ALWAYS AS (md5(COALESCE(url, ''))) STORED;

-- Las menciones sembradas comparten URL ficticia dentro del mismo monitor, así
-- que se limpian los duplicados antes de imponer la unicidad.
DELETE FROM public.web_mentions a
USING public.web_mentions b
WHERE a.ctid > b.ctid
  AND a.monitor_id IS NOT DISTINCT FROM b.monitor_id
  AND a.url_hash = b.url_hash;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mentions_monitor_url
  ON public.web_mentions (monitor_id, url_hash);
