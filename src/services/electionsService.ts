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

/** Lo que un partido logró en una elección: secciones ganadas y votos. */
export interface ResumenPartido {
  anio: number;
  etiqueta: string;
  seccionesGanadas: number;
  seccionesConResultado: number;
  votos: number;
  votosEmitidos: number;
}

export const electionsService = {
  /**
   * Resumen de un partido en la elección más reciente del tipo indicado.
   *
   * Lo calcula la base (`resumen_partido`): la cuenta vive dentro del jsonb de
   * resultados y traerlo de ~1,800 secciones serían varios MB por consulta.
   *
   * Los votos son los del bloque que llevaba al partido en cada municipio, así
   * que los de dos partidos coaligados no se pueden sumar entre sí.
   */
  async resumenPartido(
    siglas: string,
    tipo = "ayuntamiento",
    municipio?: string | null,
  ): Promise<ResumenPartido | null> {
    const acotado = municipio && municipio !== "todos" ? municipio : null;
    const { data, error } = await supabase.rpc("resumen_partido", {
      _siglas: siglas,
      _tipo: tipo,
      // Sin municipio la función resume todo el estado; la clave se omite para
      // que tome su valor por omisión en vez de recibir un nulo explícito.
      ...(acotado ? { _municipio: acotado } : {}),
    });
    if (error) throw error;
    const fila = (data as unknown as Array<Record<string, number | string>> | null)?.[0];
    if (!fila || !fila["anio"]) return null;
    return {
      anio: Number(fila["anio"]),
      etiqueta: String(fila["etiqueta"] ?? ""),
      seccionesGanadas: Number(fila["secciones_ganadas"] ?? 0),
      seccionesConResultado: Number(fila["secciones_con_resultado"] ?? 0),
      votos: Number(fila["votos"] ?? 0),
      votosEmitidos: Number(fila["votos_emitidos"] ?? 0),
    };
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
  async ganadores(
    year: number,
    electionType: string,
  ): Promise<Record<string, GanadorSeccion>> {
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
