/**
 * ETL de las secciones electorales de Zacatecas.
 *
 * Cruza tres fuentes oficiales que no vienen alineadas entre sí:
 *   · SECCION.shp        — polígonos del INE, corte 20-ene-2021, en UTM 13N
 *   · ECEG 32 Zacatecas  — 227 indicadores del Censo 2020 por sección
 *   · Catálogo de Secciones — nombres de municipio y tipo, corte ene-2026
 *
 * Produce un JSON listo para importar. Sin dependencias: el shapefile y el
 * xlsx se parsean a mano para no arrastrar GDAL ni una librería de Excel a un
 * proyecto que no las necesita en runtime.
 *
 * Uso:  bun run scripts/ine/build-zacatecas.ts
 */

const DATA = new URL("../../data/ine/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const OUT = `${DATA}zacatecas-secciones.json`;

// -----------------------------------------------------------------------------
// Reproyección UTM 13N (WGS84) -> lat/lng
// El shapefile del INE viene en metros proyectados; Leaflet necesita grados.
// -----------------------------------------------------------------------------
const A = 6378137.0;
const F = 1 / 298.257223563;
const K0 = 0.9996;
const E2 = F * (2 - F);
const E1 = (1 - Math.sqrt(1 - E2)) / (1 + Math.sqrt(1 - E2));
const EP2 = E2 / (1 - E2);
const LON0 = (-105 * Math.PI) / 180; // meridiano central de la zona 13

function utmToLatLng(easting: number, northing: number): [number, number] {
  const x = easting - 500000;
  const M = northing / K0;
  const mu = M / (A * (1 - E2 / 4 - (3 * E2 ** 2) / 64 - (5 * E2 ** 3) / 256));

  const phi1 =
    mu +
    ((3 * E1) / 2 - (27 * E1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * E1 ** 2) / 16 - (55 * E1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * E1 ** 3) / 96) * Math.sin(6 * mu) +
    ((1097 * E1 ** 4) / 512) * Math.sin(8 * mu);

  const sinPhi1 = Math.sin(phi1);
  const cosPhi1 = Math.cos(phi1);
  const tanPhi1 = Math.tan(phi1);

  const C1 = EP2 * cosPhi1 ** 2;
  const T1 = tanPhi1 ** 2;
  const N1 = A / Math.sqrt(1 - E2 * sinPhi1 ** 2);
  const R1 = (A * (1 - E2)) / (1 - E2 * sinPhi1 ** 2) ** 1.5;
  const D = x / (N1 * K0);

  const lat =
    phi1 -
    ((N1 * tanPhi1) / R1) *
      (D ** 2 / 2 -
        ((5 + 3 * T1 + 10 * C1 - 4 * C1 ** 2 - 9 * EP2) * D ** 4) / 24 +
        ((61 + 90 * T1 + 298 * C1 + 45 * T1 ** 2 - 252 * EP2 - 3 * C1 ** 2) * D ** 6) / 720);

  const lng =
    LON0 +
    (D -
      ((1 + 2 * T1 + C1) * D ** 3) / 6 +
      ((5 - 2 * C1 + 28 * T1 - 3 * C1 ** 2 + 8 * EP2 + 24 * T1 ** 2) * D ** 5) / 120) /
      cosPhi1;

  return [(lng * 180) / Math.PI, (lat * 180) / Math.PI];
}

// -----------------------------------------------------------------------------
// Shapefile
// -----------------------------------------------------------------------------
type Ring = [number, number][];

/** Área con signo. En un shapefile el anillo exterior va en sentido horario. */
function signedArea(ring: Ring): number {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i]!;
    const [x2, y2] = ring[i + 1]!;
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}

interface Shape {
  rings: Ring[];
  bbox: [number, number, number, number];
}

