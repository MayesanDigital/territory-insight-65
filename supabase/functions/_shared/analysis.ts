// =============================================================================
// Análisis heurístico de contenido público — sin dependencias externas
//
// Implementación canónica compartida por el navegador (vía @shared/analysis) y
// las Edge Functions de Deno. Por eso el módulo no importa nada: ni librerías
// npm, ni APIs de Deno, ni APIs del DOM.
//
// LÍMITE DE PRODUCTO, no técnico: estas funciones analizan CONTENIDO PÚBLICO en
// agregado. No construyen perfiles de personas, no infieren afinidad política y
// no puntúan a individuos. El sentimiento califica publicaciones, nunca gente.
// =============================================================================

export type SentimentLabel = "positive" | "neutral" | "negative";

export interface SentimentResult {
  label: SentimentLabel;
  /** De -1 (muy negativo) a 1 (muy positivo). */
  score: number;
  /** Cuántos términos con carga se encontraron; 0 significa veredicto por defecto. */
  matches: number;
}

export interface Topic {
  topic: string;
  /** Peso TF-IDF normalizado de 0 a 1. */
  weight: number;
  count: number;
}

export interface Entity {
  name: string;
  type: "person_or_org" | "place" | "term";
  count: number;
}

export interface AnalyzableItem {
  title: string;
  excerpt?: string | null;
  publishedAt?: string | Date | null;
  sourceType?: string | null;
  sourceDomain?: string | null;
}

// -----------------------------------------------------------------------------
// Léxico
// -----------------------------------------------------------------------------

const POSITIVE = new Set([
  "acuerdo","alianza","apoyo","aprobado","aprueba","auge","avance","avanza","beneficio","beneficia",
  "bueno","buena","celebra","crecimiento","crece","destaca","eficiente","éxito","exitoso","favorable",
  "fortalece","gana","impulsa","impulso","incrementa","innovación","inversión","invierte","logra",
  "logro","mejora","mejor","modernización","optimiza","positivo","premio","progreso","reconocimiento",
  "reconoce","rehabilitación","rescate","satisfacción","solución","soluciona","transparencia","triunfo",
  "consolida","histórico","récord","respaldo","respalda","estable","seguro","calidad","cumple","entrega",
  // Vocabulario habitual del boletín institucional y la nota económica.
  // "reducción" y "disminución" quedan deliberadamente fuera: su signo depende
  // por completo del complemento ("de homicidios" frente a "de presupuesto"),
  // y un léxico sin análisis sintáctico no puede distinguirlos.
  "inaugura","inauguración","anuncia","fortalecimiento","acuerdan",
  "beneficia","beneficiarios","empleo","empleos","reconocen","destacan",
  "aumenta","aumento","incremento","supera","firma","convenio","apoyo","apoyos","rehabilita",
]);

const NEGATIVE = new Set([
  "abandono","abuso","acusación","acusa","alerta","atraso","bache","caída","cae","cancela","cancelación",
  "caos","carencia","colapso","conflicto","corrupción","crisis","critica","crítica","daño","déficit",
  "denuncia","desabasto","desalojo","descontento","desempleo","desvío","deterioro","disminuye","escándalo",
  "falla","fracaso","fraude","huelga","impunidad","incumple","incumplimiento","inseguridad","irregularidad",
  "lento","malo","mala","manifestación","negligencia","opacidad","oposición","paro","pérdida","pierde",
  "polémica","precario","preocupación","problema","protesta","queja","reclamo","rechaza","rechazo",
  "retraso","riesgo","suspende","violencia","peligro","denuncian","exigen","bloqueo",
  "grave","deficiente","insuficiente","ineficiente","contaminación","socavón","fuga","desperdicio",
  "sobrecosto","observación","incumplida","rezago","estancamiento","clausura","multa","sanción",
  // Vocabulario habitual de la nota política y de seguridad en México.
  "homicidio","asesinato","secuestro","extorsión","atentado","balacera","desaparición","feminicidio",
  "detenido","detenidos","despojo","saqueo","amenaza","agresión","desalojan","cierran","suspenden",
  "renuncia","destituye","destitución","investigación","imputado","vinculado","aprehensión",
]);

