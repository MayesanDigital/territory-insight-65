-- =============================================================================
-- Retira resumen_partido
-- =============================================================================
-- Devolvía como "votos del partido" los del bloque que lo llevaba, de modo que
-- en una coalición le adjudicaba los del aliado: el PVEM aparecía con 200,780
-- votos en los ayuntamientos de 2024 cuando su columna propia suma 40,683.
--
-- La sustituye `votos_partido_por_seccion`, que entrega la columna propia, las
-- combinaciones y el total del bloque por separado. Se elimina en una migración
-- aparte porque la versión anterior del sitio seguía llamándola: hacerlo en el
-- mismo paso habría dejado el resumen del mapa roto durante el despliegue.
--
-- Dejarla viva mantendría dos respuestas distintas a la misma pregunta, y es la
-- equivocada la que resulta más fácil de llamar por error.
-- =============================================================================

DROP FUNCTION IF EXISTS public.resumen_partido(text, text, text, integer);
