/**
 * Ingesta de menciones públicas para un monitor.
 *
 * Pipeline del PRD §13: QUERY → DISCOVERY → FETCH → EXTRACCIÓN → DEDUPLICACIÓN
 * → SENTIMIENTO → TEMAS → BASE DE DATOS.
 *
 * Solo consume feeds RSS públicos. No sigue enlaces detrás de login, no
 * resuelve CAPTCHA y no esquiva controles anti-bot; se identifica con un
 * User-Agent propio y espacia las peticiones.
 *
 * Se invoca con el JWT de la persona usuaria, de modo que RLS decide a qué
 * organización pertenece lo que se escribe: la función no elige org_id.
 */

import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  analyzeSentiment,
  calculateRelevance,
  extractTopics,
  matchesSubject,
  personCoreName,
} from "../_shared/analysis.ts";
import {
  bingNewsFeed,
  contentKey,
  domainOf,
  googleNewsFeed,
  parseFeed,
  redditSearchFeed,
  resolveNewsLink,
  splitGoogleTitle,
  type FeedItem,
} from "../_shared/rss.ts";
import { readMany, snippetAround } from "../_shared/reader.ts";
import { buscaEnRedes } from "../_shared/social.ts";
import { sugiereTermino } from "../_shared/sugerencia.ts";

const USER_AGENT =
  Deno.env.get("MONITORING_USER_AGENT") ??
  "TerritorioIntelligenceBot/1.0 (+https://territorio.mx/bot)";

