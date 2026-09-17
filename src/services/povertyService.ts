import { supabase } from "@/integrations/supabase/client";

export type GradoPobreza = "muy_alto" | "alto" | "medio" | "bajo" | "muy_bajo";

/** De mayor a menor pobreza: es el orden en que se listan. */
export const GRADOS_POBREZA: GradoPobreza[] = ["muy_alto", "alto", "medio", "bajo", "muy_bajo"];

export const GRADO_ETIQUETA: Record<GradoPobreza, string> = {
  muy_alto: "Muy alto",
  alto: "Alto",
  medio: "Medio",
  bajo: "Bajo",
  muy_bajo: "Muy bajo",
};

/** Del más oscuro (más pobre) al más claro, en la paleta del mapa. */
export const GRADO_COLOR: Record<GradoPobreza, string> = {
  muy_alto: "#7A2E2E",
  alto: "#B4553A",
  medio: "#D9964F",
  bajo: "#E6C88F",
  muy_bajo: "#F3E9D2",
};

export const INDICADOR_ETIQUETA: Record<string, string> = {
  sin_basica_15: "15+ sin educación básica",
  no_asiste_6_14: "6–14 que no asiste a la escuela",
  sin_salud: "Sin servicios de salud",
  sin_drenaje: "Viviendas sin drenaje",
  sin_agua: "Viviendas sin agua entubada",
  sin_electricidad: "Viviendas sin electricidad",
  piso_tierra: "Viviendas con piso de tierra",
  sin_refrigerador: "Viviendas sin refrigerador",
  sin_internet: "Viviendas sin internet",
  ocupantes_cuarto: "Ocupantes por cuarto",
};

export interface PobrezaSeccion {
  section_code: string;
  /** 0–100; 100 es la sección más pobre del estado. */
  indice: number;
  grado: GradoPobreza;
  /** 1 = la más pobre del estado. */
  lugar: number;
  indicadores: Record<string, number>;
}

export interface PobrezaMunicipal {
  municipio_key: string;
  pobreza_pct: number;
  pobreza_personas: number;
  extrema_pct: number;
}

/** Mayúsculas sin acentos, igual que el catálogo del INE. */
export const claveMunicipio = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();

const PAGE = 1000;

export const povertyService = {
  /** Índice por sección, de la más pobre a la menos pobre. */
  async listSecciones(): Promise<PobrezaSeccion[]> {
    const out: PobrezaSeccion[] = [];
    // PostgREST devuelve como mucho 1000 filas por petición y hay 1,772 secciones.
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from("section_marginacion")
        .select("section_code, index_value, grade, state_rank, indicators")
        .order("state_rank")
        .range(from, from + PAGE - 1);
      if (error) throw error;
      for (const r of data ?? []) {
        out.push({
          section_code: r.section_code,
          indice: Number(r.index_value),
          grado: r.grade as GradoPobreza,
          lugar: r.state_rank,
          indicadores: (r.indicators ?? {}) as Record<string, number>,
        });
      }
      if (!data || data.length < PAGE) break;
    }
    return out;
  },

  /** Pobreza oficial CONEVAL 2020 por municipio, indexada por clave normalizada. */
  async listMunicipios(): Promise<Record<string, PobrezaMunicipal>> {
    const { data, error } = await supabase
      .from("municipal_poverty")
      .select("municipio_key, poverty_pct, poverty_people, extreme_poverty_pct");
    if (error) throw error;
    const mapa: Record<string, PobrezaMunicipal> = {};
    for (const r of data ?? []) {
      mapa[r.municipio_key] = {
        municipio_key: r.municipio_key,
        pobreza_pct: Number(r.poverty_pct),
        pobreza_personas: r.poverty_people,
        extrema_pct: Number(r.extreme_poverty_pct),
      };
    }
    return mapa;
  },
};
