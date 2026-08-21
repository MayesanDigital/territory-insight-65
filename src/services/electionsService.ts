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
   * Fuerza ganadora por sección, para pintar el mapa. Solo trae las columnas
   * necesarias: con ~1,800 secciones por proceso, seleccionar los jsonb completos
   * serían varios MB por carga del mapa.
   */
  async ganadores(year: number): Promise<Record<string, string | null>> {
    const { data, error } = await supabase
      .from("section_election_results")
      .select("section_code, ganador")
      .eq("election_year", year);

    if (error) throw error;

    const mapa: Record<string, string | null> = {};
    for (const row of data ?? []) mapa[row.section_code] = row.ganador;
    return mapa;
  },
};
