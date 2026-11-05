import { supabase } from "@/integrations/supabase/client";
import type { SectionElectionResult } from "@/types";

export type SectionElectionRow = SectionElectionResult;

/** Fuerza política de la sección, ya agrupada según la coalición real. */
export interface BloqueResultado {
  bloque: string;
  etiqueta: string;
  votos: number;
  porcentaje: number;
  /** Siglas de los partidos que la integran en ese municipio. */
  partidos?: string[];
}

/** Voto propio de un partido, sin agrupar. Cifra literal del acta. */
export interface VotoPartido {
  siglas: string;
  nombre: string;
  votos: number;
  porcentaje: number;
}

/** Voto emitido marcando varios partidos aliados a la vez. */
export interface VotoCoalicion {
  siglas: string;
  votos: number;
  porcentaje: number;
}

export interface ResultadoSeccion {
  año: number;
  tipo: string;
  etiqueta: string;
  listaNominal: number;
  totalVotos: number;
  votosNulos: number;
  participacion: number | null;
  ganador: string | null;
  bloques: BloqueResultado[];
  partidos: VotoPartido[];
  coaliciones: VotoCoalicion[];
  fuente: string;
}

/** Resumen del resultado de una sección, para el popup del mapa. */
export interface GanadorSeccion {
  ganador: string | null;
  participacion: number | null;
  totalVotos: number;
  etiqueta: string;
  /**
   * Siglas que integraban la fuerza ganadora en ese municipio.
   *
   * `ganador` es la etiqueta ya compuesta ("PAN-PRD-PRI"), que sirve para leerla
   * pero no para preguntar si un partido concreto ganó: en una coalición la
   * etiqueta mezcla nombres y en otro municipio el mismo partido pudo ir solo.
   * Con las siglas la pregunta se responde exacta.
   */
  partidos: string[];
}

type PartidosJson = { partidos?: VotoPartido[]; coaliciones?: VotoCoalicion[] };

/**
 * Fila de `ganadores`. El tipo generado no describe las rutas de jsonb que se
 * piden con alias, así que la forma se declara aquí y se valida al leerla.
 */
type FilaGanador = {
  section_code: string;
  ganador: string | null;
  participacion: number | null;
  total_votos: number;
  election_label: string;
  ganadorPartidos: unknown;
};

function aResultado(row: SectionElectionRow): ResultadoSeccion {
  // Ambos campos son jsonb; el importador garantiza estas formas.
  const detalle = (row.partidos as unknown as PartidosJson) ?? {};

  return {
    año: row.election_year,
    tipo: row.election_type,
    etiqueta: row.election_label,
    listaNominal: row.lista_nominal,
    totalVotos: row.total_votos,
    votosNulos: row.votos_nulos,
    participacion: row.participacion,
    ganador: row.ganador,
    bloques: (row.resultados as unknown as BloqueResultado[]) ?? [],
    partidos: detalle.partidos ?? [],
    coaliciones: detalle.coaliciones ?? [],
    fuente: row.source,
  };
}

/**
 * Votos de un partido en una sección, sin mezclar lo propio con lo ajeno.
 *
 * En una coalición el voto se reparte entre la columna de cada partido y las
 * columnas de las combinaciones marcadas en la boleta. Reportar el total del
 * bloque como "votos del partido" le atribuye los de su aliado: el PVEM salía
 * con 200,780 votos en los ayuntamientos de 2024 cuando su columna propia suma
 * 40,683. Por eso las tres cifras viajan separadas.
 */
export interface VotosPartidoSeccion {
  seccion: string;
  /** Su columna en el acta. Voto exclusivo del partido. */
  propios: number;
  /**
   * Columnas de combinación donde aparece. Voto emitido marcando a varios
   * aliados a la vez: cuenta para la coalición y la ley lo reparte entre sus
   * integrantes, así que no es voto exclusivo del partido.
   */
  coalicion: number;
  /** Total de la fuerza que llevó la candidatura. Es la que decide la sección. */
  bloqueVotos: number;
  /** Etiqueta de esa fuerza, o nulo si el partido no compitió en la sección. */
  bloque: string | null;
  /** Partidos que integraban la fuerza. 1 significa que compitió solo. */
  integrantes: number;
  /** La fuerza que lo llevaba fue la más votada de la sección. */
  gano: boolean;
  /** Votos emitidos en la sección, para calcular porcentajes. */
  totalVotos: number;
}

/** Suma de un conjunto de secciones para el resumen del mapa. */
export interface ResumenPartido {
  seccionesGanadas: number;
  seccionesConResultado: number;
  /** Secciones donde el partido fue en coalición. */
  seccionesEnCoalicion: number;
  propios: number;
  coalicion: number;
  bloqueVotos: number;
  votosEmitidos: number;
}

/**
 * Agrega el desglose de las secciones indicadas.
 *
 * Se suma en el navegador y no en la base para que acotar por municipio no
 * cueste otra consulta y para que el resumen cuadre exactamente con lo que el
 * mapa tiene dibujado.
 */
