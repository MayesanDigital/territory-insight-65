-- =============================================================================
-- Votos de un partido por sección: lo propio y lo de coalición, por separado
-- =============================================================================
-- `resumen_partido` reportaba como votos del partido los del BLOQUE que lo
-- llevaba. En una coalición eso le atribuye los votos del aliado: el PVEM
-- aparecía con ~200,000 votos en los ayuntamientos de 2024 cuando su columna
-- propia suma 40,683 y el resto era de Morena. La cifra existía, pero no era
-- del partido que se estaba consultando.
--
-- Esta función devuelve las tres cantidades sin mezclarlas, para que la interfaz
-- diga cuál es cuál:
--
--   * `propios`      — su columna en el acta. Voto exclusivo del partido.
--   * `coalicion`    — columnas de combinación donde aparece. Voto emitido
--                      marcando a varios aliados a la vez: cuenta para la
--                      coalición y la ley lo reparte entre sus integrantes, así
--                      que NO es voto exclusivo suyo.
--   * `bloque_votos` — total de la fuerza que llevó la candidatura. Es la cifra
--                      que decide quién ganó la sección, y la suma de las
--                      columnas propias de todos sus integrantes más las
--                      combinaciones.
--
-- Por eso se entregan las tres: con solo la propia no se explica quién ganó, y
-- con solo la del bloque se le adjudican al partido votos que no son suyos.
-- =============================================================================

-- Integrantes de una columna de combinación.
--
-- El IEEZ rotula las combinaciones uniendo siglas con guion ("PVEM-MORENA") y
-- escribe NAZ donde la columna propia se llama NA, igual que en el ETL. Hay que
-- partir por el guion y comparar token por token: buscar la sigla como subcadena
-- encontraría "NA" dentro de "MORENA" e inflaría sus votos de coalición.
CREATE OR REPLACE FUNCTION public.siglas_de_coalicion(_etiqueta text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT array_agg(CASE WHEN t = 'NAZ' THEN 'NA' ELSE t END)
  FROM unnest(string_to_array(upper(trim(_etiqueta)), '-')) AS t
  WHERE t <> '';
$$;

COMMENT ON FUNCTION public.siglas_de_coalicion(text) IS
  'Siglas que integran una columna de combinación, normalizando NAZ a NA.';

CREATE OR REPLACE FUNCTION public.votos_partido_por_seccion(
  _siglas text,
  _tipo text DEFAULT 'ayuntamiento',
  _year integer DEFAULT NULL
)
RETURNS TABLE (
  section_code text,
  propios bigint,
  coalicion bigint,
  bloque_votos bigint,
  bloque text,
  integrantes integer,
  gano boolean,
  total_votos bigint
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
    SELECT r.section_code, r.resultados, r.partidos, r.total_votos
    FROM public.section_election_results r
    JOIN elegido e ON e.anio = r.election_year
    WHERE r.org_id = public.current_org()
      AND r.election_type = _tipo
  )
  SELECT
    b.section_code,
    -- Columna propia del partido en el acta.
    COALESCE((
      SELECT (p.elem->>'votos')::bigint
      FROM jsonb_array_elements(b.partidos->'partidos') AS p(elem)
      WHERE p.elem->>'siglas' = _siglas
      LIMIT 1
    ), 0)::bigint,
    -- Columnas de combinación en las que aparece.
    COALESCE((
      SELECT sum((c.elem->>'votos')::bigint)
      FROM jsonb_array_elements(b.partidos->'coaliciones') AS c(elem)
      WHERE _siglas = ANY(public.siglas_de_coalicion(c.elem->>'siglas'))
    ), 0)::bigint,
    -- Fuerza que llevó al partido en ese municipio. La pertenencia se compara
    -- por siglas, no por etiqueta: "PAN-PRD-PRI" y "PAN" son el mismo partido
    -- en municipios distintos.
    COALESCE(f.votos, 0)::bigint,
    f.etiqueta,
    COALESCE(f.integrantes, 0)::integer,
    COALESCE(f.puesto = 1, false),
    b.total_votos::bigint
  FROM base b
  LEFT JOIN LATERAL (
    SELECT
      (x.elem->>'votos')::bigint AS votos,
      x.elem->>'etiqueta' AS etiqueta,
      jsonb_array_length(x.elem->'partidos') AS integrantes,
      x.puesto
    FROM (
      SELECT
        e.elem,
        row_number() OVER (ORDER BY (e.elem->>'votos')::bigint DESC) AS puesto
      FROM jsonb_array_elements(b.resultados) AS e(elem)
    ) AS x
    WHERE (x.elem->'partidos') ? _siglas
    LIMIT 1
  ) AS f ON true;
$$;

REVOKE ALL ON FUNCTION public.votos_partido_por_seccion(text, text, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.votos_partido_por_seccion(text, text, integer)
  TO authenticated;

COMMENT ON FUNCTION public.votos_partido_por_seccion(text, text, integer) IS
  'Votos de un partido por sección, separando su columna propia, las columnas '
  'de combinación donde aparece y el total del bloque que lo llevó.';

-- `resumen_partido` sigue viva a propósito: la versión del sitio que está en
-- producción todavía la llama, y retirarla en el mismo paso dejaría el resumen
-- del mapa roto hasta que termine el despliegue. Se elimina en la migración
-- siguiente, ya con el frontend nuevo publicado.
