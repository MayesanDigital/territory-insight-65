export function toCSV(rows: Array<Record<string, unknown>>): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => escape(r[h])).join(",")),
  ].join("\n");
}

export function downloadFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportCSV(filename: string, rows: Array<Record<string, unknown>>) {
  downloadFile(filename, "\uFEFF" + toCSV(rows), "text/csv;charset=utf-8;");
}

export function exportJSON(filename: string, data: unknown) {
  downloadFile(filename, JSON.stringify(data, null, 2), "application/json");
}

/** Genera un archivo imprimible (PDF vía diálogo de impresión del navegador). */
export function exportPrintablePDF(title: string, sections: Array<{ heading: string; rows: Array<Record<string, unknown>> }>) {
  const win = window.open("", "_blank");
  if (!win) return;
  const tables = sections
    .map((section) => {
      if (section.rows.length === 0) return `<h2>${section.heading}</h2><p>Sin datos.</p>`;
      const headers = Object.keys(section.rows[0]);
      return `<h2>${section.heading}</h2><table><thead><tr>${headers
        .map((h) => `<th>${h}</th>`)
        .join("")}</tr></thead><tbody>${section.rows
        .map((r) => `<tr>${headers.map((h) => `<td>${r[h] ?? ""}</td>`).join("")}</tr>`)
        .join("")}</tbody></table>`;
    })
    .join("");
  win.document.write(`<html><head><title>${title}</title><style>
    body{font-family:Georgia,serif;padding:32px;color:#1C1A17}
    h1{border-bottom:2px solid #A8763E;padding-bottom:8px}
    h2{margin-top:28px;font-size:16px}
    table{width:100%;border-collapse:collapse;font-family:system-ui;font-size:11px;margin-top:8px}
    th,td{border:1px solid #ddd;padding:5px 7px;text-align:left}
    th{background:#F7F3EC}
    footer{margin-top:36px;font-size:10px;color:#666}
  </style></head><body><h1>${title}</h1>
  <p style="font-family:system-ui;font-size:12px;color:#666">Generado el ${new Date().toLocaleString("es-MX")} · Territorio Intelligence</p>
  ${tables}
  <footer>Datos demográficos presentados exclusivamente de forma agregada. Los contactos son registros administrativos con consentimiento y no representan preferencias, afiliación ni intención de voto.</footer>
  </body></html>`);
  win.document.close();
  win.focus();
  win.print();
}

/** Excel-compatible (SpreadsheetML simple / CSV con separador de tabulación). */
export function exportExcel(filename: string, rows: Array<Record<string, unknown>>) {
  if (rows.length === 0) return;
  const headers = Object.keys(rows[0]);
  const xml = `<?xml version="1.0"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Worksheet ss:Name="Datos"><Table>
<Row>${headers.map((h) => `<Cell><Data ss:Type="String">${h}</Data></Cell>`).join("")}</Row>
${rows
  .map(
    (r) =>
      `<Row>${headers
        .map((h) => {
          const v = r[h];
          const isNum = typeof v === "number";
          const safe = String(v ?? "").replace(/[<>&]/g, (c) =>
            c === "<" ? "&lt;" : c === ">" ? "&gt;" : "&amp;",
          );
          return `<Cell><Data ss:Type="${isNum ? "Number" : "String"}">${safe}</Data></Cell>`;
        })
        .join("")}</Row>`,
  )
  .join("")}
</Table></Worksheet></Workbook>`;
  downloadFile(filename, xml, "application/vnd.ms-excel");
}

export function parseCSV(text: string): Array<Record<string, string>> {
  const lines = text.replace(/\r/g, "").split("\n").filter((l) => l.trim().length > 0);
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
      } else if (ch === "," && !quoted) {
        out.push(cur);
        cur = "";
      } else cur += ch;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };
  const headers = split(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = split(line);
    return Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? ""]));
  });
}
