/**
 * Carga la demografía municipal del Censo 2020 (INEGI, ITER).
 *
 * Complementa al ECEG: aporta los rangos de edad del PRD §6 (18–29, 30–44,
 * 45–59), que solo existen a escala municipal porque el INEGI suprime los
 * grupos quinquenales a nivel manzana, que es la granularidad que necesita la
 * asignación a sección electoral.
 *
 * Uso:  bun run scripts/ine/import-municipios.ts
 */

import { createClient } from "@supabase/supabase-js";

const PROJECT = "dewnxfapnfheeokfdryg";
const ORG_SLUG = "zacatecas";
const SOURCE = "inegi-iter-2020";
const YEAR = 2020;

const CSV = new URL(
  "../../data/inegi/iter/iter_32_cpv2020/conjunto_de_datos/conjunto_de_datos_iter_32CSV20.csv",
  import.meta.url,
).pathname.replace(/^\/([A-Za-z]:)/, "$1");

const keys = Bun.spawnSync(["cmd", "/c", "supabase", "projects", "api-keys", "--project-ref", PROJECT]);
const SERVICE = (
  JSON.parse(keys.stdout.toString().trim()) as { keys: Array<{ id: string; api_key: string }> }
).keys.find((k) => k.id === "service_role")!.api_key;

const db = createClient(`https://${PROJECT}.supabase.co`, SERVICE, { auth: { persistSession: false } });

const { data: org } = await db.from("organizations").select("id").eq("slug", ORG_SLUG).single();
const orgId = org!.id;

// -----------------------------------------------------------------------------
const text = await Bun.file(CSV).text();
const lines = text.split(/\r?\n/).filter((l) => l.trim());
const header = lines[0]!.split(",").map((h) => h.replace(/^"|"$/g, ""));
const idx = (name: string) => header.indexOf(name);

// El censo marca con '*' los valores suprimidos por confidencialidad.
const num = (v: string | undefined) => {
  const s = (v ?? "").replace(/^"|"$/g, "");
  return s === "" || s === "*" || s === "N/D" ? 0 : Number(s) || 0;
};

/** Igual que el catálogo del INE: mayúsculas sin acentos, para poder cruzar. */
const normalize = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();

const rows = lines.slice(1).map((l) => l.split(",").map((x) => x.replace(/^"|"$/g, "")));
const iMun = idx("MUN");
const iLoc = idx("LOC");

// LOC "0000" es el renglón de totales del municipio; MUN "000" el del estado.
const municipios = rows.filter((r) => r[iMun] !== "000" && r[iLoc] === "0000");
console.log(`Municipios en el ITER: ${municipios.length}`);

const g = (r: string[], n: string) => num(r[idx(n)]);

const payload = municipios.map((r) => {
  const name = r[idx("NOM_MUN")]!.trim();
  const population = g(r, "POBTOT");
  const a0_17 = g(r, "POB0_14") + g(r, "P_15A17");
  const a18_29 = g(r, "P_18A24") + g(r, "P_25A29");
  const a30_44 = g(r, "P_30A34") + g(r, "P_35A39") + g(r, "P_40A44");
  const a45_59 = g(r, "P_45A49") + g(r, "P_50A54") + g(r, "P_55A59");
  const a60 = g(r, "P_60YMAS");

  // Se guardan los quinquenales completos: son lo que esta escala aporta y lo
  // que el ECEG no puede dar.
  const indicators: Record<string, number> = {};
  for (const h of header) {
    if (/^P_\d|^POB\d|^POB_|YMAS$/.test(h)) indicators[h] = g(r, h);
  }

  return {
    org_id: orgId,
    municipio: name,
    municipio_key: normalize(name),
    municipio_code: r[iMun]!,
    population,
    age_0_17: a0_17,
    age_18_29: a18_29,
    age_30_44: a30_44,
    age_45_59: a45_59,
    age_60_plus: a60,
    age_unspecified: Math.max(0, population - a0_17 - a18_29 - a30_44 - a45_59 - a60),
    gender_female: g(r, "POBFEM"),
    gender_male: g(r, "POBMAS"),
    households: g(r, "TOTHOG"),
    indicators,
    source: SOURCE,
    year: YEAR,
  };
});

const { error } = await db
  .from("municipal_demographics")
  .upsert(payload, { onConflict: "org_id,municipio_key,source,year" });
if (error) throw error;

// -----------------------------------------------------------------------------
// Verificación: la escala municipal debe cuadrar con la seccional.
// -----------------------------------------------------------------------------
const { data: saved } = await db
  .from("municipal_demographics")
  .select("municipio,municipio_key,population,age_0_17,age_18_29,age_30_44,age_45_59,age_60_plus")
  .eq("org_id", orgId);

const total = (saved ?? []).reduce((s, r) => s + r.population, 0);
console.log(`\nGuardados:        ${saved?.length}`);
console.log(`Población total:  ${total.toLocaleString("es-MX")}`);

// Contrastar con la suma de secciones (ECEG), paginando.
const secciones: Array<{ population: number | null; municipio: string | null }> = [];
for (let from = 0; ; from += 1000) {
  const { data } = await db
    .from("territorial_units_summary")
    .select("population,municipio")
    .eq("org_id", orgId)
    .range(from, from + 999);
  if (!data?.length) break;
  secciones.push(...data);
  if (data.length < 1000) break;
}
const totalSecciones = secciones.reduce((s, r) => s + (r.population ?? 0), 0);
console.log(`Suma por sección: ${totalSecciones.toLocaleString("es-MX")}`);
console.log(`Diferencia:       ${(total - totalSecciones).toLocaleString("es-MX")}`);

// ¿Cruzan los nombres entre ambas fuentes?
const clavesMunicipales = new Set((saved ?? []).map((r) => r.municipio_key));
const clavesSeccion = new Set(secciones.map((r) => normalize(r.municipio ?? "")));
const huerfanos = [...clavesSeccion].filter((k) => k && !clavesMunicipales.has(k));
console.log(`\nMunicipios de la malla seccional sin demografía municipal: ${huerfanos.length}`);
if (huerfanos.length) console.log(`  ${huerfanos.join(", ")}`);
