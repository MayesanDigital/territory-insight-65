-- =============================================================================
-- Resultado completo de un municipio
-- =============================================================================
-- El mapa sabía quién ganó cada sección, pero no quién ganó el municipio. Son
-- preguntas distintas: una fuerza puede llevarse más secciones y perder la
-- presidencia, porque las secciones no pesan igual.
--
-- Se suma por BLOQUE y no por partido porque el bloque es lo que llevaba la
-- candidatura. Sumar las columnas sueltas repartiría la coalición entre sus
-- integrantes e inventaría un orden de llegada que no ocurrió.
--
-- La suma por municipio es válida porque las coaliciones se detectaron municipio
-- por municipio en el ETL: dentro de un mismo municipio ningún partido aparece
-- en dos bloques distintos, así que la etiqueta identifica a la misma alianza en
-- todas sus secciones. (Comprobado: 0 casos en los ayuntamientos de 2024.)
--
-- `secciones_ganadas` cuenta en cuántas secciones esa fuerza fue la más votada.
-- Va aparte de los votos a propósito: ganar el municipio y ganar más secciones
-- son resultados que pueden no coincidir, y verlos juntos es lo que explica cómo
-- se ganó.
-- =============================================================================

-- El total del acta cierra exacto: fuerzas + nulos + no registrados. Se
-- comprobo en las 1,764 secciones de los ayuntamientos 2024, sin un voto de
-- diferencia. Por eso se devuelven los no registrados: sin ellos faltarian 369
-- votos en el estado y el cuadre pareceria un error de captura cuando no lo es.
DROP FUNCTION IF EXISTS public.resultado_municipio(text, text, integer);

CREATE OR REPLACE FUNCTION public.resultado_municipio(
  _municipio text,
  _tipo text DEFAULT 'ayuntamiento',
  _year integer DEFAULT NULL
)
RETURNS TABLE (
  anio integer,
  eleccion text,
  etiqueta text,
  partidos text[],
  votos bigint,
  secciones_ganadas integer,
  secciones_con_votos integer,
  -- Totales del municipio. Se repiten en cada fila para resolverlo en un viaje.
  total_votos bigint,
  votos_nulos bigint,
  /* Votos por candidaturas no registradas. El acta los suma al total pero no
     pertenecen a ninguna fuerza. */
  no_registrados bigint,
  lista_nominal bigint,
  secciones_municipio integer
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
    SELECT r.section_code, r.resultados, r.total_votos, r.votos_nulos,
           r.no_registrados, r.lista_nominal, r.election_label
    FROM public.section_election_results r
    JOIN elegido e ON e.anio = r.election_year
    WHERE r.org_id = public.current_org()
      AND r.election_type = _tipo
      AND EXISTS (
        SELECT 1 FROM public.territorial_units u
        WHERE u.org_id = r.org_id
          AND u.section_code = r.section_code
          -- Se compara en mayúsculas por si el catálogo volviera a convivir con
          -- dos grafías del mismo municipio, como ocurrió con "JEREZ"/"Jerez".
          AND upper(trim(u.municipio)) = upper(trim(_municipio))
      )
  ),
  totales AS (
    SELECT COALESCE(sum(total_votos), 0)::bigint AS total_votos,
           COALESCE(sum(votos_nulos), 0)::bigint AS votos_nulos,
           COALESCE(sum(no_registrados), 0)::bigint AS no_registrados,
           COALESCE(sum(lista_nominal), 0)::bigint AS lista_nominal,
           count(*)::integer AS secciones
    FROM base
  ),
  fuerzas AS (
    SELECT
      b.section_code,
      f.elem->>'etiqueta' AS etiqueta,
      ARRAY(SELECT jsonb_array_elements_text(f.elem->'partidos')) AS partidos,
      (f.elem->>'votos')::bigint AS votos,
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
    f.etiqueta,
    /* Los integrantes son los mismos en todo el municipio, asi que se toma un
       representante. Se pasa por texto porque agregar un text[] daria un array
       de dos dimensiones, y de ahi no se recupera la lista original. */
    string_to_array(min(array_to_string(f.partidos, ',')), ','),
    sum(f.votos)::bigint,
    count(*) FILTER (WHERE f.puesto = 1)::integer,
    count(*) FILTER (WHERE f.votos > 0)::integer,
    (SELECT total_votos FROM totales),
    (SELECT votos_nulos FROM totales),
    (SELECT no_registrados FROM totales),
    (SELECT lista_nominal FROM totales),
    (SELECT secciones FROM totales)
  FROM fuerzas f
  GROUP BY f.etiqueta
  ORDER BY sum(f.votos) DESC;
$$;

REVOKE ALL ON FUNCTION public.resultado_municipio(text, text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resultado_municipio(text, text, integer) TO authenticated;

COMMENT ON FUNCTION public.resultado_municipio(text, text, integer) IS
  'Resultado de un municipio sumado por bloque, de la fuerza mas votada a la menos, '
  'con las secciones que gano cada una y los totales del municipio.';
