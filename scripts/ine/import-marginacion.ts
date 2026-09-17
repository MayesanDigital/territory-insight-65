/**
 * Carga en Supabase el índice de marginación por sección y la pobreza municipal
 * de CONEVAL, generados antes con `python scripts/ine/build-marginacion.py`.
 *
 * Reemplaza la carga anterior de la misma fuente y año, para que recalcular el
 * índice no deje filas viejas mezcladas con las nuevas.
 *
 * La clave de servicio se pide a la CLI de Supabase en el momento; no se escribe a disco.
 *
 * Uso:  bun run scripts/ine/import-marginacion.ts
 */

import { createClient } from "@supabase/supabase-js";

const PROJECT = "dewnxfapnfheeokfdryg";
const ORG_SLUG = "zacatecas";
const BATCH = 500;

const path = (rel: string) =>
  new URL(rel, import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

const keys = Bun.spawnSync(["cmd", "/c", "supabase", "projects", "api-keys", "--project-ref", PROJECT]);
const SERVICE = (
  JSON.parse(keys.stdout.toString().trim()) as { keys: Array<{ id: string; api_key: string }> }
).keys.find((k) => k.id === "service_role")!.api_key;

const db = createClient(`https://${PROJECT}.supabase.co`, SERVICE, { auth: { persistSession: false } });

const { data: org } = await db.from("organizations").select("id").eq("slug", ORG_SLUG).single();
const orgId = org!.id as string;

// --- Secciones -----------------------------------------------------------------
const secciones: Array<Record<string, unknown>> = await Bun.file(
  path("../../data/ine/marginacion-secciones.json"),
).json();

const SOURCE_SECCION = "conapo-dp2-eceg-2020";
await db.from("section_marginacion").delete().eq("org_id", orgId).eq("source", SOURCE_SECCION);
for (let i = 0; i < secciones.length; i += BATCH) {
  const { error } = await db
    .from("section_marginacion")
    .insert(secciones.slice(i, i + BATCH).map((s) => ({ ...s, org_id: orgId, source: SOURCE_SECCION, year: 2020 })));
  if (error) throw error;
}
console.log(`Secciones con índice cargadas: ${secciones.length}`);

// --- Municipios ----------------------------------------------------------------
const municipios: Array<Record<string, unknown>> = await Bun.file(
  path("../../data/coneval/pobreza-municipal-32.json"),
).json();

const SOURCE_MUNICIPIO = "coneval-2020";
await db.from("municipal_poverty").delete().eq("org_id", orgId).eq("source", SOURCE_MUNICIPIO);
const { error } = await db
  .from("municipal_poverty")
  .insert(municipios.map((m) => ({ ...m, org_id: orgId, source: SOURCE_MUNICIPIO, year: 2020 })));
if (error) throw error;
console.log(`Municipios con pobreza CONEVAL cargados: ${municipios.length}`);

// --- Verificación --------------------------------------------------------------
const { count } = await db
  .from("section_marginacion")
  .select("*", { count: "exact", head: true })
  .eq("org_id", orgId);
// PostgREST devuelve como mucho 1000 filas por petición: hay que paginar.
const unidades: Array<{ section_code: string }> = [];
for (let from = 0; ; from += 1000) {
  const { data } = await db
    .from("territorial_units")
    .select("section_code")
    .eq("org_id", orgId)
    .range(from, from + 999);
  unidades.push(...(data ?? []));
  if (!data || data.length < 1000) break;
}
const conIndice = new Set(secciones.map((s) => s.section_code as string));
const sinIndice = unidades.filter((u) => !conIndice.has(u.section_code)).length;
console.log(`En base: ${count} índices · secciones del catálogo sin índice: ${sinIndice}`);
