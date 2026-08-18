import { buildXlsx, type Sheet } from "@/lib/xlsx";

export type Row = Record<string, unknown>;

/**
 * Añade la extensión si el nombre no la trae.
 *
 * Todas las llamadas pasaban solo "contactos" o "reporte-cobertura", así que
 * el navegador descargaba archivos sin extensión que Windows no sabía abrir.
 */
function withExtension(filename: string, extension: string): string {
  const suffix = `.${extension}`;
  return filename.toLowerCase().endsWith(suffix) ? filename : `${filename}${suffix}`;
}

/** Marca de tiempo para distinguir descargas sucesivas del mismo reporte. */
export function stamped(name: string): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const time = now.toTimeString().slice(0, 5).replace(":", "");
  return `${name}_${date}_${time}`;
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Liberar de inmediato aborta la descarga en algunos navegadores.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadFile(filename: string, content: string, mime: string) {
  downloadBlob(filename, new Blob([content], { type: mime }));
}

// -----------------------------------------------------------------------------
// CSV
// -----------------------------------------------------------------------------
export function toCSV(rows: Row[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]!);
  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))].join(
    "\n",
  );
}

export function exportCSV(filename: string, rows: Row[]) {
  // El BOM es lo que hace que Excel en español abra el archivo en UTF-8 y no
  // convierta los acentos en caracteres rotos.
  downloadFile(withExtension(filename, "csv"), "﻿" + toCSV(rows), "text/csv;charset=utf-8;");
}

export function exportJSON(filename: string, data: unknown) {
  downloadFile(withExtension(filename, "json"), JSON.stringify(data, null, 2), "application/json");
}

// -----------------------------------------------------------------------------
// XLSX
// -----------------------------------------------------------------------------
export function exportExcel(filename: string, rows: Row[], sheetName = "Datos") {
  downloadBlob(withExtension(filename, "xlsx"), buildXlsx([{ name: sheetName, rows }]));
}

/** Libro con varias hojas: una por sección del reporte. */
export function exportWorkbook(filename: string, sheets: Sheet[]) {
  downloadBlob(withExtension(filename, "xlsx"), buildXlsx(sheets));
}

// -----------------------------------------------------------------------------
// PDF
// -----------------------------------------------------------------------------
export interface ReportSection {
  heading: string;
  description?: string;
  rows: Row[];
}

export interface ReportMeta {
  title: string;
  subtitle?: string;
  organization?: string;
  /** Pares indicador/valor que encabezan el reporte. */
  kpis?: Array<{ label: string; value: string }>;
  /** Texto en prosa que precede a las tablas. */
  summary?: string[];
}

/**
 * Genera el PDF a través del diálogo de impresión del navegador.
 *
 * Se prefiere a una librería de PDF por dos razones: el motor del navegador
 * resuelve tipografías, saltos de página y acentos correctamente —cosa que
 * cuesta con generadores manuales— y evita sumar ~400 KB al bundle. El usuario
 * elige "Guardar como PDF" en el diálogo.
 */
