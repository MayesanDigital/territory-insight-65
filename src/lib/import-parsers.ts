import { parseCSV } from "@/lib/export";

/**
 * Lectura y validación de archivos de importación.
 *
 * Separado de la interfaz para poder probar el parseo sin montar el wizard, y
 * porque las reglas de validación —qué es una geometría válida, qué columnas
 * son obligatorias— son del dominio, no de la pantalla.
 */

export type SourceFormat = "csv" | "json" | "geojson";

export interface ParsedFile {
  format: SourceFormat;
  /** Filas planas listas para mapear. */
  rows: Array<Record<string, unknown>>;
  columns: string[];
  /** Geometría por índice de fila, cuando el archivo la traiga. */
  geometries: Map<number, unknown>;
  warnings: string[];
}

/** Campos del destino a los que se puede mapear una columna del archivo. */
export const TARGET_FIELDS = [
  { key: "section_code", label: "Sección", required: true },
  { key: "municipio", label: "Municipio", required: true },
  { key: "localidad", label: "Localidad", required: false },
  { key: "population", label: "Población total", required: false },
  { key: "age_0_17", label: "Edad 0–17", required: false },
  { key: "age_18_24", label: "Edad 18–24", required: false },
  { key: "age_25_59", label: "Edad 25–59", required: false },
  { key: "age_60_plus", label: "Edad 60+", required: false },
  { key: "adults_18_plus", label: "Población 18+", required: false },
  { key: "gender_female", label: "Mujeres", required: false },
  { key: "gender_male", label: "Hombres", required: false },
  { key: "gender_other", label: "Otro género", required: false },
  { key: "households", label: "Hogares", required: false },
  { key: "centroid_lat", label: "Latitud", required: false },
  { key: "centroid_lng", label: "Longitud", required: false },
  { key: "district", label: "Distrito", required: false },
  { key: "section_type", label: "Tipo de sección", required: false },
] as const;

export type TargetField = (typeof TARGET_FIELDS)[number]["key"];

/**
 * Sinónimos habituales de cada campo, para proponer el mapeo automáticamente.
 * Cubre las variantes del INE y del INEGI, que es de donde vendrán los archivos.
 */
const ALIASES: Record<TargetField, string[]> = {
  section_code: ["seccion", "section", "section_code", "clave_seccion", "cve_seccion", "secc"],
  municipio: ["municipio", "nom_mun", "municipality", "nombre_municipio", "mun"],
  localidad: ["localidad", "nom_loc", "locality", "nombre_localidad", "loc"],
  population: ["poblacion", "pobtot", "population", "poblacion_total", "total"],
  age_0_17: ["p_0a17", "age_0_17", "pob0_17", "menores"],
  age_18_24: ["p_18a24", "age_18_24"],
  age_25_59: ["age_25_59", "p_25a59"],
  age_60_plus: ["p_60ymas", "age_60_plus", "pob60_mas", "adultos_mayores"],
  adults_18_plus: ["p_18ymas", "adults_18_plus", "adultos"],
  gender_female: ["pobfem", "mujeres", "gender_female", "women", "femenino"],
  gender_male: ["pobmas", "hombres", "gender_male", "men", "masculino"],
  gender_other: ["gender_other", "otro", "no_especificado"],
  households: ["tothog", "hogares", "households", "viviendas", "vivtot"],
  centroid_lat: ["latitud", "lat", "centroid_lat", "y"],
  centroid_lng: ["longitud", "lon", "lng", "centroid_lng", "x"],
  district: ["distrito", "district", "distrito_federal"],
  section_type: ["tipo", "tipo_seccion", "section_type"],
};

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

/** Propone a qué campo corresponde cada columna del archivo. */
export function suggestMapping(columns: string[]): Partial<Record<TargetField, string>> {
  const mapping: Partial<Record<TargetField, string>> = {};
  const used = new Set<string>();

  for (const [field, aliases] of Object.entries(ALIASES) as Array<[TargetField, string[]]>) {
    const match = columns.find((c) => !used.has(c) && aliases.includes(normalize(c)));
    if (match) {
      mapping[field] = match;
      used.add(match);
    }
  }
  return mapping;
}