// Multiplican la carga del término que sigue.
const INTENSIFIERS: Record<string, number> = {
  muy: 1.5, más: 1.3, mas: 1.3, tan: 1.4, bastante: 1.3, sumamente: 1.8,
  extremadamente: 1.9, totalmente: 1.6, completamente: 1.6, gran: 1.4, fuerte: 1.4,
  poco: 0.5, apenas: 0.5, ligeramente: 0.5,
};

// Invierten la carga del término que sigue dentro de una ventana corta.
const NEGATORS = new Set(["no", "sin", "ni", "nunca", "jamás", "jamas", "tampoco", "nadie", "ningún", "ninguna", "ningun"]);

export const STOP_WORDS = new Set([
  "a","al","algo","alguna","algunas","alguno","algunos","ante","antes","aquel","aquella","aquellas",
  "aquello","aquellos","aqui","aquí","asi","así","aun","aún","cada","como","cómo","con","contra","cual",
  "cuales","cuando","cuanto","de","del","desde","donde","dónde","dos","el","él","ella","ellas","ello",
  "ellos","en","entre","era","eran","eres","es","esa","esas","ese","eso","esos","esta","está","estaba",
  "estan","están","estar","estas","este","esto","estos","estoy","fue","fueron","ha","habia","había","han",
  "hasta","hay","la","las","le","les","lo","los","mas","más","me","mi","mis","mucho","muchos","muy","nos",
  "nuestra","nuestro","o","otra","otras","otro","otros","para","pero","poco","por","porque","que","qué",
  "quien","quién","se","sea","segun","según","ser","si","sí","sido","sin","sobre","son","su","sus","tambien",
  "también","te","tiene","tienen","todo","todos","tras","tu","tus","un","una","uno","unos","y","ya","yo",
  "the","and","for","with","from","this","that","then","than","have","has","was","were","are","its","it",
]);

// Encabezan lugares y por eso se etiquetan distinto al resto de nombres propios.
const PLACE_PREFIXES = new Set(["municipio", "estado", "ciudad", "colonia", "localidad", "sección", "seccion", "delegación", "delegacion"]);

// -----------------------------------------------------------------------------
// Tokenización
// -----------------------------------------------------------------------------

export function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function tokenize(text: string): string[] {
  return normalize(text)
    .split(/[^a-z0-9ñ]+/)
    .filter((t) => t.length > 0);
}

/** Tokens de contenido: sin vacías, sin ruido corto, sin números sueltos. */
export function contentTokens(text: string): string[] {
  return tokenize(text).filter((t) => t.length >= 4 && !STOP_WORDS.has(t) && !/^\d+$/.test(t));
}

// El léxico está acentuado pero los tokens no, así que se compara normalizado.
const POSITIVE_N = new Set([...POSITIVE].map(normalize));
const NEGATIVE_N = new Set([...NEGATIVE].map(normalize));
const NEGATORS_N = new Set([...NEGATORS].map(normalize));
const INTENSIFIERS_N: Record<string, number> = Object.fromEntries(
  Object.entries(INTENSIFIERS).map(([k, v]) => [normalize(k), v]),
);

// -----------------------------------------------------------------------------
// analyzeSentiment
// -----------------------------------------------------------------------------

/**
 * Sentimiento de una publicación por léxico, con negación e intensificadores.
 *
 * Mira las dos palabras previas a cada término con carga: es la ventana donde
 * en español caen los modificadores ("no mejora", "muy grave", "sin avance").
 */
