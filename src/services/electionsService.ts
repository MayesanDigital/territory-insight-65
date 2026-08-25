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
}

type PartidosJson = { partidos?: VotoPartido[]; coaliciones?: VotoCoalicion[] };

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

export const electionsService = {
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
        .select("section_code, ganador, participacion, total_votos, election_label")
        .eq("election_year", year)
        .eq("election_type", electionType)
        .order("section_code")
        .range(desde, desde + PAGINA - 1);

      if (error) throw error;
      if (!data?.length) break;

      for (const row of data) {
        mapa[row.section_code] = {
          ganador: row.ganador,
          participacion: row.participacion,
          totalVotos: row.total_votos,
          etiqueta: row.election_label,
        };
      }
      if (data.length < PAGINA) break;
    }

    return mapa;
  },
};