// -----------------------------------------------------------------------------
// Lectura
// -----------------------------------------------------------------------------

interface GeoJsonFeature {
  type?: string;
  properties?: Record<string, unknown> | null;
  geometry?: { type?: string; coordinates?: unknown } | null;
}

const VALID_GEOMETRY_TYPES = new Set([
  "Polygon",
  "MultiPolygon",
  "Point",
  "LineString",
  "MultiLineString",
]);

/** Comprueba que la geometría tenga tipo conocido y coordenadas no vacías. */
export function isValidGeometry(geometry: unknown): boolean {
  if (!geometry || typeof geometry !== "object") return false;
  const g = geometry as { type?: unknown; coordinates?: unknown };
  if (typeof g.type !== "string" || !VALID_GEOMETRY_TYPES.has(g.type)) return false;
  return Array.isArray(g.coordinates) && g.coordinates.length > 0;
}

export async function parseImportFile(file: File): Promise<ParsedFile> {
  const text = await file.text();
  const name = file.name.toLowerCase();
  const warnings: string[] = [];
  const geometries = new Map<number, unknown>();

  // GeoJSON y JSON comparten extensión en la práctica, así que se decide por
  // el contenido y no por el nombre del archivo.
  if (name.endsWith(".json") || name.endsWith(".geojson")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      throw new Error(`El archivo no es JSON válido: ${(e as Error).message}`);
    }

    const asObject = parsed as { type?: string; features?: GeoJsonFeature[] };

    if (asObject?.type === "FeatureCollection" && Array.isArray(asObject.features)) {
      const rows: Array<Record<string, unknown>> = [];
      asObject.features.forEach((feature, i) => {
        rows.push({ ...(feature.properties ?? {}) });
        if (feature.geometry) {
          if (isValidGeometry(feature.geometry)) geometries.set(i, feature.geometry);
          else warnings.push(`La geometría de la fila ${i + 1} es inválida y se omitirá.`);
        }
      });
      if (rows.length === 0) throw new Error("El GeoJSON no contiene features.");
      return {
        format: "geojson",
        rows,
        columns: collectColumns(rows),
        geometries,
        warnings,
      };
    }

    const rows = Array.isArray(parsed) ? (parsed as Array<Record<string, unknown>>) : [parsed as Record<string, unknown>];
    if (rows.length === 0) throw new Error("El archivo JSON está vacío.");
    return { format: "json", rows, columns: collectColumns(rows), geometries, warnings };
  }

  const rows = parseCSV(text);
  if (rows.length === 0) throw new Error("El archivo CSV no contiene filas de datos.");
  return { format: "csv", rows, columns: collectColumns(rows), geometries, warnings };
}

/** Une las claves de todas las filas: el JSON puede traer campos irregulares. */
function collectColumns(rows: Array<Record<string, unknown>>): string[] {
  const columns = new Set<string>();
  for (const row of rows.slice(0, 200)) for (const key of Object.keys(row)) columns.add(key);
  return [...columns];
}

// -----------------------------------------------------------------------------
// Validación
// -----------------------------------------------------------------------------

export interface ValidationIssue {
  row: number;
  field: string;
  message: string;
  severity: "error" | "warning";
}

export interface ValidationReport {
  total: number;
  valid: number;
  rejected: number;
  duplicates: number;
  issues: ValidationIssue[];
  /** Filas listas para enviar, ya normalizadas. */
  prepared: Array<Record<string, unknown>>;
}

const toNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  // Los CSV del INEGI traen separadores de miles y comillas; se conserva solo
  // d\u00edgitos, punto decimal y signo.
  const n = Number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
};

/**
 * Valida y normaliza antes de tocar la base.
 *
 * Detecta duplicados dentro del propio archivo: importar dos veces la misma
 * sección haría que la segunda pisara a la primera sin aviso, y el usuario
 * vería un total menor al esperado sin saber por qué.
 */