export function analyzeSentiment(text: string): SentimentResult {
  const tokens = tokenize(text);
  let sum = 0;
  let matches = 0;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    const isPositive = POSITIVE_N.has(token);
    const isNegative = NEGATIVE_N.has(token);
    if (!isPositive && !isNegative) continue;

    let weight = isPositive ? 1 : -1;

    for (let back = 1; back <= 2; back++) {
      const prev = tokens[i - back];
      if (!prev) break;
      const intensity = INTENSIFIERS_N[prev];
      if (intensity !== undefined) weight *= intensity;
      if (NEGATORS_N.has(prev)) weight *= -0.85; // negar atenúa además de invertir
    }

    sum += weight;
    matches++;
  }

  if (matches === 0) return { label: "neutral", score: 0, matches: 0 };

  // Se divide por la raíz del número de coincidencias: un texto largo con muchos
  // términos cargados no debe saturar automáticamente en ±1.
  const raw = sum / Math.sqrt(matches);
  const score = Math.max(-1, Math.min(1, raw / 2));

  // La banda muerta evita clasificar como polar lo que apenas se inclina.
  const label: SentimentLabel = score > 0.15 ? "positive" : score < -0.15 ? "negative" : "neutral";
  return { label, score: Number(score.toFixed(3)), matches };
}

// -----------------------------------------------------------------------------
// extractTopics
// -----------------------------------------------------------------------------

/**
 * Temas del corpus por TF-IDF.
 *
 * Se calcula sobre el conjunto, no documento a documento: un término solo es
 * tema si aparece varias veces y además no está en todas partes. Con un único
 * documento el IDF es constante y degrada a frecuencia simple, que es lo
 * razonable.
 */
export function extractTopics(documents: string[], limit = 12): Topic[] {
  if (documents.length === 0) return [];

  const docTokens = documents.map((d) => contentTokens(d));
  const documentFrequency = new Map<string, number>();
  const termFrequency = new Map<string, number>();

  for (const tokens of docTokens) {
    const seen = new Set<string>();
    for (const token of tokens) {
      termFrequency.set(token, (termFrequency.get(token) ?? 0) + 1);
      if (!seen.has(token)) {
        seen.add(token);
        documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
      }
    }
  }

  const total = docTokens.length;
  const scored: Topic[] = [];

  for (const [term, tf] of termFrequency) {
    const df = documentFrequency.get(term) ?? 1;
    // Un término presente en un solo documento de un corpus grande es ruido.
    if (total > 4 && df < 2) continue;
    const idf = Math.log((total + 1) / (df + 0.5));
    scored.push({ topic: term, weight: tf * idf, count: tf });
  }

  scored.sort((a, b) => b.weight - a.weight);
  const top = scored.slice(0, limit);
  const max = top[0]?.weight ?? 1;

  return top.map((t) => ({ ...t, weight: Number((t.weight / max).toFixed(3)) }));
}

// -----------------------------------------------------------------------------
// extractEntities
// -----------------------------------------------------------------------------

/**
 * Nombres propios y lugares mencionados en el texto.
 *
 * Detecta secuencias de palabras capitalizadas sobre el texto ORIGINAL, unidas
 * por conectores ("Secretaría de Obras Públicas"). Descarta la primera palabra
 * de cada oración, que va capitalizada por gramática y no por ser nombre propio.
 */
