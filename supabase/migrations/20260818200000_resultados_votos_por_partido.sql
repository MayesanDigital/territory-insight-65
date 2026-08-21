-- =============================================================================
-- Votos por partido, sin agrupar
--
-- `resultados` guarda las fuerzas ya agrupadas, que es lo que decide quién ganó
-- la sección. Pero esa agrupación no basta para leer el territorio: cuando tres
-- partidos compiten por separado, ver solo el bloque esconde cuál de ellos tiene
-- estructura real allí.
--
-- `partidos` guarda la cifra literal del acta:
--   { "partidos":    [{ siglas, nombre, votos, porcentaje }, ...],
--     "coaliciones": [{ siglas, votos, porcentaje }, ...] }
--
-- Las dos listas son complementarias, no redundantes. En la boleta, marcar dos
-- partidos aliados a la vez produce un voto que no pertenece a ninguno de los dos
-- en solitario: eso son las `coaliciones`. Sumar ambas listas da el total válido.
--
-- Ver scripts/etl_resultados_electorales.py: la coalición se detecta por
-- municipio a partir de los datos, no se asume por decreto estatal.
-- =============================================================================

ALTER TABLE public.section_election_results
  ADD COLUMN IF NOT EXISTS partidos jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.section_election_results.partidos IS
  'Voto propio de cada partido y voto de cada combinación de coalición, tal como '
  'aparecen en el acta. Complementa a `resultados`, que ya viene agrupado.';
