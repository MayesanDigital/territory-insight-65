import { supabase } from "@/integrations/supabase/client";
import type { Contact, MunicipalDemographics, TerritorialUnit } from "@/types";

/**
 * Demografía municipal del Censo 2020 (INEGI, ITER).
 *
 * Es la única escala donde los rangos de edad del PRD §6 son exactos: el INEGI
 * publica grupos quinquenales por localidad y municipio, pero los suprime a
 * nivel manzana, que es la granularidad que exige asignar población a una
 * sección electoral. Por eso el mapa muestra 0–17 / 18–24 / 25–59 / 60+ y esta
 * vista puede mostrar 18–29 / 30–44 / 45–59.
 */
export async function fetchMunicipalDemographics(): Promise<MunicipalDemographics[]> {
  const { data, error } = await supabase
    .from("municipal_demographics")
    .select("*")
    .order("population", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export interface CoverageRow {
  key: string;
  population: number;
  contacts: number;
  coverage: number;
  sections: number;
}

export const analyticsService = {
  totals(units: TerritorialUnit[], contacts: Contact[]) {
    const population = units.reduce((s, u) => s + (u.population ?? 0), 0);
    return {
      population,
      sections: units.length,
      contacts: contacts.length,
      coverage: population ? (contacts.length / population) * 100 : 0,
      municipios: new Set(units.map((u) => u.municipio)).size,
    };
  },

  byMunicipio(units: TerritorialUnit[], contacts: Contact[]): CoverageRow[] {
    const map = new Map<string, CoverageRow>();
    for (const u of units) {
      const row = map.get(u.municipio) ?? {
        key: u.municipio,
        population: 0,
        contacts: 0,
        coverage: 0,
        sections: 0,
      };
      row.population += u.population ?? 0;
      row.sections += 1;
      map.set(u.municipio, row);
    }
    for (const c of contacts) {
      if (!c.municipio) continue;
      const row = map.get(c.municipio);
      if (row) row.contacts += 1;
    }
    return Array.from(map.values())
      .map((r) => ({ ...r, coverage: r.population ? (r.contacts / r.population) * 100 : 0 }))
      .sort((a, b) => b.contacts - a.contacts);
  },

  bySection(units: TerritorialUnit[], contacts: Contact[]): CoverageRow[] {
    const counts = new Map<string, number>();
    for (const c of contacts) {
      if (!c.section_code) continue;
      counts.set(c.section_code, (counts.get(c.section_code) ?? 0) + 1);
    }
    return units
      .map((u) => {
        const contactCount = counts.get(u.section_code) ?? 0;
        return {
          key: u.section_code,
          population: u.population ?? 0,
          contacts: contactCount,
          sections: 1,
          coverage: u.population ? (contactCount / u.population) * 100 : 0,
        };
      })
      .sort((a, b) => b.contacts - a.contacts);
  },

  ageDistribution(units: TerritorialUnit[]) {
    const sum = (key: keyof TerritorialUnit) =>
      units.reduce((s, u) => s + ((u[key] as number) ?? 0), 0);
    // Rangos del ECEG (INE/INEGI). La fuente no corta en 29, 44 ni 59, así que
    // estas cuatro franjas son las únicas que se pueden mostrar sin inventar
    // una distribución interna.
    return [
      { range: "0–17", value: sum("pop_0_17") },
      { range: "18–24", value: sum("pop_18_24") },
      { range: "25–59", value: sum("pop_25_59") },
      { range: "60+", value: sum("pop_60_plus") },
    ];
  },

  genderDistribution(units: TerritorialUnit[]) {
    const sum = (key: keyof TerritorialUnit) =>
      units.reduce((s, u) => s + ((u[key] as number) ?? 0), 0);
    return [
      { name: "Mujeres", value: sum("women") },
      { name: "Hombres", value: sum("men") },
      { name: "No especificado / otros", value: sum("gender_other") },
    ];
  },

  /** Rangos del PRD §6, exactos. Solo disponibles a escala municipal. */
  prdAgeDistribution(rows: MunicipalDemographics[]) {
    const sum = (key: keyof MunicipalDemographics) =>
      rows.reduce((s, r) => s + ((r[key] as number) ?? 0), 0);
    const dist = [
      { range: "0–17", value: sum("age_0_17") },
      { range: "18–29", value: sum("age_18_29") },
      { range: "30–44", value: sum("age_30_44") },
      { range: "45–59", value: sum("age_45_59") },
      { range: "60+", value: sum("age_60_plus") },
    ];
    const unspecified = sum("age_unspecified");
    // El censo deja gente sin edad declarada; omitirla haría que la suma no
    // cuadrara con la población total y pareciera un error de carga.
    if (unspecified > 0) dist.push({ range: "No especificada", value: unspecified });
    return dist;
  },

  monthlyRegistrations(contacts: Contact[]) {
    const map = new Map<string, number>();
    for (const c of contacts) {
      const month = (c.registered_at ?? "").slice(0, 7);
      if (!month) continue;
      map.set(month, (map.get(month) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([month, total]) => ({ month, total }))
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-12);
  },
};