export function resumePartido(
  filas: VotosPartidoSeccion[],
  secciones?: Set<string>,
): ResumenPartido {
  const total: ResumenPartido = {
    seccionesGanadas: 0,
    seccionesConResultado: 0,
    seccionesEnCoalicion: 0,
    propios: 0,
    coalicion: 0,
    bloqueVotos: 0,
    votosEmitidos: 0,
  };

  for (const f of filas) {
    if (secciones && !secciones.has(f.seccion)) continue;
    total.seccionesConResultado += 1;
    if (f.gano) total.seccionesGanadas += 1;
    if (f.integrantes > 1) total.seccionesEnCoalicion += 1;
    total.propios += f.propios;
    total.coalicion += f.coalicion;
    total.bloqueVotos += f.bloqueVotos;
    total.votosEmitidos += f.totalVotos;
  }

  return total;
}

export const electionsService = {
  /**
   * Desglose de votos de un partido, sección por sección.
   *
   * La descomposición la hace la base (`votos_partido_por_seccion`): vive dentro
   * del jsonb de resultados y traer esa columna de ~1,800 secciones serían
   * varios MB por consulta. Aquí vuelven solo ocho campos por sección, que
   * alimentan a la vez el resumen del mapa y la ficha de cada sección.
   */
  async votosPorSeccion(
    siglas: string,
    tipo = "ayuntamiento",
    year?: number,
  ): Promise<Record<string, VotosPartidoSeccion>> {
    const { data, error } = await supabase.rpc("votos_partido_por_seccion", {
      _siglas: siglas,
      _tipo: tipo,
      ...(year ? { _year: year } : {}),
    });
    if (error) throw error;

    const mapa: Record<string, VotosPartidoSeccion> = {};
    for (const fila of (data as unknown as Array<Record<string, unknown>> | null) ?? []) {
      const seccion = String(fila["section_code"]);
      mapa[seccion] = {
        seccion,
        propios: Number(fila["propios"] ?? 0),
        coalicion: Number(fila["coalicion"] ?? 0),
        bloqueVotos: Number(fila["bloque_votos"] ?? 0),
        bloque: (fila["bloque"] as string | null) ?? null,
        integrantes: Number(fila["integrantes"] ?? 0),
        gano: Boolean(fila["gano"]),
        totalVotos: Number(fila["total_votos"] ?? 0),
      };
    }
    return mapa;
  },

  /** Resultados de una sección, del proceso más antiguo al más reciente. */
  async bySection(sectionCode: string): Promise<ResultadoSeccion[]> {
    const { data, error } = await supabase
      .from("section_election_results")
      .select("*")
      .eq("section_code", sectionCode)
      .order("election_year", { ascending: true });

    if (error) throw error;
    return (data ?? []).map(aResultado);
  },

  /**
   * Lista nominal por sección, del proceso más reciente disponible.
   *
   * El padrón no vive en el catálogo territorial: llega con cada cómputo, así
   * que se toma del año más reciente. Cuando ese año tuvo varias elecciones se
   * queda la cifra mayor, que es la del corte más tardío.
   *
   * Pagina por el mismo motivo que `ganadores`: PostgREST corta en 1,000 filas.
   */
  async listaNominal(year = 2024): Promise<Record<string, number>> {
    const PAGINA = 1000;
    const mapa: Record<string, number> = {};

    for (let desde = 0; ; desde += PAGINA) {
      const { data, error } = await supabase
        .from("section_election_results")
        .select("section_code, lista_nominal")
        .eq("election_year", year)
        .order("section_code")
        .range(desde, desde + PAGINA - 1);

      if (error) throw error;
      if (!data?.length) break;

      for (const row of data) {
        const previo = mapa[row.section_code] ?? 0;
        if (row.lista_nominal > previo) mapa[row.section_code] = row.lista_nominal;
      }
      if (data.length < PAGINA) break;
    }

    return mapa;
  },

  /**
   * Ganador por sección para una elección concreta, con destino al popup del
   * mapa. Solo trae las columnas necesarias: con ~1,800 secciones, seleccionar
   * los jsonb completos serían varios MB por carga.
   *
   * Se pagina a mano porque PostgREST corta en 1,000 filas por defecto y el
   * estado tiene más secciones que eso: sin esto, faltaría el ganador en un
   * tercio del mapa sin ningún aviso.
   */
  async ganadores(year: number, electionType: string): Promise<Record<string, GanadorSeccion>> {
    const PAGINA = 1000;
    const mapa: Record<string, GanadorSeccion> = {};

    for (let desde = 0; ; desde += PAGINA) {
      const { data, error } = await supabase
        .from("section_election_results")
        // `resultados` viene ordenado de más a menos votos desde el ETL, así que
        // el elemento 0 es la fuerza ganadora. Se pide solo esa ruta del jsonb:
        // traer la columna entera serían varios MB para ~1,800 secciones.
        .select(
          "section_code, ganador, participacion, total_votos, election_label, ganadorPartidos:resultados->0->partidos",
        )
        .eq("election_year", year)
        .eq("election_type", electionType)
        .order("section_code")
        .range(desde, desde + PAGINA - 1);

      if (error) throw error;
      if (!data?.length) break;

      for (const row of data as unknown as FilaGanador[]) {
        mapa[row.section_code] = {
          ganador: row.ganador,
          participacion: row.participacion,
          totalVotos: row.total_votos,
          etiqueta: row.election_label,
          partidos: Array.isArray(row.ganadorPartidos)
            ? row.ganadorPartidos.filter((p): p is string => typeof p === "string")
            : [],
        };
      }
      if (data.length < PAGINA) break;
    }

    return mapa;
  },
};
