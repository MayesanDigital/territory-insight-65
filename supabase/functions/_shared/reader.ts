/**
 * Lectura del texto completo de una nota mediante Jina Reader.
 *
 * El monitor solo recibe de los feeds el titular y un extracto de unos 300
 * caracteres; con eso el sentimiento se decide casi siempre por el titular. Leer
 * el artículo da contexto real al análisis.
 *
 * Se usa sin clave de API. Eso impone un límite de 20 peticiones por minuto por
 * IP, compartido con otros clientes que salen por la misma red de Supabase, así
 * que la lectura es un complemento que puede fallar sin romper la corrida: la
 * nota que no se lee conserva su extracto original.
 *
 * El texto completo NO se almacena. El PRD §14 pide no guardar más contenido
 * del necesario y el artículo es obra protegida; se usa en memoria para
 * analizar y solo se guarda un fragmento corto donde aparece el sujeto.
 */

const READER = "https://r.jina.ai/";

/**
 * Enfocar el nodo del artículo quita menús, cabeceras y pies. Sin selector, las
 * pruebas con Sopitas, Uniradio y ZHN devolvían primero el menú de secciones del
 * sitio, que ensucia el sentimiento y los temas.
 */
const TARGET = "article, main, [itemprop='articleBody']";
const REMOVE = [
  "nav", "header", "footer", "aside", "form", "script", "style",
  ".share", ".related", ".comments",
  // Las migas de pan se colaban al inicio del cuerpo ("HomeDestacados…").
  ".breadcrumb", ".breadcrumbs", "[class*='breadcrumb']", "[aria-label='breadcrumb']",
].join(", ");

/** Menos que esto suele ser un aviso de cookies o una página de error, no una nota. */
const MIN_ARTICLE_CHARS = 300;
/** Tope para el análisis: el cuerpo de una nota cabe de sobra. */
const MAX_ANALYSIS_CHARS = 6000;

export type ReadOutcome =
  | { ok: true; text: string }
  | { ok: false; reason: "rate_limited" | "blocked" | "too_short" | "timeout" | "error"; detail?: string };

export async function readArticle(url: string, userAgent: string, timeoutMs = 15_000): Promise<ReadOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${READER}${url}`, {
      headers: {
        "X-Return-Format": "text",
        "X-Target-Selector": TARGET,
        "X-Remove-Selector": REMOVE,
        "User-Agent": userAgent,
      },
      signal: controller.signal,
    });

    if (res.status === 429) return { ok: false, reason: "rate_limited" };
    // Jina responde 403 cuando bloquea un dominio por abuso (le ocurre a
    // news.google.com) o cuando el sitio de origen rechaza el acceso.
    if (res.status === 403 || res.status === 451) return { ok: false, reason: "blocked", detail: `HTTP ${res.status}` };
    if (!res.ok) return { ok: false, reason: "error", detail: `HTTP ${res.status}` };

    const text = (await res.text()).replace(/\s+/g, " ").trim();
    if (text.length < MIN_ARTICLE_CHARS) return { ok: false, reason: "too_short" };
    return { ok: true, text: text.slice(0, MAX_ANALYSIS_CHARS) };
  } catch (e) {
    const aborted = (e as Error).name === "AbortError";
    return { ok: false, reason: aborted ? "timeout" : "error", detail: (e as Error).message };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fragmento del cuerpo que rodea una mención del sujeto.
 *
 * Como extracto almacenado es más útil que el arranque de la nota: muestra por
 * qué la mención es pertinente, y sigue siendo breve.
 *
 * Se salta la mención que cae en el titular cuando hay otra más adelante. La
 * mayoría de los cuerpos repiten el titular al principio, y el fragmento a su
 * alrededor no aporta nada que la tarjeta no muestre ya.
 */
export function snippetAround(
  text: string,
  needle: string,
  title = "",
  radius = 180,
): string | null {
  const flat = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const haystack = flat(text);
  const target = flat(needle);
  if (!target) return null;

  let index = haystack.indexOf(target);
  if (index < 0) return null;

  const headlineZone = title.length + 80;
  if (index < headlineZone) {
    const later = haystack.indexOf(target, headlineZone);
    if (later >= 0) index = later;
  }

  let start = Math.max(0, index - radius);
  let end = Math.min(text.length, index + needle.length + radius);
  // Cortar en un espacio para no dejar palabras partidas en los bordes.
  if (start > 0) start = text.indexOf(" ", start) + 1 || start;
  if (end < text.length) end = text.lastIndexOf(" ", end) || end;

  return `${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`;
}

export interface EnrichmentReport {
  attempted: number;
  read: number;
  /** Motivo por el que se dejó de leer antes de terminar, si lo hubo. */
  stoppedBecause: "rate_limited" | "time_budget" | null;
  failures: Record<string, number>;
}

/**
 * Lee en paralelo acotado, con presupuesto de tiempo total.
 *
 * Al primer 429 se deja de pedir: insistir contra un límite por minuto solo
 * alarga la corrida y no consigue más lecturas.
 */
export async function readMany(
  urls: string[],
  userAgent: string,
  options: { concurrency?: number; budgetMs?: number } = {},
): Promise<{ texts: Map<string, string>; report: EnrichmentReport }> {
  const concurrency = options.concurrency ?? 5;
  const budgetMs = options.budgetMs ?? 45_000;
  const started = Date.now();

  const texts = new Map<string, string>();
  const report: EnrichmentReport = { attempted: 0, read: 0, stoppedBecause: null, failures: {} };
  const queue = [...urls];

  const worker = async () => {
    while (queue.length > 0) {
      if (report.stoppedBecause) return;
      if (Date.now() - started > budgetMs) {
        report.stoppedBecause = "time_budget";
        return;
      }
      const url = queue.shift();
      if (!url) return;

      report.attempted++;
      const outcome = await readArticle(url, userAgent);
      if (outcome.ok) {
        texts.set(url, outcome.text);
        report.read++;
      } else {
        report.failures[outcome.reason] = (report.failures[outcome.reason] ?? 0) + 1;
        if (outcome.reason === "rate_limited") report.stoppedBecause = "rate_limited";
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, urls.length) }, worker));
  return { texts, report };
}
