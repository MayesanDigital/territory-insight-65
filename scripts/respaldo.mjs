/**
 * Respaldo completo de la base a archivos JSON.
 *
 * Usa `supabase db query` contra el proyecto enlazado, así que no necesita
 * Docker ni el cliente de Postgres instalados: solo el CLI de Supabase ya
 * configurado. Cada tabla se exporta paginada, porque la API de gestión limita
 * el tamaño de respuesta y las tablas con jsonb o geometrías pesan varios
 * kilobytes por fila.
 *
 * Uso:
 *   node scripts/respaldo.mjs [carpeta_destino]
 *
 * Para restaurar, ver el README que se genera junto a los archivos.
 */

import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

/**
 * Tablas a respaldar y cuántas filas pedir por página.
 *
 * El tamaño de página se ajusta al peso de cada fila: `section_election_results`
 * lleva dos columnas jsonb y `territorial_geometries` polígonos completos, así
 * que pedir mil filas de golpe desbordaría la respuesta.
 */
const TABLAS = [
  ["organizations", 500],
  ["profiles", 500],
  ["user_roles", 500],
  ["organization_invitations", 500],
  ["candidates", 500],
  ["territorial_units", 500],
  ["territorial_geometries", 25],
  ["demographics", 200],
  ["municipal_demographics", 500],
  ["section_election_results", 50],
  ["section_goals", 500],
  ["contacts", 500],
  ["contact_consents", 500],
  ["contact_history", 500],
  ["web_sources", 500],
  ["web_monitors", 500],
  ["web_mentions", 100],
  ["mention_topics", 500],
  ["sentiment_analysis", 200],
  ["monitor_runs", 200],
  ["topics", 500],
  ["reports", 200],
  ["audit_logs", 300],
];

/**
 * La consulta va por archivo y no como argumento.
 *
 * En Windows la CLI es un .cmd, que exige lanzar a través del shell, y pasar SQL
 * por línea de comandos obliga a escapar comillas de formas distintas en cada
 * sistema. Un archivo temporal elimina el problema entero.
 */
function consulta(sql) {
  const archivo = join(tmpdir(), `respaldo-${process.pid}.sql`);
  writeFileSync(archivo, sql, "utf8");
  try {
    const salida = execSync(`supabase db query --linked -f "${archivo}"`, {
      encoding: "utf8",
      maxBuffer: 256 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
    // La CLI envuelve el resultado; solo interesa el array `rows`.
    const inicio = salida.indexOf("{");
    return JSON.parse(salida.slice(inicio)).rows ?? [];
  } finally {
    rmSync(archivo, { force: true });
  }
}

function exportar(tabla, porPagina) {
  const filas = [];
  for (let desde = 0; ; desde += porPagina) {
    const r = consulta(
      `SELECT COALESCE(json_agg(t), '[]'::json) AS datos FROM ` +
        `(SELECT * FROM public.${tabla} ORDER BY 1 LIMIT ${porPagina} OFFSET ${desde}) t;`,
    );
    const lote = r[0]?.datos ?? [];
    filas.push(...lote);
    process.stdout.write(`\r  ${tabla}: ${filas.length} filas`);
    if (lote.length < porPagina) break;
  }
  process.stdout.write("\n");
  return filas;
}

const destino = process.argv[2] ?? join("respaldos", new Date().toISOString().slice(0, 10));
mkdirSync(destino, { recursive: true });

console.log(`Respaldando a ${destino}\n`);

const resumen = [];
for (const [tabla, porPagina] of TABLAS) {
  try {
    const filas = exportar(tabla, porPagina);
    const ruta = join(destino, `${tabla}.json`);
    const contenido = JSON.stringify(filas);
    writeFileSync(ruta, contenido, "utf8");
    resumen.push({ tabla, filas: filas.length, kb: Math.round(contenido.length / 1024) });
  } catch (e) {
    console.error(`\n  ! ${tabla}: ${e.message.slice(0, 160)}`);
    resumen.push({ tabla, filas: -1, kb: 0 });
  }
}

const totalKb = resumen.reduce((a, r) => a + r.kb, 0);
const totalFilas = resumen.reduce((a, r) => a + Math.max(0, r.filas), 0);

writeFileSync(
  join(destino, "RESTAURAR.md"),
  `# Respaldo de Territorio Intelligence

Generado el ${new Date().toISOString()} desde el proyecto de Supabase enlazado.

${totalFilas.toLocaleString("es-MX")} filas en ${resumen.length} tablas, ${(totalKb / 1024).toFixed(1)} MB.

| Tabla | Filas | KB |
|---|---:|---:|
${resumen.map((r) => `| ${r.tabla} | ${r.filas < 0 ? "ERROR" : r.filas} | ${r.kb} |`).join("\n")}

## Qué contiene

Un archivo JSON por tabla, con todas sus filas tal como están en la base. El
esquema —tablas, políticas RLS, funciones y triggers— **no** está aquí: vive en
\`supabase/migrations/\`, versionado en el repositorio. Los dos juntos permiten
reconstruir el sistema entero.

## Cómo restaurar

1. Crear el proyecto de Supabase y aplicar el esquema:

   \`\`\`bash
   supabase link --project-ref <nuevo-ref>
   supabase db push
   \`\`\`

2. Cargar los datos respetando el orden de este documento: las tablas van
   ordenadas de forma que las dependencias existan antes que quien las referencia
   (organizations antes que contacts, y así). Para cada archivo:

   \`\`\`sql
   INSERT INTO public.<tabla>
   SELECT * FROM jsonb_populate_recordset(NULL::public.<tabla>, '<contenido del json>'::jsonb);
   \`\`\`

   Con archivos grandes conviene trocear el JSON, porque la API de gestión
   rechaza cuerpos de varios megas.

## Aviso sobre datos personales

\`contacts\`, \`contact_consents\`, \`contact_history\` y \`profiles\` contienen datos
personales. **Este respaldo no debe subirse a un repositorio público ni
compartirse por canales abiertos.** Guárdalo cifrado o en almacenamiento privado.

Las tablas de territorio y resultados electorales (\`territorial_units\`,
\`territorial_geometries\`, \`demographics\`, \`section_election_results\`) contienen
únicamente información pública del INE, el INEGI y el IEEZ, y además son
reproducibles con \`scripts/etl_resultados_electorales.py\` y \`scripts/ine/\`.
`,
  "utf8",
);

console.log(`\n${totalFilas.toLocaleString("es-MX")} filas · ${(totalKb / 1024).toFixed(1)} MB`);
console.table(resumen);