/** Pausa entre peticiones a distintas fuentes, para no golpear ningún servidor. */
const REQUEST_DELAY_MS = 400;
const FETCH_TIMEOUT_MS = 15_000;
/** Tope por corrida: evita que una consulta muy amplia llene la tabla de golpe. */
const MAX_ITEMS_PER_RUN = 120;
/** El PRD §14 pide no almacenar más contenido del necesario. */
const EXCERPT_MAX = 320;
/** Notas por corrida cuyo texto completo se lee con Jina Reader. */
const FULLTEXT_LIMIT = 15;
/** Publicaciones por red social y corrida. */
const SOCIAL_LIMIT = 10;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchFeed(url: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/rss+xml, application/xml, text/xml" },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "No autenticado" }, 401);

  // Cliente con el JWT del usuario: RLS aplica igual que desde el navegador,
  // así que esta función no puede escribir en organizaciones ajenas.
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } }, auth: { persistSession: false } },
  );

  let monitorId: string;
  try {
    const body = await req.json();
    monitorId = body.monitor_id;
    if (!monitorId) throw new Error("Falta monitor_id");
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }

  const { data: monitor, error: monitorError } = await supabase
    .from("web_monitors")
    .select("*")
    .eq("id", monitorId)
    .maybeSingle();

  if (monitorError || !monitor) {
    return json({ error: "Monitor no encontrado o sin acceso" }, 404);
  }

  const orgId = monitor.org_id as string;

  const { data: run } = await supabase
    .from("monitor_runs")
    .insert({ org_id: orgId, monitor_id: monitorId, status: "running" })
    .select()
    .single();

  await supabase
    .from("web_monitors")
    .update({ last_run_status: "running", last_started_at: new Date().toISOString() })
    .eq("id", monitorId);

  // --- DISCOVERY: búsqueda por término más los feeds propios de la organización.
  const { data: sources } = await supabase
    .from("web_sources")
    .select("domain,name,source_type,rss_url")
    .eq("org_id", orgId)
    .eq("active", true)
    .not("rss_url", "is", null);

  const isPerson = monitor.subject_type === "person";
  // A las fuentes se les pide el nombre corto —pila + primer apellido—, que es
  // como aparece publicado. La precisión la impone después `matchesSubject`.
  const searchTerm = isPerson ? personCoreName(monitor.query) : monitor.query;

  const feeds: Array<{ url: string; type: string; name: string | null }> = [
    {
      url: googleNewsFeed(
        searchTerm,
        monitor.language ?? "es-419",
        monitor.country ?? "MX",
        // Frase exacta ya en el origen: filtrar después funciona, pero
        // desperdicia el cupo de resultados del feed en ruido.
        isPerson,
      ),
      type: "news",
      name: null,
    },
    // Segunda consulta a Google News sin comillas. La frase exacta trae lo más
    // limpio, pero deja fuera al medio que escribe "Monreal Ávila, David" o mete
    // un segundo nombre; `matchesSubject` sigue exigiendo que la persona
    // aparezca, así que la consulta amplia suma cobertura sin colar a otros.
    ...(isPerson
      ? [
          {
            url: googleNewsFeed(searchTerm, monitor.language ?? "es-419", monitor.country ?? "MX", false),
            type: "news",
            name: null,
          },
        ]
      : []),
    // Segundo índice de noticias: Bing lista medios que Google no, y viceversa.
    { url: bingNewsFeed(isPerson ? `"${searchTerm}"` : searchTerm), type: "news", name: null },
    // Reddit por RSS. Su endpoint .json responde 403 a peticiones de servidor
    // desde el cierre de la API pública; el RSS sigue abierto.
    { url: redditSearchFeed(searchTerm), type: "forum", name: "reddit.com" },
    ...(sources ?? []).map((s) => ({
      url: s.rss_url as string,
      type: (s.source_type as string) ?? "rss",
      name: (s.name as string) ?? null,
    })),
  ];

  const errors: Array<{ url: string; message: string }> = [];
  const collected: Array<FeedItem & { sourceType: string; engagement?: number }> = [];

  for (const [i, feed] of feeds.entries()) {
    if (i > 0) await sleep(REQUEST_DELAY_MS);
    try {
      const xml = await fetchFeed(feed.url);
      for (const item of parseFeed(xml)) {
        collected.push({
          ...item,
          sourceType: feed.type,
          sourceName: item.sourceName ?? feed.name,
          // En foros no se guarda la autoría: acumular quién dijo qué sobre un
          // candidato sería el perfilado individual que el PRD §16 prohíbe.
          author: feed.type === "forum" ? null : item.author,
        });
      }
    } catch (e) {
      errors.push({ url: feed.url, message: (e as Error).message });
    }
  }

  // --- REDES SOCIALES
  // Facebook e Instagram no publican feeds ni buscador propio: lo que se puede
  // consultar es lo que un buscador tiene indexado de sus publicaciones
  // públicas. Va después de los feeds para que un bloqueo del buscador no
  // retrase la parte que siempre funciona.
  const { publicaciones, reporte: social } = await buscaEnRedes(
    isPerson ? `"${searchTerm}"` : searchTerm,
    USER_AGENT,
    { maximoPorRed: SOCIAL_LIMIT },
  );
  for (const p of publicaciones) {
    collected.push({
      title: p.title,
      link: p.url,
      description: p.excerpt,
      // El buscador solo muestra la fecha en parte de los resultados. Si falta,
      // se marca abajo para no presentar la fecha de la corrida como si fuera la
      // de la publicación.
      publishedAt: p.publishedAt,
      // Nunca se guarda quién publicó: en redes son personas identificables y
      // el PRD §16 lo prohíbe, igual que en los foros.
      author: null,
      sourceName: p.domain,
      sourceType: "social",
    });
  }

  // --- EXTRACCIÓN + RELEVANCIA
  const analyzed = collected
    .map((item) => {
      // Solo Google News añade " - Medio" al titular. Aplicar esa separación a
      // los demás feeds inventa fuentes: un post de Reddit cuyo título mencione
      // un programa acabaría atribuido a ese programa.
      const fromGoogle = item.link.includes("news.google.com");
      const { title, source } = fromGoogle
        ? splitGoogleTitle(item.title)
        : { title: item.title, source: null };
      const { url, resolvable } = resolveNewsLink(item.link);
      const excerpt = item.description.slice(0, EXCERPT_MAX);
      const relevance = calculateRelevance(
        { title, excerpt, publishedAt: item.publishedAt, sourceType: item.sourceType },
        monitor.query,
      );
      return {
        title,
        url,
        resolvable,
        excerpt,
        relevance,
        publishedAt: item.publishedAt ?? new Date().toISOString(),
        author: item.author,
        // Con la URL ya resuelta el dominio es el del medio. Antes las notas de
        // Bing quedaban atribuidas a "bing.com" porque se guardaba su redirector.
        sourceDomain: source ?? item.sourceName ?? domainOf(url),
        sourceType: item.sourceType,
        engagement: item.engagement ?? 0,
        // Lo indexado por el buscador llega sin fecha. Se guarda la de la
        // corrida para poder ordenar, marcada como aproximada.
        dateEstimated: item.publishedAt === null && item.sourceType === "social",
      };
    })
    // Doble criterio. El primero es cualitativo y es el que evita traer a otra
    // persona: el sujeto vigilado tiene que aparecer literalmente. El segundo
    // descarta lo que apenas roza el término buscado.
    .filter((m) => matchesSubject(`${m.title} ${m.excerpt}`, monitor.query, monitor.subject_type))
    .filter((m) => m.relevance >= (isPerson ? 0.5 : 0.35))
    .sort((a, b) => b.relevance - a.relevance);

  // La misma nota se republica en varios medios y llega por varios agregadores
  // con URLs distintas, así que la unicidad por URL no la detecta. Cuando la
  // misma nota llega por Google y por Bing se conserva la de Bing: es la que
  // enlaza al medio real, la única que se puede leer completa y la que sirve
  // como enlace de fuente.
  const byKey = new Map<string, (typeof analyzed)[number]>();
  for (const m of analyzed) {
    // En redes el título se repite entre publicaciones distintas de la misma
    // cuenta ("David Monreal Avila | Facebook"), así que cada publicación se
    // identifica por su enlace y no por el titular.
    const key = m.sourceType === "social" ? m.url : contentKey(m.title);
    if (key.length < 10) continue;
    const kept = byKey.get(key);
    if (!kept) byKey.set(key, m);
    else if (!kept.resolvable && m.resolvable) {
      byKey.set(key, { ...m, relevance: Math.max(kept.relevance, m.relevance) });
    }
  }
  const deduped = [...byKey.values()]
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, MAX_ITEMS_PER_RUN);

  // --- ESCRITURA DEL NOMBRE
  // Con pocas menciones, lo más probable no es que no se hable de la persona,
  // sino que el nombre esté mal escrito: "aridna montiel" devolvía 4 menciones y
  // "Ariadna Montiel", 93. Las fuentes traían sus titulares, pero el filtro los
  // descartaba. Se propone la escritura que aparece en esos titulares.
  const sugerencia =
    deduped.length < 10 ? sugiereTermino(monitor.query, collected.map((c) => c.title)) : null;

  // --- LECTURA DEL TEXTO COMPLETO
  // Solo las notas más relevantes y con enlace real. Sin clave de Jina el límite
  // es de 20 lecturas por minuto: leerlas todas haría esperar varios minutos.
  const toRead = deduped
    .filter((m) => m.resolvable && m.sourceType === "news")
    .slice(0, FULLTEXT_LIMIT)
    .map((m) => m.url);
  const { texts, report: reading } = await readMany(toRead, USER_AGENT, {
    concurrency: 5,
    budgetMs: 45_000,
  });

  // --- SENTIMIENTO, sobre el cuerpo cuando se pudo leer
  const needle = isPerson ? searchTerm : monitor.query.replace(/"/g, "").trim();
  const finalItems = deduped.map((m) => {
    const body = texts.get(m.url) ?? null;
    return {
      ...m,
      body,
      fullText: body !== null,
      sentiment: analyzeSentiment(body ? `${m.title}. ${body}` : `${m.title}. ${m.excerpt}`),
      relevance: body
        ? calculateRelevance(
            { title: m.title, excerpt: body, publishedAt: m.publishedAt, sourceType: m.sourceType },
            monitor.query,
          )
        : m.relevance,
      // Del artículo solo se guarda el fragmento donde aparece el sujeto (PRD §14).
      excerpt: (body && snippetAround(body, needle, m.title)) || m.excerpt,
    };
  });

  // --- TEMAS sobre el conjunto de la corrida
  const topics = extractTopics(finalItems.map((m) => `${m.title} ${m.body ?? m.excerpt}`), 10);
  const topicOf = (text: string) => {
    const lower = text.toLowerCase();
    return topics.find((t) => lower.includes(t.topic))?.topic ?? null;
  };

  // --- PERSISTENCIA
  // El índice único (monitor_id, url_hash) hace idempotente la corrida: volver a
  // ejecutar el monitor no duplica lo ya guardado.
  let inserted = 0;
  for (const m of finalItems) {
    const { data, error } = await supabase
      .from("web_mentions")
      .upsert(
        {
          org_id: orgId,
          monitor_id: monitorId,
          title: m.title,
          url: m.url,
          excerpt: m.excerpt,
          source_domain: m.sourceDomain,
          source_type: m.sourceType,
          author: m.author,
          language: monitor.language ?? "es",
          sentiment: m.sentiment.label,
          sentiment_score: m.sentiment.score,
          topic: topicOf(`${m.title} ${m.body ?? m.excerpt}`),
          relevance: m.relevance,
          engagement: m.engagement,
          full_text_analyzed: m.fullText,
          published_at: m.publishedAt,
          published_at_estimated: m.dateEstimated,
        },
        // url_hash es una columna generada; nombrarla evita el límite de tamaño
        // del índice con URLs largas y es lo que PostgREST sabe resolver.
        { onConflict: "monitor_id,url_hash", ignoreDuplicates: true },
      )
      .select("id");

    if (error) {
      errors.push({ url: m.url, message: error.message });
      continue;
    }
    if (data && data.length > 0) {
      inserted++;
      // Traza del motor que produjo el veredicto. El sufijo distingue lo
      // analizado sobre el artículo de lo analizado solo con el titular.
      await supabase.from("sentiment_analysis").upsert(
        {
          org_id: orgId,
          mention_id: data[0].id,
          label: m.sentiment.label,
          score: m.sentiment.score,
          matches: m.sentiment.matches,
          relevance: m.relevance,
          engine: m.fullText ? "heuristic-es-v1+fulltext" : "heuristic-es-v1",
        },
        { onConflict: "mention_id,engine" },
      );
    }
  }

  // --- CATÁLOGO DE TEMAS
  for (const t of topics) {
    await supabase.from("topics").upsert(
      {
        org_id: orgId,
        name: t.topic,
        slug: t.topic,
        mention_count: t.count,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "org_id,slug" },
    );
  }

  const status = errors.length === 0 ? "ok" : inserted > 0 ? "partial" : "error";

  const { count: total } = await supabase
    .from("web_mentions")
    .select("*", { count: "exact", head: true })
    .eq("monitor_id", monitorId);

  if (run) {
    await supabase
      .from("monitor_runs")
      .update({
        finished_at: new Date().toISOString(),
        status,
        sources_checked: feeds.length,
        items_found: deduped.length,
        items_new: inserted,
        errors: errors.length ? errors : null,
      })
      .eq("id", run.id);
  }

  await supabase
    .from("web_monitors")
    .update({
      last_run_at: new Date().toISOString(),
      last_run_status: status,
      last_error: errors.length ? errors[0].message : null,
      mention_count: total ?? 0,
    })
    .eq("id", monitorId);

  return json({
    status,
    sources_checked: feeds.length,
    items_fetched: collected.length,
    items_discarded: collected.length - deduped.length,
    items_found: deduped.length,
    items_new: inserted,
    total_mentions: total ?? 0,
    topics: topics.map((t) => t.topic),
    suggestion: sugerencia,
    // Qué se pudo traer de cada red y qué no: sin esto, cero menciones de
    // Instagram parece "no se habla de él" cuando puede ser un bloqueo.
    social: {
      facebook: social.encontradas.facebook,
      instagram: social.encontradas.instagram,
      blocked: social.bloqueadas,
      failures: social.fallos,
    },
    // La lectura completa es un complemento: sus fallos no cambian `status`,
    // porque la nota no leída se guarda igualmente con su extracto.
    full_text: {
      attempted: reading.attempted,
      read: reading.read,
      stopped_because: reading.stoppedBecause,
      failures: reading.failures,
    },
    errors,
  });
});