export function validateRows(
  rows: Array<Record<string, unknown>>,
  mapping: Partial<Record<TargetField, string>>,
  geometries: Map<number, unknown>,
): ValidationReport {
  const issues: ValidationIssue[] = [];
  const prepared: Array<Record<string, unknown>> = [];
  const seen = new Map<string, number>();
  let duplicates = 0;

  const get = (row: Record<string, unknown>, field: TargetField): unknown => {
    const column = mapping[field];
    return column ? row[column] : undefined;
  };

  rows.forEach((row, index) => {
    const rowNumber = index + 1;
    const rowIssues: ValidationIssue[] = [];

    const rawSection = get(row, "section_code");
    const section = String(rawSection ?? "").trim();
    if (!section) {
      rowIssues.push({
        row: rowNumber,
        field: "section_code",
        message: "La sección es obligatoria",
        severity: "error",
      });
    } else if (!/^\d{1,5}$/.test(section)) {
      rowIssues.push({
        row: rowNumber,
        field: "section_code",
        message: `"${section}" no es una clave de sección válida (solo dígitos)`,
        severity: "error",
      });
    }

    const municipio = String(get(row, "municipio") ?? "").trim();
    if (!municipio) {
      rowIssues.push({
        row: rowNumber,
        field: "municipio",
        message: "El municipio es obligatorio",
        severity: "error",
      });
    }

    const population = toNumber(get(row, "population"));
    if (population !== null && population < 0) {
      rowIssues.push({
        row: rowNumber,
        field: "population",
        message: "La población no puede ser negativa",
        severity: "error",
      });
    }

    const lat = toNumber(get(row, "centroid_lat"));
    const lng = toNumber(get(row, "centroid_lng"));
    if (lat !== null && (lat < -90 || lat > 90)) {
      rowIssues.push({
        row: rowNumber,
        field: "centroid_lat",
        message: `Latitud fuera de rango: ${lat}`,
        severity: "error",
      });
    }
    if (lng !== null && (lng < -180 || lng > 180)) {
      rowIssues.push({
        row: rowNumber,
        field: "centroid_lng",
        message: `Longitud fuera de rango: ${lng}`,
        severity: "error",
      });
    }

    // La suma de rangos por encima del total suele delatar un mapeo cruzado.
    const ages = (["age_0_17", "age_18_24", "age_25_59", "age_60_plus"] as TargetField[])
      .map((f) => toNumber(get(row, f)) ?? 0)
      .reduce((s, n) => s + n, 0);
    if (population !== null && population > 0 && ages > population * 1.05) {
      rowIssues.push({
        row: rowNumber,
        field: "population",
        message: `Los rangos de edad suman ${ages}, más que la población (${population})`,
        severity: "warning",
      });
    }

    const padded = section.padStart(4, "0");
    const previous = seen.get(padded);
    if (previous !== undefined) {
      duplicates++;
      rowIssues.push({
        row: rowNumber,
        field: "section_code",
        message: `Sección repetida en el archivo (ya aparece en la fila ${previous})`,
        severity: "warning",
      });
    } else if (section) {
      seen.set(padded, rowNumber);
    }

    issues.push(...rowIssues);

    if (rowIssues.some((i) => i.severity === "error")) return;

    const geometry = geometries.get(index);
    prepared.push({
      section_code: padded,
      municipio,
      localidad: String(get(row, "localidad") ?? "").trim() || null,
      population: population ?? 0,
      age_0_17: toNumber(get(row, "age_0_17")) ?? 0,
      age_18_24: toNumber(get(row, "age_18_24")) ?? 0,
      age_25_59: toNumber(get(row, "age_25_59")) ?? 0,
      age_60_plus: toNumber(get(row, "age_60_plus")) ?? 0,
      adults_18_plus: toNumber(get(row, "adults_18_plus")) ?? 0,
      gender_female: toNumber(get(row, "gender_female")) ?? 0,
      gender_male: toNumber(get(row, "gender_male")) ?? 0,
      gender_other: toNumber(get(row, "gender_other")) ?? 0,
      households: toNumber(get(row, "households")) ?? 0,
      centroid_lat: lat,
      centroid_lng: lng,
      district: toNumber(get(row, "district")),
      section_type: String(get(row, "section_type") ?? "").trim() || null,
      geometry: geometry ?? null,
    });
  });

  return {
    total: rows.length,
    valid: prepared.length,
    rejected: rows.length - prepared.length,
    duplicates,
    issues,
    prepared,
  };
}