function readShapefile(buffer: ArrayBuffer): Shape[] {
  const dv = new DataView(buffer);
  const shapes: Shape[] = [];
  let offset = 100; // cabecera del archivo

  while (offset < buffer.byteLength) {
    const contentLength = dv.getInt32(offset + 4, false) * 2;
    const recStart = offset + 8;
    const shapeType = dv.getInt32(recStart, true);

    if (shapeType === 5) {
      const numParts = dv.getInt32(recStart + 36, true);
      const numPoints = dv.getInt32(recStart + 40, true);
      const partsStart = recStart + 44;
      const pointsStart = partsStart + numParts * 4;

      const parts: number[] = [];
      for (let i = 0; i < numParts; i++) parts.push(dv.getInt32(partsStart + i * 4, true));
      parts.push(numPoints);

      const rings: Ring[] = [];
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

      for (let p = 0; p < numParts; p++) {
        const ring: Ring = [];
        for (let i = parts[p]!; i < parts[p + 1]!; i++) {
          const px = dv.getFloat64(pointsStart + i * 16, true);
          const py = dv.getFloat64(pointsStart + i * 16 + 8, true);
          const [lng, lat] = utmToLatLng(px, py);
          // 6 decimales ~ 11 cm: más precisión solo infla el JSON.
          const rl = Math.round(lng * 1e6) / 1e6;
          const ra = Math.round(lat * 1e6) / 1e6;
          ring.push([rl, ra]);
          if (rl < minX) minX = rl;
          if (rl > maxX) maxX = rl;
          if (ra < minY) minY = ra;
          if (ra > maxY) maxY = ra;
        }
        if (ring.length >= 4) rings.push(ring);
      }
      shapes.push({ rings, bbox: [minX, minY, maxX, maxY] });
    } else {
      shapes.push({ rings: [], bbox: [0, 0, 0, 0] });
    }
    offset = recStart + contentLength;
  }
  return shapes;
}

/**
 * Agrupa anillos en geometría GeoJSON.
 * Un anillo horario abre un polígono nuevo; uno antihorario es un hueco del
 * polígono abierto más recientemente.
 */
function toGeoJSON(shape: Shape) {
  if (shape.rings.length === 0) return null;

  const polygons: Ring[][] = [];
  for (const ring of shape.rings) {
    if (signedArea(ring) < 0) {
      polygons.push([ring]); // horario -> exterior
    } else if (polygons.length > 0) {
      polygons[polygons.length - 1]!.push(ring); // antihorario -> hueco
    } else {
      polygons.push([ring]); // hueco sin exterior previo: se trata como exterior
    }
  }

  return polygons.length === 1
    ? { type: "Polygon" as const, coordinates: polygons[0] }
    : { type: "MultiPolygon" as const, coordinates: polygons };
}

/** Centroide por área del anillo exterior mayor. */
function centroidOf(shape: Shape): [number, number] | [null, null] {
  let best: Ring | null = null;
  let bestArea = 0;
  for (const ring of shape.rings) {
    const area = Math.abs(signedArea(ring));
    if (area > bestArea) { bestArea = area; best = ring; }
  }
  if (!best) return [null, null];

  let cx = 0, cy = 0, a = 0;
  for (let i = 0; i < best.length - 1; i++) {
    const [x1, y1] = best[i]!;
    const [x2, y2] = best[i + 1]!;
    const cross = x1 * y2 - x2 * y1;
    a += cross;
    cx += (x1 + x2) * cross;
    cy += (y1 + y2) * cross;
  }
  a /= 2;
  if (a === 0) return [best[0]![1], best[0]![0]];
  return [Math.round((cy / (6 * a)) * 1e6) / 1e6, Math.round((cx / (6 * a)) * 1e6) / 1e6];
}

// -----------------------------------------------------------------------------
// DBF
// -----------------------------------------------------------------------------
function readDBF(buffer: ArrayBuffer): Record<string, string>[] {
  const dv = new DataView(buffer);
  const numRecords = dv.getUint32(4, true);
  const headerLen = dv.getUint16(8, true);
  const recordLen = dv.getUint16(10, true);
  const dec = new TextDecoder("latin1");

  const fields: { name: string; len: number; offset: number }[] = [];
  let off = 32, dataOff = 1;
  while (off < headerLen - 1) {
    const name = dec.decode(new Uint8Array(buffer, off, 11)).replace(/\0.*$/, "").trim();
    if (!name) break;
    const len = dv.getUint8(off + 16);
    fields.push({ name, len, offset: dataOff });
    dataOff += len;
    off += 32;
  }

  const out: Record<string, string>[] = [];
  for (let i = 0; i < numRecords; i++) {
    const base = headerLen + i * recordLen;
    const rec: Record<string, string> = {};
    for (const f of fields) {
      rec[f.name] = dec.decode(new Uint8Array(buffer, base + f.offset, f.len)).trim();
    }
    out.push(rec);
  }
  return out;
}

