import { supabase } from "@/integrations/supabase/client";
import type { SectionElectionResult } from "@/types";

export type SectionElectionRow = SectionElectionResult;

/** Un bloque político dentro del resultado de una sección. */
export interface BloqueResultado {
  bloque: string;
  etiqueta: string;
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
  fuente: string;
}

function aResultado(row: SectionElectionRow): ResultadoSeccion {
  return {
    año: row.election_year,
    tipo: row.election_type,
    etiqueta: row.election_label,
    listaNominal: row.lista_nominal,
    totalVotos: row.total_votos,
    votosNulos: row.votos_nulos,
    participacion: row.participacion,
    ganador: row.ganador,
    // `resultados` es jsonb; el importador garantiza esta forma.
    bloques: (row.resultados as unknown as BloqueResultado[]) ?? [],
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
   * Fuerza ganadora por sección, para pintar el mapa. Solo trae las tres
   * columnas necesarias: con ~1,800 secciones por proceso, seleccionar el
   * jsonb completo serían varios MB por carga del mapa.
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
