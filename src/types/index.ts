import type { Database, Json } from "@/integrations/supabase/types";

type Views = Database["public"]["Views"];
type Tables = Database["public"]["Tables"];

export type SectionElectionResult = Tables["section_election_results"]["Row"];
export type Candidate = Tables["candidates"]["Row"];
export type SectionGoal = Tables["section_goals"]["Row"];
export type Contact = Tables["contacts"]["Row"];
export type ContactInsert = Tables["contacts"]["Insert"];
export type WebMonitor = Tables["web_monitors"]["Row"];
export type WebMention = Tables["web_mentions"]["Row"];
export type WebSource = Tables["web_sources"]["Row"];
export type Profile = Tables["profiles"]["Row"];
export type Organization = Tables["organizations"]["Row"];
export type Invitation = Tables["organization_invitations"]["Row"];
export type AuditLog = Tables["audit_logs"]["Row"];
export type Demographics = Tables["demographics"]["Row"];
export type MunicipalDemographics = Tables["municipal_demographics"]["Row"];
export type ContactConsent = Tables["contact_consents"]["Row"];
export type Topic = Tables["topics"]["Row"];
export type AppRole = Database["public"]["Enums"]["app_role"];

export type UnitSummaryRow = Views["territorial_units_summary"]["Row"];
export type UnitDetailedRow = Views["territorial_units_detailed"]["Row"];
export type ConsentStatusRow = Views["contact_consent_status"]["Row"];

/**
 * Unidad territorial con su demografía vigente.
 *
 * Postgres declara nullable toda columna de una vista, aunque la definición
 * garantice lo contrario con COALESCE y con NOT NULL en la tabla base. Estos
 * tipos recogen esa garantía para que el resto de la aplicación no tenga que
 * comprobar nulos que nunca ocurren; `toTerritorialUnit` es el único punto
 * donde se aplica el estrechamiento.
 */
export interface TerritorialUnit {
  id: string;
  org_id: string;
  section_code: string;
  municipio: string;
  localidad: string | null;
  population: number;
  // Las franjas son las que publica el ECEG del INE/INEGI a escala de sección.
  // La fuente no corta en 29, 44 ni 59, así que los rangos del PRD §6 no son
  // reproducibles sin inventar una distribución; 25–59 se obtiene por resta.
  pop_0_17: number;
  pop_18_24: number;
  pop_25_59: number;
  pop_60_plus: number;
  /** Población de 18 años o más, dato directo de la fuente. */
  adults_18_plus: number;
  women: number;
  men: number;
  gender_other: number;
  households: number;
  centroid_lat: number | null;
  centroid_lng: number | null;
  /** Procedencia del dato demográfico: 'inegi', 'manual', 'demo'… (PRD §6). */
  demographics_source: string | null;
  /** Año al que corresponde el dato demográfico (PRD §6). */
  demographics_year: number | null;
  has_geometry: boolean;
  has_demographics: boolean;
  /** Distrito electoral federal al que pertenece la sección. */
  district: number | null;
  /** URBANO, RURAL o MIXTO, según el catálogo del INE. */
  section_type: string | null;
  /**
   * Estado de la sección frente al desfase entre la cartografía del INE (2021)
   * y el catálogo vigente (2026), consecuencia del reseccionamiento 2025-2026.
   */
  data_status: "complete" | "catalog_only" | "census_only";
  created_at: string | null;
}

export const DATA_STATUS_LABELS: Record<TerritorialUnit["data_status"], string> = {
  complete: "Completa",
  catalog_only: "Sin datos censales",
  census_only: "Sección extinta",
};

export interface TerritorialUnitDetailed extends TerritorialUnit {
  geometry: Json | null;
  geometry_type: string | null;
}

export function toTerritorialUnit(row: UnitSummaryRow): TerritorialUnit {
  return {
    id: row.id ?? "",
    org_id: row.org_id ?? "",
    section_code: row.section_code ?? "",
    municipio: row.municipio ?? "",
    localidad: row.localidad,
    population: row.population ?? 0,
    pop_0_17: row.pop_0_17 ?? 0,
    pop_18_24: row.pop_18_24 ?? 0,
    pop_25_59: row.pop_25_59 ?? 0,
    pop_60_plus: row.pop_60_plus ?? 0,
    adults_18_plus: row.adults_18_plus ?? 0,
    women: row.women ?? 0,
    men: row.men ?? 0,
    gender_other: row.gender_other ?? 0,
    households: row.households ?? 0,
    centroid_lat: row.centroid_lat,
    centroid_lng: row.centroid_lng,
    demographics_source: row.demographics_source,
    demographics_year: row.demographics_year,
    has_geometry: row.has_geometry ?? false,
    has_demographics: row.has_demographics ?? false,
    district: row.district,
    section_type: row.section_type,
    data_status: (row.data_status ?? "complete") as TerritorialUnit["data_status"],
    created_at: row.created_at,
  };
}

export function toTerritorialUnitDetailed(row: UnitDetailedRow): TerritorialUnitDetailed {
  return {
    ...toTerritorialUnit(row),
    geometry: row.geometry,
    geometry_type: row.geometry_type,
  };
}

/**
 * Etiqueta de censo que se muestra en la interfaz.
 *
 * Debe coincidir con `demographics.source` y `demographics.year`, que hoy son
 * `ine-eceg-2020` y 2020 para las 1,777 secciones con datos censales. Rotularlo
 * con otro año hacía que la población pareciera contemporánea de la lista
 * nominal de 2024 y que su diferencia se leyera como un error de captura, cuando
 * es la brecha real entre un censo y un padrón electoral cuatro años posterior.
 */
export const CENSUS_DISPLAY_LABEL = "Censo INE-ECEG 2020";

export const GENDER_LABELS: Record<string, string> = {
  femenino: "Femenino",
  masculino: "Masculino",
  no_especificado: "No especificado",
};

export const SENTIMENT_LABELS: Record<string, string> = {
  positive: "Positivo",
  neutral: "Neutral",
  negative: "Negativo",
};

export const ROLE_LABELS: Record<AppRole, string> = {
  SUPER_ADMIN: "Super administrador",
  ADMIN: "Administrador",
  ANALYST: "Analista",
  VIEWER: "Consulta",
};
