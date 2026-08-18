/**
 * Carga las secciones de Zacatecas en Supabase.
 *
 * Usa la clave de servicio y escribe directo a las tablas en vez de pasar por
 * `upsert_territorial_unit`: esa función es para importaciones interactivas de
 * un usuario con sesión, y hacer 1,828 llamadas RPC secuenciales sería mucho
 * más lento que insertar por lotes.
 *
 * La clave se pide a la CLI de Supabase en el momento; no se escribe a disco.
 *
 * Uso:  bun run scripts/ine/import-zacatecas.ts
 */

import { createClient } from "@supabase/supabase-js";

const PROJECT = "dewnxfapnfheeokfdryg";
const ORG_NAME = "Zacatecas";
const ORG_SLUG = "zacatecas";
const SOURCE = "ine-eceg-2020";
const YEAR = 2020;
const BATCH = 200;

const DATA = new URL("../../data/ine/zacatecas-secciones.json", import.meta.url).pathname.replace(
  /^\/([A-Za-z]:)/,
  "$1",
);

const keys = Bun.spawnSync(["cmd", "/c", "supabase", "projects", "api-keys", "--project-ref", PROJECT]);
const SERVICE = (
  JSON.parse(keys.stdout.toString().trim()) as { keys: Array<{ id: string; api_key: string }> }
).keys.find((k) => k.id === "service_role")!.api_key;

const db = createClient(`https://${PROJECT}.supabase.co`, SERVICE, {
  auth: { persistSession: false },
});

interface Record_ {
  section_code: string;
  municipio: string;
  localidad: string | null;
  district: number | null;
  section_type: string | null;
  data_status: string;
  demographics: Record<string, unknown>;
  geometry: { type: string; coordinates: unknown } | null;
}

const records: Record_[] = await Bun.file(DATA).json();
console.log(`Registros a cargar: ${records.length}`);

// -----------------------------------------------------------------------------
// Organización
// -----------------------------------------------------------------------------
let orgId: string;
const { data: existing } = await db.from("organizations").select("id").eq("slug", ORG_SLUG).maybeSingle();
if (existing) {
  orgId = existing.id;
  console.log(`Organización existente: ${orgId}`);
} else {
  const { data, error } = await db
    .from("organizations")
    .insert({ name: ORG_NAME, slug: ORG_SLUG })
    .select("id")
    .single();
  if (error) throw error;
  orgId = data.id;
  console.log(`Organización creada: ${orgId}`);
}

// -----------------------------------------------------------------------------
// Unidades territoriales
// -----------------------------------------------------------------------------
console.log("\nCargando secciones…");
for (let i = 0; i < records.length; i += BATCH) {
  const chunk = records.slice(i, i + BATCH).map((r) => ({
    org_id: orgId,
    section_code: r.section_code,
    municipio: r.municipio,
    localidad: r.localidad,
    district: r.district,
    section_type: r.section_type,
    data_status: r.data_status,
    population: Number(r.demographics["population"] ?? 0),
    source: SOURCE,
  }));
  const { error } = await db.from("territorial_units").upsert(chunk, { onConflict: "org_id,section_code" });
  if (error) throw error;
  process.stdout.write(`\r  ${Math.min(i + BATCH, records.length)}/${records.length}`);
}
console.log();

// Mapa clave de sección -> id, para enlazar demografía y geometría.
const idBySection = new Map<string, string>();
for (let from = 0; ; from += 1000) {
  const { data, error } = await db
    .from("territorial_units")
    .select("id,section_code")
    .eq("org_id", orgId)
    .range(from, from + 999);
  if (error) throw error;
  if (!data || data.length === 0) break;
  for (const row of data) idBySection.set(row.section_code, row.id);
  if (data.length < 1000) break;
}
console.log(`Secciones en la base: ${idBySection.size}`);

// -----------------------------------------------------------------------------
// Demografía
// -----------------------------------------------------------------------------
console.log("\nCargando demografía…");
const demoRows = records
  .filter((r) => r.demographics["age_0_17"] !== undefined)
  .map((r) => {
    const d = r.demographics;
    return {
      org_id: orgId,
      territorial_unit_id: idBySection.get(r.section_code)!,
      population: Number(d["population"] ?? 0),
      age_0_17: Number(d["age_0_17"] ?? 0),
      age_18_24: Number(d["age_18_24"] ?? 0),
      age_25_59: Number(d["age_25_59"] ?? 0),
      age_60_plus: Number(d["age_60_plus"] ?? 0),
      adults_18_plus: Number(d["adults_18_plus"] ?? 0),
      gender_female: Number(d["gender_female"] ?? 0),
      gender_male: Number(d["gender_male"] ?? 0),
      gender_other: 0,
      households: Number(d["households"] ?? 0),
      indicators: d["indicators"] ?? null,
      source: SOURCE,
      year: YEAR,
    };
  });

for (let i = 0; i < demoRows.length; i += BATCH) {
  const { error } = await db
    .from("demographics")
    .upsert(demoRows.slice(i, i + BATCH), { onConflict: "territorial_unit_id,source,year" });
  if (error) throw error;
  process.stdout.write(`\r  ${Math.min(i + BATCH, demoRows.length)}/${demoRows.length}`);
}
console.log();

// -----------------------------------------------------------------------------
// Geometrías
// Lotes más pequeños: cada polígono lleva cientos de vértices y un lote grande
// desborda el límite de tamaño de petición de PostgREST.
// -----------------------------------------------------------------------------
console.log("\nCargando geometrías…");
const geoRows = records
  .filter((r) => r.geometry !== null)
  .map((r) => ({
    org_id: orgId,
    territorial_unit_id: idBySection.get(r.section_code)!,
    geometry: r.geometry as never,
    geometry_type: r.geometry!.type,
    centroid_lat: (r.demographics["centroid_lat"] as number | null) ?? null,
    centroid_lng: (r.demographics["centroid_lng"] as number | null) ?? null,
    source: SOURCE,
  }));

const GEO_BATCH = 25;
for (let i = 0; i < geoRows.length; i += GEO_BATCH) {
  const { error } = await db
    .from("territorial_geometries")
    .upsert(geoRows.slice(i, i + GEO_BATCH), { onConflict: "territorial_unit_id,source" });
  if (error) throw error;
  process.stdout.write(`\r  ${Math.min(i + GEO_BATCH, geoRows.length)}/${geoRows.length}`);
}
console.log();

// -----------------------------------------------------------------------------
// Verificación
// -----------------------------------------------------------------------------
const count = async (t: string) =>
  (await db.from(t).select("*", { count: "exact", head: true }).eq("org_id", orgId)).count;

console.log("\n=== EN LA BASE ===");
console.log(`  secciones:   ${await count("territorial_units")}`);
console.log(`  demografía:  ${await count("demographics")}`);
console.log(`  geometrías:  ${await count("territorial_geometries")}`);

// PostgREST corta en 1000 filas por defecto. Sin paginar, estos totales salen
// silenciosamente incompletos y parecen un fallo de la carga.
const sums: Array<{ population: number | null; municipio: string | null }> = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await db
    .from("territorial_units_summary")
    .select("population,municipio")
    .eq("org_id", orgId)
    .range(from, from + 999);
  if (error) throw error;
  if (!data?.length) break;
  sums.push(...data);
  if (data.length < 1000) break;
}
const total = sums.reduce((s, r) => s + (r.population ?? 0), 0);
console.log(`  población:   ${total.toLocaleString("es-MX")}`);
console.log(`  municipios:  ${new Set(sums.map((r) => r.municipio)).size}`);
console.log(`\norg_id = ${orgId}`);
