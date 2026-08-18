import { supabase } from "@/integrations/supabase/client";
import {
  toTerritorialUnit,
  toTerritorialUnitDetailed,
  type TerritorialUnit,
  type TerritorialUnitDetailed,
  type UnitDetailedRow,
  type UnitSummaryRow,
} from "@/types";

export interface TerritoryFilters {
  municipio?: string;
  search?: string;
}

/** Recuadro visible del mapa, para no traer geometrías fuera de pantalla. */
export interface Viewport {
  north?: number;
  south?: number;
  east?: number;
  west?: number;
}

/** Fila de importación ya normalizada, tal como la produce el wizard. */
export interface UnitImportRow {
  section_code: string;
  municipio: string;
  localidad?: string | null;
  population?: number;
  age_0_17?: number;
  age_18_24?: number;
  age_25_59?: number;
  age_60_plus?: number;
  adults_18_plus?: number;
  district?: number | null;
  section_type?: string | null;
  gender_female?: number;
  gender_male?: number;
  gender_other?: number;
  households?: number;
  centroid_lat?: number | null;
  centroid_lng?: number | null;
  geometry?: unknown;
}

export interface ImportResult {
  processed: number;
  imported: number;
  failed: number;
  errors: Array<{ row: number; section: string; message: string }>;
}

/** PostgREST tope por petición. Pedir más de esto se ignora en silencio. */
const PAGE = 1000;

export const territoryService = {
  /**
   * Listado sin geometrías.
   *
   * Alimenta tablas, selectores y agregados. Traer los polígonos aquí
   * multiplicaría por mil el peso de la respuesta para dibujar una tabla que ni
   * siquiera los usa.
   *
   * Pagina de forma explícita: PostgREST devuelve como mucho 1000 filas por
   * petición y no avisa de que truncó. Zacatecas tiene 1,828 secciones, así que
   * sin paginar faltarían 828 sin ningún error visible.
   */
  async list(filters: TerritoryFilters = {}): Promise<TerritorialUnit[]> {
    const rows: UnitSummaryRow[] = [];
    for (let from = 0; ; from += PAGE) {
      let query = supabase
        .from("territorial_units_summary")
        .select("*")
        .order("section_code")
        .range(from, from + PAGE - 1);
      if (filters.municipio) query = query.eq("municipio", filters.municipio);
      if (filters.search) {
        query = query.or(
          `section_code.ilike.%${filters.search}%,municipio.ilike.%${filters.search}%`,
        );
      }
      const { data, error } = await query;
      if (error) throw error;
      if (!data?.length) break;
      rows.push(...data);
      if (data.length < PAGE) break;
    }
    return rows.map(toTerritorialUnit);
  },

  /**
   * Con geometrías. Exclusivo del mapa y siempre acotado.
   *
   * Los 1,777 polígonos de Zacatecas suman 380 mil vértices: servirlos juntos
   * son unos 15 MB por carga de mapa. El PRD §26 lo prohíbe explícitamente, así
   * que esta consulta exige un filtro — municipio o recuadro visible — y el
   * mapa dibuja centroides mientras no haya uno.
   */
  async listWithGeometry(filters: TerritoryFilters & Viewport): Promise<TerritorialUnitDetailed[]> {
    const bounded =
      !!filters.municipio ||
      (filters.north !== undefined &&
        filters.south !== undefined &&
        filters.east !== undefined &&
        filters.west !== undefined);
    if (!bounded) return [];

    const rows: UnitDetailedRow[] = [];
    for (let from = 0; ; from += PAGE) {
      let query = supabase
        .from("territorial_units_detailed")
        .select("*")
        .order("section_code")
        .range(from, from + PAGE - 1);
      if (filters.municipio) query = query.eq("municipio", filters.municipio);
      if (filters.north !== undefined) {
        query = query
          .gte("centroid_lat", filters.south!)
          .lte("centroid_lat", filters.north)
          .gte("centroid_lng", filters.west!)
          .lte("centroid_lng", filters.east!);
      }
      const { data, error } = await query;
      if (error) throw error;
      if (!data?.length) break;
      rows.push(...data);
      if (data.length < PAGE) break;
    }
    return rows.map(toTerritorialUnitDetailed);
  },

  async getById(id: string): Promise<TerritorialUnitDetailed | null> {
    const { data, error } = await supabase
      .from("territorial_units_detailed")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data ? toTerritorialUnitDetailed(data) : null;
  },

  async municipios(): Promise<string[]> {
    const { data, error } = await supabase
      .from("territorial_units_summary")
      .select("municipio")
      .order("municipio");
    if (error) throw error;
    return Array.from(new Set((data ?? []).map((r) => r.municipio).filter((m): m is string => !!m)));
  },

  /** Historial demográfico de una sección, ordenado del año más reciente al más antiguo. */
  async demographicsHistory(unitId: string) {
    const { data, error } = await supabase
      .from("demographics")
      .select("*")
      .eq("territorial_unit_id", unitId)
      .order("year", { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  /**
   * Importa unidades territoriales.
   *
   * Cada fila va por `upsert_territorial_unit`, que escribe unidad, demografía y
   * geometría en una sola transacción — un fallo a mitad dejaría secciones sin
   * demografía o geometrías huérfanas. Se procesa fila a fila para poder decir
   * exactamente cuál falló y por qué, en vez de abortar el lote entero.
   */
  async importUnits(
    rows: UnitImportRow[],
    options: { source?: string; year?: number } = {},
    onProgress?: (done: number, total: number) => void,
  ): Promise<ImportResult> {
    const source = options.source ?? "manual";
    const year = options.year ?? new Date().getFullYear();
    const result: ImportResult = { processed: rows.length, imported: 0, failed: 0, errors: [] };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!;
      // Avisar cada 10 filas: refrescar la barra en cada una satura el render
      // en archivos de miles de secciones.
      if (onProgress && (i % 10 === 0 || i === rows.length - 1)) onProgress(i + 1, rows.length);
      const { error } = await supabase.rpc("upsert_territorial_unit", {
        _section_code: row.section_code,
        _municipio: row.municipio,
        // La función hace NULLIF(trim(...), '') del lado del servidor, así que
        // la cadena vacía llega a la columna como NULL.
        _localidad: row.localidad ?? "",
        _demographics: {
          population: row.population ?? 0,
          age_0_17: row.age_0_17 ?? 0,
          age_18_24: row.age_18_24 ?? 0,
          age_25_59: row.age_25_59 ?? 0,
          age_60_plus: row.age_60_plus ?? 0,
          adults_18_plus: row.adults_18_plus ?? 0,
          gender_female: row.gender_female ?? 0,
          gender_male: row.gender_male ?? 0,
          gender_other: row.gender_other ?? 0,
          households: row.households ?? 0,
          centroid_lat: row.centroid_lat ?? null,
          centroid_lng: row.centroid_lng ?? null,
        },
        _geometry: (row.geometry ?? null) as never,
        _source: source,
        _year: year,
        // El tipo generado declara estos parámetros opcionales sin admitir null,
        // así que se omiten en vez de enviarlos vacíos.
        ...(row.district != null ? { _district: row.district } : {}),
        ...(row.section_type ? { _section_type: row.section_type } : {}),
        // Una carga manual sin geometría es una sección vigente sin censo hasta
        // que se cargue el dato demográfico correspondiente.
        _data_status: row.geometry ? "complete" : "catalog_only",
      });

      if (error) {
        result.failed++;
        result.errors.push({ row: i + 1, section: row.section_code, message: error.message });
      } else {
        result.imported++;
      }
    }

    return result;
  },
};