export function exportPrintablePDF(meta: ReportMeta, sections: ReportSection[]) {
  const win = window.open("", "_blank");
  if (!win) {
    throw new Error("El navegador bloqueó la ventana. Permite las ventanas emergentes del sitio.");
  }

  const escapeHtml = (v: unknown) =>
    String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const kpis = meta.kpis?.length
    ? `<section class="kpis">${meta.kpis
        .map(
          (k) =>
            `<div class="kpi"><span class="kpi-label">${escapeHtml(k.label)}</span><span class="kpi-value">${escapeHtml(k.value)}</span></div>`,
        )
        .join("")}</section>`
    : "";

  const summary = meta.summary?.length
    ? `<section class="summary">${meta.summary.map((p) => `<p>${escapeHtml(p)}</p>`).join("")}</section>`
    : "";

  const tables = sections
    .map((section) => {
      const intro = section.description
        ? `<p class="section-note">${escapeHtml(section.description)}</p>`
        : "";
      if (section.rows.length === 0) {
        return `<h2>${escapeHtml(section.heading)}</h2>${intro}<p class="empty">Sin datos para este apartado.</p>`;
      }
      const headers = Object.keys(section.rows[0]!);
      const isNumeric = (h: string) => section.rows.every((r) => typeof r[h] === "number");
      return `<h2>${escapeHtml(section.heading)}</h2>${intro}
        <table>
          <thead><tr>${headers
            .map((h) => `<th class="${isNumeric(h) ? "num" : ""}">${escapeHtml(h)}</th>`)
            .join("")}</tr></thead>
          <tbody>${section.rows
            .map(
              (r) =>
                `<tr>${headers
                  .map((h) => {
                    const v = r[h];
                    const text = typeof v === "number" ? v.toLocaleString("es-MX") : escapeHtml(v);
                    return `<td class="${isNumeric(h) ? "num" : ""}">${text}</td>`;
                  })
                  .join("")}</tr>`,
            )
            .join("")}</tbody>
        </table>`;
    })
    .join("");

  win.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"/>
<title>${escapeHtml(meta.title)}</title>
<style>
  @page { margin: 18mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family: Georgia, "Times New Roman", serif; color: #1C1A17; margin: 0; }
  header { border-bottom: 3px solid #A8763E; padding-bottom: 12px; margin-bottom: 20px; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .subtitle { font-family: system-ui, sans-serif; font-size: 12px; color: #6b625a; margin: 0; }
  .meta { font-family: system-ui, sans-serif; font-size: 11px; color: #6b625a; margin-top: 6px; }
  h2 { font-size: 14px; margin: 26px 0 6px; padding-bottom: 4px; border-bottom: 1px solid #E4DCCD; page-break-after: avoid; }
  .section-note { font-family: system-ui, sans-serif; font-size: 10px; color: #6b625a; margin: 0 0 8px; }
  .kpis { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 18px; }
  .kpi { border: 1px solid #E4DCCD; border-radius: 6px; padding: 8px 14px; min-width: 118px; }
  .kpi-label { display: block; font-family: system-ui, sans-serif; font-size: 9px; text-transform: uppercase; letter-spacing: .08em; color: #6b625a; }
  .kpi-value { display: block; font-size: 17px; font-weight: bold; margin-top: 2px; }
  .summary p { font-size: 12px; line-height: 1.55; margin: 0 0 8px; }
  table { width: 100%; border-collapse: collapse; font-family: system-ui, sans-serif; font-size: 10px; }
  th, td { border: 1px solid #E4DCCD; padding: 4px 7px; text-align: left; }
  th { background: #F7F3EC; font-weight: 600; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  /* Repetir el encabezado en cada página impresa. */
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
  .empty { font-family: system-ui, sans-serif; font-size: 11px; color: #8a7f74; }
  footer { margin-top: 30px; padding-top: 10px; border-top: 1px solid #E4DCCD; font-family: system-ui, sans-serif; font-size: 9px; color: #6b625a; line-height: 1.5; }
</style></head><body>
<header>
  <h1>${escapeHtml(meta.title)}</h1>
  ${meta.subtitle ? `<p class="subtitle">${escapeHtml(meta.subtitle)}</p>` : ""}
  <p class="meta">${meta.organization ? `${escapeHtml(meta.organization)} · ` : ""}Generado el ${new Date().toLocaleString("es-MX")}</p>
</header>
${kpis}
${summary}
${tables}
<footer>
  Los datos demográficos se presentan exclusivamente de forma agregada. Los contactos son
  registros administrativos con consentimiento y no representan preferencias, afiliación ni
  intención de voto. El monitoreo cubre contenidos públicos y no perfila a personas.
</footer>
</body></html>`);

  win.document.close();
  win.focus();
  // Dar un instante al render antes de abrir el diálogo, o algunas páginas
  // salen sin estilos aplicados.
  setTimeout(() => win.print(), 250);
}

// -----------------------------------------------------------------------------
// CSV de entrada
// -----------------------------------------------------------------------------
export function parseCSV(text: string): Array<Record<string, string>> {
  const lines = text
    .replace(/\r/g, "")
    .split("\n")
    .filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  const split = (line: string) => {
    const out: string[] = [];
    let cur = "";
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (quoted && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else quoted = !quoted;
      } else if ((ch === "," || ch === ";") && !quoted) {
        out.push(cur);
        cur = "";
      } else cur += ch;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };

  // El BOM se cuela en la primera cabecera y rompe el nombre de la columna.
  const headers = split(lines[0]!.replace(/^﻿/, ""));
  return lines.slice(1).map((line) => {
    const cells = split(line);
    return Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? ""]));
  });
}
