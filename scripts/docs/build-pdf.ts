/**
 * Arma la documentación en PDF a partir de las capturas.
 *
 * Se compone un HTML con las imágenes incrustadas en base64 y se imprime con
 * Chrome headless. Incrustarlas evita que el PDF dependa de rutas locales, y
 * usar el motor del navegador resuelve tipografías, acentos y saltos de página
 * sin traer una librería de PDF al proyecto.
 *
 * Uso:  bun run scripts/docs/build-pdf.ts
 */

const DIR = new URL("../../data/docs/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const HTML_PATH = `${DIR}documentacion.html`;
const PDF_PATH = `${DIR}Territorio-Intelligence-Documentacion.pdf`;

interface Section {
  slug: string;
  title: string;
  tagline: string;
  benefits: string[];
}

const SECTIONS: Section[] = [
  {
    slug: "dashboard",
    title: "Dashboard ejecutivo",
    tagline: "Todo el territorio en una pantalla.",
    benefits: [
      "Población, secciones, contactos y cobertura administrativa como indicadores vivos, calculados sobre datos oficiales del INE y el INEGI.",
      "Gráficas de evolución mensual, estructura por edad y distribución por género, sin necesidad de consultar hojas de cálculo.",
      "Alertas que señalan huecos: secciones sin geometría, contactos sin consentimiento de comunicación.",
    ],
  },
  {
    slug: "mapa",
    title: "Mapa territorial",
    tagline: "1,828 secciones electorales georreferenciadas.",
    benefits: [
      "Cartografía oficial del INE con capas temáticas conmutables: población, contactos, cobertura o densidad por hogar.",
      "Al hacer clic en una sección se despliega su perfil completo —edad, género, hogares, cobertura— sin salir del mapa.",
      "Registro de contactos desde la propia sección, con municipio y clave ya rellenados.",
    ],
  },
  {
    slug: "secciones",
    title: "Catálogo de secciones",
    tagline: "El padrón territorial, buscable y exportable.",
    benefits: [
      "Listado completo con población, hogares, contactos y cobertura calculada por sección.",
      "Búsqueda inmediata por clave de sección o municipio.",
      "Exportación a CSV para cruzar con herramientas externas.",
    ],
  },
  {
    slug: "contactos",
    title: "Contactos",
    tagline: "Padrón administrativo con consentimiento verificable.",
    benefits: [
      "El consentimiento es obligatorio a nivel de base de datos: no existe forma de guardar un contacto sin él.",
      "Teléfonos enmascarados en pantalla y en las exportaciones, con validación de formato mexicano.",
      "Cada alta, edición y baja queda registrada automáticamente en la auditoría.",
    ],
  },
  {
    slug: "analytics",
    title: "Analytics demográfico",
    tagline: "Comparar municipios con cifras del censo.",
    benefits: [
      "Cobertura por municipio y evolución temporal de registros en una sola vista.",
      "Estructura por edad con los rangos exactos del censo a escala municipal.",
      "Exportación directa de los comparativos para presentaciones y reportes.",
    ],
  },
  {
    slug: "monitor",
    title: "Monitor público",
    tagline: "Qué se publica sobre una persona o tema, hoy.",
    benefits: [
      "Búsqueda por nombre que rastrea prensa nacional, medios locales de Zacatecas y foros públicos.",
      "Sentimiento, temas y términos relevantes calculados automáticamente sobre cada contenido.",
      "Resumen ejecutivo en prosa: volumen, tono dominante, fuentes principales y tendencia.",
    ],
  },
  {
    slug: "menciones",
    title: "Menciones",
    tagline: "Cada publicación, con su origen verificable.",
    benefits: [
      "Listado cronológico con sentimiento, fuente y alcance estimado.",
      "Enlace directo a la publicación original para contrastar el análisis.",
      "Exportación a CSV para informes o seguimiento externo.",
    ],
  },
  {
    slug: "reportes",
    title: "Reportes",
    tagline: "Tres informes, tres formatos, un solo origen.",
    benefits: [
      "Reporte territorial, de contactos y de monitoreo, listos para dirección.",
      "PDF con formato ejecutivo, XLSX con una hoja por apartado, y CSV para procesar.",
      "Queda constancia de cada generación —tipo, formato y momento— para auditoría.",
    ],
  },
  {
    slug: "importar",
    title: "Importación de datos",
    tagline: "Cargar territorio sin miedo a romper nada.",
    benefits: [
      "Asistente de siete pasos: archivo, columnas, mapeo, preview, validación, carga y reporte.",
      "Admite CSV, JSON y GeoJSON, y reconoce automáticamente los nombres de columna del INE y el INEGI.",
      "Nada se escribe hasta validar: detecta duplicados, coordenadas imposibles y rangos incoherentes.",
    ],
  },
];

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function imageTag(slug: string): Promise<string> {
  const file = Bun.file(`${DIR}${slug}.png`);
  if (!(await file.exists())) return `<div class="missing">Captura no disponible</div>`;
  const base64 = Buffer.from(await file.arrayBuffer()).toString("base64");
  return `<img src="data:image/png;base64,${base64}" alt="${esc(slug)}"/>`;
}

const pages = await Promise.all(
  SECTIONS.map(async (s, i) => `
    <section class="page">
      <header class="view-header">
        <span class="num">${String(i + 1).padStart(2, "0")}</span>
        <div>
          <h2>${esc(s.title)}</h2>
          <p class="tagline">${esc(s.tagline)}</p>
        </div>
      </header>
      <figure>${await imageTag(s.slug)}</figure>
      <ul>${s.benefits.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>
    </section>`),
);

const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"/>
<title>Territorio Intelligence — Documentación</title>
<style>
  @page { size: A4 landscape; margin: 12mm 14mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: "Segoe UI", system-ui, sans-serif; color: #1C1A17; background: #fff; }

  /*
   * Altura fija en milímetros, no 100%.
   * En impresión el porcentaje se calcula contra el <body>, que no está acotado
   * a la página, así que cada sección crecía sin límite y se partía en tres.
   * A4 apaisado (297×210 mm) menos los márgenes de @page deja 186 mm de alto.
   */
  .page { page-break-after: always; height: 186mm; overflow: hidden;
          display: flex; flex-direction: column; }
  .page:last-child { page-break-after: auto; }

  /* Portada */
  .cover { justify-content: center; align-items: flex-start; padding-left: 12mm; }
  .brand { display: flex; align-items: center; gap: 12px; margin-bottom: 28px; }
  .logo { width: 46px; height: 46px; border-radius: 9px; background: #7A4E23; color: #fff;
          font-family: Georgia, serif; font-size: 26px; font-weight: bold;
          display: flex; align-items: center; justify-content: center; }
  .brand-name { font-family: Georgia, serif; font-size: 21px; font-weight: bold; line-height: 1.1; }
  .brand-sub { font-size: 9px; letter-spacing: .26em; text-transform: uppercase; color: #8a7f74; }
  h1 { font-family: Georgia, serif; font-size: 40px; line-height: 1.12; margin-bottom: 12px; max-width: 620px; }
  .lead { font-size: 14px; color: #5c534b; max-width: 560px; line-height: 1.6; margin-bottom: 30px; }
  .facts { display: flex; gap: 30px; padding-top: 22px; border-top: 3px solid #A8763E; }
  .fact-value { font-family: Georgia, serif; font-size: 27px; font-weight: bold; }
  .fact-label { font-size: 9.5px; text-transform: uppercase; letter-spacing: .1em; color: #8a7f74; margin-top: 2px; }
  .cover-note { margin-top: 26px; font-size: 10px; color: #8a7f74; max-width: 620px; line-height: 1.6; }

  /* Vistas */
  .view-header { display: flex; gap: 14px; align-items: baseline;
                 border-bottom: 2px solid #A8763E; padding-bottom: 8px; margin-bottom: 10px; }
  .num { font-family: Georgia, serif; font-size: 25px; color: #C79E5E; line-height: 1; }
  h2 { font-family: Georgia, serif; font-size: 23px; line-height: 1.15; }
  .tagline { font-size: 12px; color: #5c534b; margin-top: 2px; }

  /* min-height 0 es lo que permite que un hijo flexible se encoja por debajo
     de su contenido; sin él la imagen impone su tamaño y desborda la página. */
  figure { flex: 1 1 auto; min-height: 0; display: flex; align-items: center;
           justify-content: center; background: #FAF7F2; border: 1px solid #E4DCCD;
           border-radius: 7px; overflow: hidden; padding: 5px; }
  img { max-width: 100%; max-height: 100%; object-fit: contain; border-radius: 4px; }
  .missing { color: #b0a698; font-size: 12px; }

  ul { list-style: none; display: flex; gap: 12px; margin-top: 10px; }
  li { flex: 1; font-size: 10.5px; line-height: 1.5; color: #3d3730;
       padding-left: 10px; border-left: 2.5px solid #C79E5E; }
</style></head><body>

<section class="page cover">
  <div class="brand">
    <div class="logo">T</div>
    <div>
      <div class="brand-name">Territorio</div>
      <div class="brand-sub">Intelligence</div>
    </div>
  </div>
  <h1>Inteligencia territorial<br/>para decisiones informadas</h1>
  <p class="lead">
    Plataforma de análisis territorial, demográfico y de presencia pública para el estado
    de Zacatecas. Nueve herramientas sobre datos oficiales del INE y el INEGI.
  </p>
  <div class="facts">
    <div><div class="fact-value">1,828</div><div class="fact-label">Secciones electorales</div></div>
    <div><div class="fact-value">1,622,138</div><div class="fact-label">Habitantes representados</div></div>
    <div><div class="fact-value">58</div><div class="fact-label">Municipios</div></div>
    <div><div class="fact-value">224</div><div class="fact-label">Indicadores por sección</div></div>
  </div>
  <p class="cover-note">
    Los datos demográficos se presentan exclusivamente de forma agregada. La plataforma no infiere,
    almacena ni predice preferencias políticas, afiliación ni intención de voto de personas.
    Los contactos son registros administrativos que requieren consentimiento explícito.
  </p>
</section>

${pages.join("")}
</body></html>`;

await Bun.write(HTML_PATH, html);
console.log(`HTML generado: ${(html.length / 1024 / 1024).toFixed(2)} MB`);

const proc = Bun.spawn(
  [
    CHROME,
    "--headless=new",
    "--disable-gpu",
    "--no-pdf-header-footer",
    `--print-to-pdf=${PDF_PATH}`,
    `--user-data-dir=${DIR}chrome-pdf-profile`,
    `file:///${HTML_PATH.replace(/\\/g, "/")}`,
  ],
  { stdout: "ignore", stderr: "pipe" },
);
await proc.exited;

const pdf = Bun.file(PDF_PATH);
if (await pdf.exists()) {
  console.log(`PDF generado: ${((await pdf.size) / 1024 / 1024).toFixed(2)} MB`);
  console.log(PDF_PATH);
} else {
  console.log("No se generó el PDF:", await new Response(proc.stderr).text());
}
