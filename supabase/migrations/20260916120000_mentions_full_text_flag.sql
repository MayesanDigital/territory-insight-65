-- =============================================================================
-- Marca de análisis sobre texto completo
--
-- El monitor lee con Jina Reader el cuerpo de las notas más relevantes y
-- calcula el sentimiento sobre el artículo, no solo sobre el titular. Esta
-- columna distingue ambos casos, para que la interfaz y los reportes puedan
-- decir con qué profundidad se analizó cada mención.
--
-- El texto del artículo NO se guarda (PRD §14): solo el fragmento del cuerpo
-- donde aparece el sujeto, en la columna `excerpt` ya existente.
-- =============================================================================

ALTER TABLE public.web_mentions
  ADD COLUMN IF NOT EXISTS full_text_analyzed boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.web_mentions.full_text_analyzed IS
  'true si el sentimiento y los temas se calcularon sobre el cuerpo del artículo '
  'leído con Jina Reader; false si solo sobre titular y extracto del feed.';