// -----------------------------------------------------------------------------
// XLSX (una hoja, sin formato: basta con sharedStrings + celdas)
// -----------------------------------------------------------------------------
function colIndex(ref: string): number {
  let n = 0;
  for (const ch of ref) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

async function readSheet(dir: string): Promise<Record<string, string>[]> {
  const ssXml = await Bun.file(`${dir}/xl/sharedStrings.xml`).text();
  const strings = [...ssXml.matchAll(/<si>(.*?)<\/si>/gs)].map((m) =>
    [...m[1]!.matchAll(/<t[^>]*>(.*?)<\/t>/gs)].map((t) => t[1]).join(""),
  );

  const sheet = await Bun.file(`${dir}/xl/worksheets/sheet1.xml`).text();
  const rows: string[][] = [];
  for (const r of sheet.matchAll(/<row[^>]*>(.*?)<\/row>/gs)) {
    const cells: string[] = [];
    for (const c of r[1]!.matchAll(/<c r="([A-Z]+)\d+"(?:[^>]*t="(\w+)")?[^>]*>(?:<v>(.*?)<\/v>)?/g)) {
      cells[colIndex(c[1]!)] =
        c[3] === undefined ? "" : c[2] === "s" ? String(strings[Number(c[3])]) : c[3]!;
    }
    rows.push(cells);
  }

  const header = rows[0]!;
  return rows.slice(1).map((r) => {
    const o: Record<string, string> = {};
    header.forEach((h, i) => { o[h!] = r[i] ?? ""; });
    return o;
  });
}

// -----------------------------------------------------------------------------
// Construcción
// -----------------------------------------------------------------------------
// El ECEG usa '*' para suprimir valores por confidencialidad estadística
// cuando el conteo es tan bajo que permitiría identificar a alguien.
const n = (v: string | undefined) => (!v || v === "*" || v === "N/D" ? 0 : Number(v) || 0);

console.log("Leyendo shapefile…");
const shpDir = `${DATA}seccional/32_ZACATECAS`;
const shapes = readShapefile(await Bun.file(`${shpDir}/SECCION.shp`).arrayBuffer());
const dbf = readDBF(await Bun.file(`${shpDir}/SECCION.dbf`).arrayBuffer());
console.log(`  ${shapes.length} geometrías, ${dbf.length} registros`);

console.log("Leyendo censo ECEG…");
const eceg = await readSheet(`${DATA}_eceg_x`);
console.log(`  ${eceg.length} secciones con datos censales`);

console.log("Leyendo catálogo…");
const catLines = (await Bun.file(`${DATA}catalogo_secciones_32.txt`).text()).trim().split(/\r?\n/);
const catalogo = new Map<string, { municipio: string; district: number; type: string }>();
// El catálogo también relaciona clave de municipio con su nombre. Sin este
// índice, las secciones extintas —que están en el shapefile pero ya no en el
// catálogo— se quedarían sin nombre de municipio e inflarían el conteo con
// marcadores del tipo "Municipio 33".
const municipioPorClave = new Map<string, string>();
for (const line of catLines.slice(1)) {
  const p = line.split("|");
  catalogo.set(String(Number(p[5])), {
    municipio: p[4]!.trim(),
    district: Number(p[2]),
    type: p[6]!.replace(/\(A\)$/, "").trim(),
  });
  municipioPorClave.set(String(Number(p[3])), p[4]!.trim());
}
console.log(`  ${catalogo.size} secciones vigentes, ${municipioPorClave.size} municipios`);

// Índices por clave de sección
const geomBySection = new Map<string, { shape: Shape; municipioCode: string }>();
dbf.forEach((rec, i) => {
  geomBySection.set(String(Number(rec["SECCION"])), {
    shape: shapes[i]!,
    municipioCode: rec["MUNICIPIO"]!,
  });
});
const censoBySection = new Map(eceg.map((r) => [String(Number(r["SECCION"])), r]));

const claves = new Set([...geomBySection.keys(), ...censoBySection.keys(), ...catalogo.keys()]);
console.log(`\nUniverso: ${claves.size} secciones distintas`);

const records = [];
const stats = {
  complete: 0,
  catalog_only: 0,
  census_only: 0,
  sinGeometria: 0,
  sinMunicipio: 0,
  sinNombreMunicipio: 0,
};

for (const clave of [...claves].sort((a, b) => Number(a) - Number(b))) {
  const geo = geomBySection.get(clave);
  const censo = censoBySection.get(clave);
  const cat = catalogo.get(clave);

  const data_status = cat ? (censo ? "complete" : "catalog_only") : "census_only";
  stats[data_status]++;
  if (!geo) stats.sinGeometria++;

  // Para una sección extinta el nombre se recupera por la clave de municipio
  // que trae el propio shapefile.
  const municipio =
    cat?.municipio ??
    (geo ? municipioPorClave.get(String(Number(geo.municipioCode))) : undefined) ??
    "Sin municipio";
  if (!cat) stats.sinMunicipio++;
  if (municipio === "Sin municipio") stats.sinNombreMunicipio++;

  let geometry = null;
  let centroid: [number, number] | [null, null] = [null, null];
  if (geo) {
    geometry = toGeoJSON(geo.shape);
    centroid = centroidOf(geo.shape);
  }

  // Rangos que la fuente sí publica. 25–59 se obtiene por resta; se acota a 0
  // porque el redondeo de la supresión estadística puede dar negativos.
  const adults = n(censo?.["P_18YMAS"]);
  const a1824 = n(censo?.["P_18A24"]);
  const a60 = n(censo?.["P_60YMAS"]);

  const indicators: Record<string, number> = {};
  if (censo) {
    for (const [k, v] of Object.entries(censo)) {
      if (k === "ID" || k === "ENTIDAD" || k === "SECCION") continue;
      indicators[k] = n(v);
    }
  }

  records.push({
    section_code: clave.padStart(4, "0"),
    municipio,
    localidad: null,
    district: cat?.district ?? null,
    section_type: cat?.type ?? null,
    data_status,
    demographics: censo
      ? {
          population: n(censo["POBTOT"]),
          age_0_17: n(censo["P_0A17"]),
          age_18_24: a1824,
          age_25_59: Math.max(0, adults - a1824 - a60),
          age_60_plus: a60,
          adults_18_plus: adults,
          gender_female: n(censo["POBFEM"]),
          gender_male: n(censo["POBMAS"]),
          gender_other: 0,
          households: n(censo["TOTHOG"]),
          centroid_lat: centroid[0],
          centroid_lng: centroid[1],
          indicators,
        }
      : { population: 0, centroid_lat: centroid[0], centroid_lng: centroid[1] },
    geometry,
  });
}

await Bun.write(OUT, JSON.stringify(records));

console.log(`\n=== RESULTADO ===`);
console.log(`  completas (geometría + censo + catálogo): ${stats.complete}`);
console.log(`  solo catálogo (sección nueva, sin censo): ${stats.catalog_only}`);
console.log(`  solo censo (sección ya extinta):          ${stats.census_only}`);
console.log(`  sin geometría:                           ${stats.sinGeometria}`);
console.log(`  sin nombre de municipio:                 ${stats.sinNombreMunicipio}`);
console.log(`  municipios distintos:                    ${new Set(records.map((r) => r.municipio)).size}`);
console.log(`\n  población total: ${records.reduce((s, r) => s + (r.demographics.population ?? 0), 0).toLocaleString("es-MX")}`);
console.log(`  archivo: ${OUT}`);
console.log(`  tamaño:  ${((await Bun.file(OUT).size) / 1024 / 1024).toFixed(2)} MB`);
