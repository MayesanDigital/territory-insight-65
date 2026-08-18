/**
 * Lector de RSS y Atom sin dependencias.
 *
 * Se parsea con expresiones regulares en vez de un DOM XML porque los feeds
 * reales vienen con entidades mal escapadas y namespaces inconsistentes que
 * hacen fallar a un parser estricto justo en las fuentes que más interesan.
 */

export interface FeedItem {
  title: string;
  link: string;
  description: string;
  publishedAt: string | null;
  author: string | null;
  sourceName: string | null;
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú",
  Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú",
  ntilde: "ñ", Ntilde: "Ñ", uuml: "ü", Uuml: "Ü",
};

export function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&([a-zA-Z]+);/g, (m, name) => ENTITIES[name] ?? m);
}

/**
 * Quita etiquetas y normaliza espacios.
 *
 * El orden importa: muchos feeds —Google News entre ellos— traen el HTML
 * *escapado* dentro de CDATA (`&lt;a target="_blank"&gt;`). Si se quitan las
 * etiquetas antes de decodificar, esas etiquetas escapadas sobreviven y luego
 * se decodifican como texto visible: por eso aparecían "target", "blank" y
 * "nbsp" entre los temas detectados. Se decodifica, se limpia y se vuelve a
 * decodificar para las entidades del texto real.
 */
export function stripHtml(text: string): string {
  let out = text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  out = decodeEntities(out);
  out = out.replace(/<[^>]+>/g, " ");
  out = decodeEntities(out);
  // Una segunda pasada para el HTML doblemente escapado (&amp;lt;a&amp;gt;).
  if (out.includes("<")) out = out.replace(/<[^>]+>/g, " ");
  return out.replace(/\s+/g, " ").trim();
}

function tag(block: string, name: string): string {
  // El nombre puede venir con namespace (dc:creator) y con atributos.
  const re = new RegExp(`<(?:[\\w-]+:)?${name}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?${name}>`, "i");
  const m = block.match(re);
  return m?.[1] ? stripHtml(m[1]) : "";
}

/** Atom usa <link href="..."/> en vez de contenido dentro de la etiqueta. */
function atomLink(block: string): string {
  const m = block.match(/<link[^>]*\bhref=["']([^"']+)["'][^>]*\/?>/i);
  return m?.[1] ? decodeEntities(m[1]) : "";
}

function parseDate(value: string): string | null {
  if (!value) return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

export function parseFeed(xml: string): FeedItem[] {
  const items: FeedItem[] = [];
  const blocks = [
    ...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi),
    ...xml.matchAll(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/gi),
  ];

  for (const match of blocks) {
    const block = match[1] ?? "";
    const title = tag(block, "title");
    const link = tag(block, "link") || atomLink(block);
    if (!title || !link) continue;

    items.push({
      title,
      link,
      description: tag(block, "description") || tag(block, "summary") || tag(block, "content"),
      publishedAt:
        parseDate(tag(block, "pubDate")) ??
        parseDate(tag(block, "published")) ??
        parseDate(tag(block, "updated")) ??
        parseDate(tag(block, "date")),
      author: tag(block, "creator") || tag(block, "author") || null,
      sourceName: tag(block, "source") || null,
    });
  }
  return items;
}

export function domainOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * Google News expone una búsqueda como RSS público. Es un endpoint pensado
 * para ser consumido por lectores de feeds: no exige credenciales ni esquiva
 * ninguna protección, a diferencia de raspar el HTML del buscador.
 */
export function googleNewsFeed(
  query: string,
  language = "es-419",
  country = "MX",
  exactPhrase = false,
): string {
  // Entrecomillar pide coincidencia de frase exacta. Sin esto, un nombre de dos
  // palabras se busca como términos sueltos y devuelve a cualquier homónimo.
  const term = exactPhrase && !query.includes('"') ? `"${query.trim()}"` : query;
  const q = encodeURIComponent(term);
  return `https://news.google.com/rss/search?q=${q}&hl=${language}&gl=${country}&ceid=${country}:${language}`;
}

/**
 * Bing expone su índice de noticias como RSS, sin clave ni registro. Es un
 * índice distinto al de Google, así que aporta medios que el otro no lista.
 */
export function bingNewsFeed(query: string, market = "es-MX"): string {
  return `https://www.bing.com/news/search?q=${encodeURIComponent(query)}&format=RSS&mkt=${market}`;
}

/**
 * Búsqueda de Reddit en RSS.
 *
 * Se usa el RSS y no el endpoint `.json`: desde el cierre de su API pública,
 * `search.json` responde 403 a peticiones de servidor, mientras que `search.rss`
 * sigue abierto. Comprobado contra ambos.
 */
export function redditSearchFeed(query: string, limit = 25): string {
  return `https://www.reddit.com/search.rss?q=${encodeURIComponent(query)}&sort=new&limit=${limit}`;
}

/**
 * Google News envuelve cada enlace en un redirector propio. Muchos traen la
 * URL real en el parámetro `url`; cuando no, se conserva el enlace tal cual
 * porque seguir la redirección exigiría una petición extra por nota.
 */
export function unwrapGoogleNews(url: string): string {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.endsWith("news.google.com")) return url;
    const real = parsed.searchParams.get("url");
    return real ?? url;
  } catch {
    return url;
  }
}

/**
 * Google News añade " - Nombre del medio" al final del titular. Separarlo da
 * el nombre real de la fuente, que el redirector oculta en el dominio.
 */
export function splitGoogleTitle(title: string): { title: string; source: string | null } {
  // Algunos resultados llegan con el prefijo del buscador pegado al titular.
  const clean = title.replace(/^\s*B[úu]squeda\s*[-–]\s*/i, "").trim();
  const idx = clean.lastIndexOf(" - ");
  if (idx > 20 && idx > clean.length - 60) {
    return { title: clean.slice(0, idx).trim(), source: clean.slice(idx + 3).trim() };
  }
  return { title: clean, source: null };
}

/**
 * Clave para detectar la misma nota republicada con otra URL.
 *
 * Deduplicar solo por URL deja pasar el mismo contenido servido desde varios
 * dominios o con parámetros distintos, que es lo habitual en los agregadores.
 */
export function contentKey(title: string): string {
  return title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 90);
}
