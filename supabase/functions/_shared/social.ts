/**
 * Menciones en Facebook e Instagram, a través del índice de un buscador.
 *
 * Por qué así y no por la API de Meta: la Graph API exige una app ligada a una
 * cuenta de Facebook y a una cuenta de Instagram de empresa, y Facebook no
 * ofrece búsqueda pública de publicaciones desde 2019 —lo que la sustituía,
 * CrowdTangle, Meta lo cerró en 2024—. Sin esas credenciales la única vía es
 * preguntarle a un buscador qué publicaciones públicas tiene indexadas.
 *
 * Se consulta DuckDuckGo, el único que respeta el operador `site:` sin exigir
 * JavaScript: Bing lo ignora en su salida RSS y Google no publica una legible.
 * La petición va a través de Jina Reader, que es quien la hace desde sus propias
 * IPs; pedida directamente desde el servidor de funciones, DuckDuckGo responde
 * con un desafío porque la IP es de centro de datos. Son dos consultas por
 * corrida, espaciadas. No se resuelve ningún CAPTCHA ni se esquiva ningún
 * control: si el buscador responde con un desafío, esa red se reporta como
 * bloqueada y la corrida continúa con el resto de fuentes.
 *
 * Lo que se obtiene es lo que el buscador indexó —título, enlace y el fragmento
 * que él mismo muestra—, no el contenido en vivo de la red social. La fecha solo
 * viene en parte de los resultados; cuando falta, la mención queda marcada para
 * que nadie lea la fecha de detección como fecha de publicación.
 */

export type RedSocial = "facebook" | "instagram";

export interface PublicacionSocial {
  title: string;
  url: string;
  excerpt: string;
  platform: RedSocial;
  domain: string;
  /** Fecha que el buscador muestra junto al resultado, si la trae. */
  publishedAt: string | null;
}

export interface ReporteSocial {
  /** Redes consultadas. */
  intentadas: RedSocial[];
  /** Publicaciones aceptadas por red. */
  encontradas: Record<RedSocial, number>;
  /** Redes en las que el buscador respondió con un desafío en vez de resultados. */
  bloqueadas: RedSocial[];
  fallos: Array<{ red: RedSocial; motivo: string }>;
}

const BUSCADOR = "https://lite.duckduckgo.com/lite/";
const LECTOR = "https://r.jina.ai/";
const TIMEOUT_MS = 30_000;

const SITIO: Record<RedSocial, string> = {
  facebook: "facebook.com",
  instagram: "instagram.com",
};

/**
 * Solo publicaciones, nunca perfiles.
 *
 * Buscar un nombre devuelve también las cuentas personales de gente que se llama
 * igual ("Fulano está en Facebook. Únete para conectar…"). Guardar eso sería
 * registrar a personas privadas que no han dicho nada, que es justo lo que el
 * PRD §16 prohíbe. Estas rutas solo existen en contenido publicado.
 */
const RUTA_PUBLICACION: Record<RedSocial, RegExp> = {
  facebook: /\/(posts|videos|reel|watch|permalink\.php|story\.php|photos\/[^/]+\/\d)/i,
  instagram: /\/(p|reel|reels|tv)\/[\w-]+/i,
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const limpia = (texto: string) =>
  texto.replace(/\*\*/g, "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/\s+/g, " ").trim();

/** DuckDuckGo envuelve los enlaces en su redirector; el destino va en `uddg`. */
function destino(href: string): string {
  const m = href.match(/[?&]uddg=([^&)]+)/);
  if (!m?.[1]) return href;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return href;
  }
}

/**
 * Títulos de red social, sin la coletilla del sitio.
 *
 * Facebook: "Desde la Mesa Estatal de... - David Monreal Avila | Facebook".
 * Instagram: 'Fulano on Instagram: "texto de la publicación"'.
 */
function tituloLimpio(bruto: string, platform: RedSocial): string {
  const t = limpia(bruto);
  if (platform === "instagram") {
    const cita = t.match(/ on Instagram:\s*["“](.+)["”]\s*$/i);
    if (cita?.[1]) return cita[1].trim();
  }
  return t.replace(/\s*[|·-]\s*(Facebook|Instagram)\s*$/i, "").trim();
}

function esPublicacion(url: string, platform: RedSocial): boolean {
  try {
    const u = new URL(url);
    // Los dominios regionales (es-la.facebook.com, m.facebook.com) son la misma red.
    if (!u.hostname.endsWith(SITIO[platform])) return false;
    return RUTA_PUBLICACION[platform].test(u.pathname + u.search);
  } catch {
    return false;
  }
}

