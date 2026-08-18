/**
 * Generador de archivos .xlsx reales, sin dependencias.
 *
 * La implementación anterior producía SpreadsheetML 2003 (XML plano) servido
 * como `application/vnd.ms-excel`. Excel lo abre, pero avisa de que el formato
 * y la extensión no coinciden, y otras herramientas —Google Sheets, pandas,
 * Power BI— directamente lo rechazan. Un .xlsx es un ZIP con XML dentro, así
 * que se construye aquí el ZIP a mano y el archivo es válido en todas partes.
 *
 * Las entradas se guardan sin comprimir (método STORE). Un reporte de unas
 * miles de filas pesa poco, y evitar DEFLATE ahorra traer una librería de
 * compresión al bundle del cliente.
 */

export interface Sheet {
  name: string;
  rows: Array<Record<string, unknown>>;
}

// -----------------------------------------------------------------------------
// CRC-32, obligatorio en la cabecera de cada entrada del ZIP
// -----------------------------------------------------------------------------
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// -----------------------------------------------------------------------------
// ZIP mínimo
// -----------------------------------------------------------------------------
interface ZipEntry {
  name: string;
  data: Uint8Array;
  crc: number;
  offset: number;
}

function zip(files: Array<{ name: string; content: string }>): Blob {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const entries: ZipEntry[] = [];
  let offset = 0;

  const push = (bytes: Uint8Array) => {
    chunks.push(bytes);
    offset += bytes.length;
  };

  const u16 = (n: number) => new Uint8Array([n & 0xff, (n >>> 8) & 0xff]);
  const u32 = (n: number) =>
    new Uint8Array([n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]);

  for (const file of files) {
    const nameBytes = encoder.encode(file.name);
    const data = encoder.encode(file.content);
    const crc = crc32(data);
    const entryOffset = offset;

    // Local file header
    push(u32(0x04034b50));
    push(u16(20)); // versión mínima
    push(u16(0)); // flags
    push(u16(0)); // método 0 = STORE
    push(u16(0)); // hora
    push(u16(0)); // fecha
    push(u32(crc));
    push(u32(data.length)); // comprimido
    push(u32(data.length)); // sin comprimir
    push(u16(nameBytes.length));
    push(u16(0)); // extra
    push(nameBytes);
    push(data);

    entries.push({ name: file.name, data, crc, offset: entryOffset });
  }

  const centralStart = offset;
  for (const e of entries) {
    const nameBytes = encoder.encode(e.name);
    push(u32(0x02014b50));
    push(u16(20)); // versión creador
    push(u16(20)); // versión mínima
    push(u16(0));
    push(u16(0));
    push(u16(0));
    push(u16(0));
    push(u32(e.crc));
    push(u32(e.data.length));
    push(u32(e.data.length));
    push(u16(nameBytes.length));
    push(u16(0)); // extra
    push(u16(0)); // comentario
    push(u16(0)); // disco
    push(u16(0)); // atributos internos
    push(u32(0)); // atributos externos
    push(u32(e.offset));
    push(nameBytes);
  }
  const centralSize = offset - centralStart;

  // End of central directory
  push(u32(0x06054b50));
  push(u16(0));
  push(u16(0));
  push(u16(entries.length));
  push(u16(entries.length));
  push(u32(centralSize));
  push(u32(centralStart));
  push(u16(0));

  return new Blob(chunks as BlobPart[], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

// -----------------------------------------------------------------------------
// XML de la hoja
// -----------------------------------------------------------------------------
const esc = (v: string) =>
  v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    // Excel rechaza el archivo si aparecen caracteres de control.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

/** 0 -> A, 25 -> Z, 26 -> AA */
function columnName(index: number): string {
  let name = "";
  let n = index;
  do {
    name = String.fromCharCode(65 + (n % 26)) + name;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return name;
}

/** Excel limita los nombres de hoja a 31 caracteres y prohíbe : \ / ? * [ ] */
function safeSheetName(name: string, fallback: string): string {
  const clean = name.replace(/[:\\/?*[\]]/g, " ").trim().slice(0, 31);
  return clean || fallback;
}

function sheetXml(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/></worksheet>`;
  }

  const headers = Object.keys(rows[0]!);
  const cell = (ref: string, value: unknown, bold = false) => {
    const style = bold ? ' s="1"' : "";
    if (typeof value === "number" && Number.isFinite(value)) {
      return `<c r="${ref}"${style}><v>${value}</v></c>`;
    }
    if (value === null || value === undefined || value === "") return `<c r="${ref}"${style}/>`;
    // Cadena en línea: evita mantener la tabla de sharedStrings.
    return `<c r="${ref}" t="inlineStr"${style}><is><t xml:space="preserve">${esc(String(value))}</t></is></c>`;
  };

  const body = [
    `<row r="1">${headers.map((h, i) => cell(`${columnName(i)}1`, h, true)).join("")}</row>`,
    ...rows.map(
      (row, r) =>
        `<row r="${r + 2}">${headers
          .map((h, i) => cell(`${columnName(i)}${r + 2}`, row[h]))
          .join("")}</row>`,
    ),
  ].join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
}

/** Construye un libro .xlsx válido con una hoja por entrada. */
export function buildXlsx(sheets: Sheet[]): Blob {
  const used = new Set<string>();
  const names = sheets.map((s, i) => {
    let name = safeSheetName(s.name, `Hoja${i + 1}`);
    // Excel no admite nombres de hoja repetidos.
    let n = 2;
    while (used.has(name.toLowerCase())) name = `${safeSheetName(s.name, "Hoja").slice(0, 28)}_${n++}`;
    used.add(name.toLowerCase());
    return name;
  });

  const files = [
    {
      name: "[Content_Types].xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${sheets
  .map(
    (_s, i) =>
      `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
  )
  .join("\n")}
</Types>`,
    },
    {
      name: "_rels/.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
    },
    {
      name: "xl/workbook.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${names
        .map((n, i) => `<sheet name="${esc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
        .join("")}</sheets>
</workbook>`,
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${sheets
  .map(
    (_s, i) =>
      `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
  )
  .join("\n")}
<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
    },
    {
      // Un único estilo: el índice 1 pone la fila de encabezados en negrita.
      name: "xl/styles.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="1"><fill><patternFill patternType="none"/></fill></fills>
<borders count="1"><border/></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs>
</styleSheet>`,
    },
    ...sheets.map((s, i) => ({
      name: `xl/worksheets/sheet${i + 1}.xml`,
      content: sheetXml(s.rows),
    })),
  ];

  return zip(files);
}
