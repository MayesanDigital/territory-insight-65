-- =============================================================================
-- Resumen electoral de un partido: secciones ganadas y votos
-- =============================================================================
-- El mapa necesita responder, para el partido elegido: cuántas secciones ganó y
-- cuántos votos juntó, en todo el estado o en un municipio.
--
-- Se resuelve en la base y no en el navegador porque la cuenta vive dentro del
-- jsonb `resultados`: traer esa columna de ~1,800 secciones son varios MB por
-- consulta, y aquí se reduce a una fila.
--
-- Los votos son los del BLOQUE que llevaba al partido en ese municipio, no los
-- de su columna suelta. Es la misma regla del análisis estratégico: donde hubo
-- coalición, la cifra que decide la sección es la del bloque, y sumar solo la
-- columna propia perdería los votos emitidos marcando a varios aliados a la vez.
-- Por eso los totales de dos partidos coaligados no se pueden sumar entre sí:
-- cada uno reporta el total de su bloque.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.resumen_partido(
  _siglas text,
  _tipo text DEFAULT 'ayuntamiento',
  _municipio text DEFAULT NULL,
  _year integer DEFAULT NULL
)
RETURNS TABLE (
  anio integer,
  etiqueta text,
  secciones_ganadas integer,
  secciones_con_resultado integer,
  votos bigint,
  votos_emitidos bigint
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  -- Sin año explícito, la elección más reciente de ese tipo.
  WITH elegido AS (
    SELECT COALESCE(_year, MAX(r.election_year)) AS anio
    FROM public.section_election_results r
    WHERE r.org_id = public.current_org()
      AND r.election_type = _tipo
  ),
  base AS (
    SELECT r.section_code, r.resultados, r.total_votos, r.election_label
    FROM public.section_election_results r
    JOIN elegido e ON e.anio = r.election_year
    WHERE r.org_id = public.current_org()
      AND r.election_type = _tipo
      AND (
        _municipio IS NULL
        OR EXISTS (
          SELECT 1
          FROM public.territorial_units u
          WHERE u.org_id = r.org_id
            AND u.section_code = r.section_code
            -- El catálogo convive con "JEREZ" y "Jerez"; se compara en mayúsculas.
            AND upper(u.municipio) = upper(_municipio)
        )
      )
  ),
  fuerzas AS (
    SELECT
      b.section_code,
      (f.elem->>'votos')::bigint AS votos,
      (f.elem->'partidos') ? _siglas AS propia,
      row_number() OVER (
        PARTITION BY b.section_code
        ORDER BY (f.elem->>'votos')::bigint DESC
      ) AS puesto
    FROM base b
    CROSS JOIN LATERAL jsonb_array_elements(b.resultados) AS f(elem)
  )
  SELECT
    (SELECT anio FROM elegido)::integer,
    (SELECT max(election_label) FROM base),
    COALESCE((SELECT count(*) FROM fuerzas WHERE propia AND puesto = 1), 0)::integer,
    (SELECT count(*) FROM base)::integer,
    COALESCE((SELECT sum(votos) FROM fuerzas WHERE propia), 0)::bigint,
    COALESCE((SELECT sum(total_votos) FROM base), 0)::bigint;
$$;

REVOKE ALL ON FUNCTION public.resumen_partido(text, text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resumen_partido(text, text, text, integer) TO authenticated;

COMMENT ON FUNCTION public.resumen_partido(text, text, text, integer) IS
  'Secciones ganadas y votos de un partido en la elección más reciente del tipo '
  'indicado, opcionalmente acotado a un municipio. Los votos son los del bloque '
  'que llevaba al partido, igual que en el análisis estratégico.';