export function extractEntities(text: string, limit = 10): Entity[] {
  const counts = new Map<string, Entity>();
  const connectors = new Set(["de", "del", "la", "las", "los", "y", "el", "en"]);

  for (const sentence of text.split(/(?<=[.!?¡¿\n])\s+/)) {
    const words = sentence.trim().split(/\s+/);
    let buffer: string[] = [];
    // En español el clasificador del lugar va en minúscula y por tanto fuera de
    // la secuencia capitalizada: "municipio de Fresnillo". Guardarlo aparte es
    // lo único que permite distinguir un lugar de una organización.
    let prefix = "";

    const flush = () => {
      // Descartar conectores colgando al final: "Gobierno de" no es una entidad.
      while (buffer.length > 0 && connectors.has(buffer[buffer.length - 1]!.toLowerCase())) {
        buffer.pop();
      }
      const captured = buffer;
      const capturedPrefix = prefix;
      buffer = [];
      prefix = "";

      if (captured.length === 0) return;
      const name = captured.join(" ").replace(/[.,;:()"'¿?¡!]+$/g, "");
      if (name.length < 4) return;
      if (STOP_WORDS.has(normalize(name))) return;

      // Una sola palabra capitalizada puede ser cualquier cosa; solo las
      // secuencias de varias se tratan como persona u organización.
      const type: Entity["type"] = PLACE_PREFIXES.has(capturedPrefix)
        ? "place"
        : name.includes(" ")
          ? "person_or_org"
          : "term";

      const existing = counts.get(name);
      if (existing) existing.count++;
      else counts.set(name, { name, type, count: 1 });
    };

    words.forEach((rawWord, index) => {
      const word = rawWord.replace(/^[("'¿¡]+/, "");
      const isCapitalized = /^[A-ZÁÉÍÓÚÑ]/.test(word);
      const isConnector = connectors.has(word.toLowerCase());

      // La primera palabra de la oración va capitalizada por regla ortográfica.
      if (isCapitalized && index === 0) return;

      if (isCapitalized) {
        if (buffer.length === 0) {
          // "municipio de Fresnillo": el clasificador está dos palabras atrás,
          // con el conector "de" en medio.
          const back1 = normalize((words[index - 1] ?? "").replace(/[^\p{L}]/gu, ""));
          const back2 = normalize((words[index - 2] ?? "").replace(/[^\p{L}]/gu, ""));
          prefix = PLACE_PREFIXES.has(back1)
            ? back1
            : connectors.has(back1) && PLACE_PREFIXES.has(back2)
              ? back2
              : "";
        }
        buffer.push(word);
      } else if (isConnector && buffer.length > 0) {
        buffer.push(word);
      } else {
        flush();
      }
    });
    flush();
  }

  return Array.from(counts.values())
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit);
}

// -----------------------------------------------------------------------------
// Coincidencia por frase
// -----------------------------------------------------------------------------

/** Deja solo letras, dígitos y espacios simples, sin acentos. */
function flatten(text: string): string {
  return normalize(text)
    .replace(/[^a-z0-9ñ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * ¿Aparece la frase completa, en orden y sin nada en medio?
 *
 * Buscar los términos por separado es lo que hace que una consulta por "Toño
 * Aceves" arrastre notas de cualquier otro Aceves: con dos apellidos comunes,
 * la coincidencia parcial es casi garantía de falso positivo. Para personas
 * hay que exigir el nombre completo contiguo.
 */
export function containsPhrase(text: string, phrase: string): boolean {
  const haystack = ` ${flatten(text)} `;
  const needle = ` ${flatten(phrase)} `;
  return needle.trim().length > 0 && haystack.includes(needle);
}

/** Tratamientos que preceden al nombre y no ayudan a identificar a nadie. */
const HONORIFICS = new Set([
  "dr", "dra", "lic", "ing", "mtro", "mtra", "prof", "profa", "sr", "sra", "srta",
  "c", "cp", "arq", "gobernador", "gobernadora", "alcalde", "alcaldesa", "diputado",
  "diputada", "senador", "senadora", "presidente", "presidenta",
]);

/**
 * Nombre de pila + primer apellido: la forma con la que la prensa nombra a
 * alguien. Se usa para consultar las fuentes, porque pedir la frase exacta con
 * el nombre legal completo reduce los resultados antes siquiera de filtrarlos.
 */
export function personCoreName(query: string): string {
  const tokens = flatten(query.replace(/["']/g, " "))
    .split(" ")
    .filter((t) => t.length > 1 && !HONORIFICS.has(t));
  if (tokens.length === 0) return query.trim();

  // Se recuperan las palabras originales —con acentos— posicionalmente, para no
  // enviar a la fuente una consulta sin diacríticos.
  const original = query
    .replace(/["']/g, " ")
    .split(/\s+/)
    .filter((w) => {
      const f = flatten(w);
      return f.length > 1 && !HONORIFICS.has(f);
    });
  return original.slice(0, 2).join(" ") || tokens.slice(0, 2).join(" ");
}

/**
 * Verifica que el contenido trate realmente del sujeto vigilado.
 *
 * Para personas se exige **nombre de pila + primer apellido** contiguos, no el
 * nombre completo. La razón es empírica: buscar "David Monreal Ávila" —el
 * nombre legal, que es lo que un usuario escribe— rechazaba 92 de cada 100
 * notas, porque la prensa escribe "David Monreal" sin el segundo apellido.
 *
 * Tampoco vale aceptar cualquier par contiguo: David y Saúl Monreal Ávila son
 * hermanos y ambos figuras públicas en Zacatecas, así que "Monreal Ávila"
 * confundiría a uno con el otro. Anclar en el nombre de pila los separa.
 */
export function matchesSubject(
  text: string,
  query: string,
  subjectType: string | null | undefined,
): boolean {
  // Las comillas en la consulta son una petición explícita de frase exacta.
  const quoted = [...query.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
  if (quoted.length > 0) return quoted.every((q) => containsPhrase(text, q));

  const clean = query.replace(/["']/g, " ").trim();
  const haystack = ` ${flatten(text)} `;

  if (subjectType === "person") {
    const tokens = flatten(clean)
      .split(" ")
      .filter((t) => t.length > 1 && !HONORIFICS.has(t));
    if (tokens.length === 0) return false;
    if (tokens.length === 1) return haystack.includes(` ${tokens[0]} `);
    return haystack.includes(` ${tokens[0]} ${tokens[1]} `);
  }

  const terms = flatten(clean)
    .split(" ")
    .filter((t) => t.length >= 3 && !STOP_WORDS.has(t));
  if (terms.length === 0) return true;
  return terms.every((t) => haystack.includes(` ${t} `));
}

// -----------------------------------------------------------------------------
// calculateRelevance
// -----------------------------------------------------------------------------

const SOURCE_WEIGHT: Record<string, number> = {
  news: 1, rss: 0.95, blog: 0.8, radio: 0.85, gov: 1, web: 0.7, other: 0.6,
  // Las fuentes sociales pesan menos: un mismo hecho genera decenas de
  // publicaciones y sin este ajuste desplazarían a la cobertura periodística.
  social: 0.7, forum: 0.65,
};

/**
 * Qué tan relevante es un contenido para la consulta de un monitor, de 0 a 1.
 *
 * Combina tres señales: cuántos términos de la consulta aparecen (y si están en
 * el título, que pesa más que el cuerpo), la antigüedad de la publicación y la
 * clase de fuente.
 */
export function calculateRelevance(
  item: AnalyzableItem,
  query: string,
  now: Date = new Date(),
): number {
  const terms = contentTokens(query.replace(/"/g, " "));
  if (terms.length === 0) return 0.5;

  const titleTokens = new Set(tokenize(item.title));
  const bodyTokens = new Set(tokenize(item.excerpt ?? ""));

  let hits = 0;
  for (const term of terms) {
    if (titleTokens.has(term)) hits += 1;
    else if (bodyTokens.has(term)) hits += 0.5;
  }
  const coverage = Math.min(1, hits / terms.length);

  // Decaimiento suave: a 30 días una nota conserva la mitad de su frescura.
  let recency = 0.7;
  if (item.publishedAt) {
    const published = new Date(item.publishedAt).getTime();
    if (!Number.isNaN(published)) {
      const days = Math.max(0, (now.getTime() - published) / 86_400_000);
      recency = 1 / (1 + days / 30);
    }
  }

  const sourceWeight = SOURCE_WEIGHT[item.sourceType ?? "other"] ?? 0.6;
  const score = coverage * 0.6 + recency * 0.25 + sourceWeight * 0.15;
  return Number(Math.max(0, Math.min(1, score)).toFixed(3));
}

// -----------------------------------------------------------------------------
// generateSummary
// -----------------------------------------------------------------------------

export interface SummaryInput {
  items: AnalyzableItem[];
  sentiments: SentimentLabel[];
  topics: Topic[];
  /** Nombre del monitor o término vigilado. */
  subject?: string;
}

export interface Summary {
  headline: string;
  paragraphs: string[];
  /** Variación porcentual del volumen entre la primera y la segunda mitad del periodo. */
  trend: number;
}

const PLURAL = (n: number, one: string, many: string) => (n === 1 ? one : many);

/**
 * Resumen ejecutivo en prosa a partir de los agregados.
 *
 * Es determinista y basado en plantillas a propósito: un resumen de monitoreo
 * debe poder auditarse contra los números que lo respaldan.
 */
export function generateSummary({ items, sentiments, topics, subject }: SummaryInput): Summary {
  const total = items.length;
  if (total === 0) {
    return {
      headline: "Sin menciones en el periodo",
      paragraphs: [
        "No se registraron contenidos públicos que coincidan con los criterios del monitor durante el periodo analizado.",
      ],
      trend: 0,
    };
  }

  const counts = { positive: 0, neutral: 0, negative: 0 };
  for (const s of sentiments) counts[s]++;
  const pct = (n: number) => Math.round((n / total) * 100);

  const dated = items
    .map((i) => (i.publishedAt ? new Date(i.publishedAt).getTime() : NaN))
    .filter((t) => !Number.isNaN(t))
    .sort((a, b) => a - b);

  let trend = 0;
  if (dated.length >= 4) {
    const midpoint = dated[0]! + (dated[dated.length - 1]! - dated[0]!) / 2;
    const firstHalf = dated.filter((t) => t <= midpoint).length;
    const secondHalf = dated.length - firstHalf;
    if (firstHalf > 0) trend = Math.round(((secondHalf - firstHalf) / firstHalf) * 100);
  }

  const domains = new Map<string, number>();
  for (const i of items) {
    if (i.sourceDomain) domains.set(i.sourceDomain, (domains.get(i.sourceDomain) ?? 0) + 1);
  }
  const topDomains = Array.from(domains.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  const dominant =
    counts.negative > counts.positive && counts.negative > counts.neutral
      ? "predominantemente crítico"
      : counts.positive > counts.negative && counts.positive > counts.neutral
        ? "predominantemente favorable"
        : "mayoritariamente neutral";

  const label = subject ? `sobre ${subject}` : "en el periodo";

  const paragraphs: string[] = [];

  paragraphs.push(
    `Se analizaron ${total} ${PLURAL(total, "mención pública", "menciones públicas")} ${label}. ` +
      `El tono general es ${dominant}: ${pct(counts.positive)}% positivas, ` +
      `${pct(counts.neutral)}% neutrales y ${pct(counts.negative)}% negativas.`,
  );

  if (topics.length > 0) {
    const names = topics.slice(0, 5).map((t) => t.topic);
    paragraphs.push(
      `Los temas que concentran la conversación son ${names.slice(0, -1).join(", ")}` +
        (names.length > 1 ? ` y ${names[names.length - 1]}` : names[0]) +
        `. ${topics[0]!.topic} es el término con mayor peso relativo.`,
    );
  }

  if (topDomains.length > 0) {
    const list = topDomains.map(([d, n]) => `${d} (${n})`).join(", ");
    paragraphs.push(
      `El volumen se origina principalmente en ${list}. ` +
        `${domains.size} ${PLURAL(domains.size, "fuente distinta publicó", "fuentes distintas publicaron")} contenido en el periodo.`,
    );
  }

  if (trend !== 0) {
    paragraphs.push(
      trend > 0
        ? `La conversación se aceleró: la segunda mitad del periodo concentra un ${trend}% más de publicaciones que la primera.`
        : `La conversación se desaceleró: la segunda mitad del periodo concentra un ${Math.abs(trend)}% menos de publicaciones que la primera.`,
    );
  }

  const headline =
    trend > 25
      ? `Repunte de conversación ${label}`
      : trend < -25
        ? `Descenso de conversación ${label}`
        : `Conversación estable ${label}`;

  return { headline, paragraphs, trend };
}

// -----------------------------------------------------------------------------
// Fachada
// -----------------------------------------------------------------------------

/**
 * Interfaz del PRD §16. Está aislada a propósito: cambiar el motor heurístico
 * por un proveedor de IA implica sustituir este objeto, no tocar quien lo usa.
 */
export const aiAnalysisService = {
  analyzeSentiment,
  extractTopics,
  extractEntities,
  calculateRelevance,
  generateSummary,
};

export type AiAnalysisService = typeof aiAnalysisService;