async function consulta(termino: string, platform: RedSocial, userAgent: string): Promise<string> {
  const busqueda = `${BUSCADOR}?q=${encodeURIComponent(`${termino} site:${SITIO[platform]}`)}&kl=mx-es`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(LECTOR + encodeURIComponent(busqueda), {
      headers: { "User-Agent": userAgent, Accept: "text/plain" },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Cada resultado llega en tres líneas:
 *
 *   4.[Título del resultado](https://duckduckgo.com/l/?uddg=…)
 *   Fragmento con el término resaltado
 *   www.facebook.com/pagina/posts/…2026-09-14T00:00:00.0000000
 *
 * La última repite la dirección y a veces le pega la fecha del resultado.
 */
const RESULTADO =
  /\d+\.\[(.+?)\]\((https:\/\/duckduckgo\.com\/l\/\?uddg=[^)]+)\)\s*\n([\s\S]*?)\n(www\.[^\s]+)/g;

/**
 * Fecha del resultado.
 *
 * DuckDuckGo la pega al final de la línea de la dirección, pero no siempre. En
 * Instagram el propio fragmento la trae en inglés ("- cuenta on September 5,
 * 2026:"), que es la fecha real de la publicación y evita marcarla como
 * aproximada.
 */
const MESES: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
};

function fechaDe(lineaUrl: string, fragmento: string): number {
  const pegada = lineaUrl.match(/(\d{4}-\d{2}-\d{2})T[\d:.]+$/);
  if (pegada?.[1]) {
    const t = Date.parse(pegada[1]);
    if (!Number.isNaN(t)) return t;
  }
  const escrita = fragmento.match(/on ([A-Z][a-z]+) (\d{1,2}), (\d{4})/);
  const mes = MESES[(escrita?.[1] ?? "").toLowerCase()];
  if (escrita && mes !== undefined) {
    return Date.UTC(Number(escrita[3]), mes, Number(escrita[2]));
  }
  return Number.NaN;
}

function extrae(texto: string, platform: RedSocial, maximo: number): PublicacionSocial[] {
  const salida: PublicacionSocial[] = [];
  const vistas = new Set<string>();

  for (const m of texto.matchAll(RESULTADO)) {
    const url = destino(m[2] ?? "");
    if (!esPublicacion(url, platform)) continue;
    // La misma publicación aparece con y sin parámetros de seguimiento.
    const clave = url.split("?")[0] ?? url;
    if (vistas.has(clave)) continue;
    vistas.add(clave);

    const title = tituloLimpio(m[1] ?? "", platform);
    const excerpt = limpia(m[3] ?? "");
    if (!title && !excerpt) continue;

    const t = fechaDe(m[4] ?? "", excerpt);

    salida.push({
      title: title || excerpt.slice(0, 120),
      url: clave,
      excerpt,
      platform,
      domain: SITIO[platform],
      publishedAt: Number.isNaN(t) ? null : new Date(t).toISOString(),
    });
    if (salida.length >= maximo) break;
  }
  return salida;
}

/**
 * Busca el término en Facebook e Instagram.
 *
 * `pausaMs` separa las dos consultas: pedidas seguidas, el lector intermedio
 * agota su cupo por minuto y la segunda red se queda sin resultados.
 */
export async function buscaEnRedes(
  termino: string,
  userAgent: string,
  opciones: { maximoPorRed?: number; pausaMs?: number; redes?: RedSocial[] } = {},
): Promise<{ publicaciones: PublicacionSocial[]; reporte: ReporteSocial }> {
  const { maximoPorRed = 10, pausaMs = 4_000, redes = ["facebook", "instagram"] } = opciones;

  const publicaciones: PublicacionSocial[] = [];
  const reporte: ReporteSocial = {
    intentadas: redes,
    encontradas: { facebook: 0, instagram: 0 },
    bloqueadas: [],
    fallos: [],
  };

  for (const [i, red] of redes.entries()) {
    if (i > 0) await sleep(pausaMs);
    try {
      const texto = await consulta(termino, red, userAgent);
      const hallazgos = extrae(texto, red, maximoPorRed);
      // Sin resultados y sin la numeración del buscador: es un desafío anti-bot,
      // no una búsqueda vacía. Distinguirlo evita dar por hecho que no hay nada.
      if (hallazgos.length === 0 && !/\d+\.\[/.test(texto)) {
        reporte.bloqueadas.push(red);
        continue;
      }
      reporte.encontradas[red] = hallazgos.length;
      publicaciones.push(...hallazgos);
    } catch (e) {
      reporte.fallos.push({ red, motivo: (e as Error).message });
    }
  }

  return { publicaciones, reporte };
}
