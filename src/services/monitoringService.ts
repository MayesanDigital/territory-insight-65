import { supabase } from "@/integrations/supabase/client";
import { extractTopics, mentionText } from "@/services/aiAnalysisService";
import type { WebMention, WebMonitor, WebSource } from "@/types";

export interface IngestResult {
  status: "ok" | "partial" | "error";
  sources_checked: number;
  /** Resultados que devolvieron las fuentes, antes de filtrar. */
  items_fetched: number;
  /** Descartados por no mencionar al sujeto o por repetirse. */
  items_discarded: number;
  items_found: number;
  items_new: number;
  total_mentions: number;
  topics: string[];
  errors: Array<{ url: string; message: string }>;
}

export const monitoringService = {
  async monitors(): Promise<WebMonitor[]> {
    const { data, error } = await supabase
      .from("web_monitors")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  async createMonitor(payload: {
    org_id: string;
    name: string;
    query: string;
    subject_type: string;
  }) {
    const { data, error } = await supabase.from("web_monitors").insert(payload).select().single();
    if (error) throw error;
    return data;
  },

  async toggleMonitor(id: string, active: boolean) {
    const { error } = await supabase.from("web_monitors").update({ active }).eq("id", id);
    if (error) throw error;
  },

  async removeMonitor(id: string) {
    const { error } = await supabase.from("web_monitors").delete().eq("id", id);
    if (error) throw error;
  },

  async sources(): Promise<WebSource[]> {
    const { data, error } = await supabase.from("web_sources").select("*").order("domain");
    if (error) throw error;
    return data ?? [];
  },

  /**
   * Crea el monitor si no existe y lo devuelve.
   *
   * Va por RPC para reutilizar el monitor cuando el término ya está vigilado:
   * buscar dos veces lo mismo no debe generar monitores duplicados.
   */
  async createOrGetMonitor(query: string, name?: string, subjectType = "person") {
    const { data, error } = await supabase.rpc("create_monitor", {
      _name: name ?? query,
      _query: query,
      _subject_type: subjectType,
    });
    if (error) throw error;
    return data as string;
  },

  /**
   * Ejecuta la ingesta en la Edge Function.
   *
   * El trabajo vive en el servidor porque el navegador no puede consultar
   * feeds de otros dominios: CORS lo bloquea, y además así el crawler se
   * identifica con un único User-Agent y respeta un ritmo de peticiones.
   */
  async runMonitor(monitorId: string): Promise<IngestResult> {
    const { data, error } = await supabase.functions.invoke<IngestResult>("monitor-ingest", {
      body: { monitor_id: monitorId },
    });
    if (error) throw new Error(error.message);
    if (!data) throw new Error("La ingesta no devolvió resultados");
    return data;
  },

  async runs(monitorId: string) {
    const { data, error } = await supabase
      .from("monitor_runs")
      .select("*")
      .eq("monitor_id", monitorId)
      .order("started_at", { ascending: false })
      .limit(10);
    if (error) throw error;
    return data ?? [];
  },

  async mentions(monitorId?: string): Promise<WebMention[]> {
    let query = supabase
      .from("web_mentions")
      .select("*")
      .order("published_at", { ascending: false })
      .limit(500);
    if (monitorId) query = query.eq("monitor_id", monitorId);
    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  },
};

export interface MentionAnalytics {
  total: number;
  reach: number;
  engagement: number;
  sentiment: { positive: number; neutral: number; negative: number };
  timeline: Array<{ date: string; total: number; positive: number; negative: number }>;
  sources: Array<{ domain: string; total: number }>;
  topics: Array<{ topic: string; total: number }>;
  /** Términos con mayor peso TF-IDF; `total` es su frecuencia bruta. */
  words: Array<{ word: string; total: number; weight: number }>;
  trend: number;
}

export function analyzeMentions(mentions: WebMention[]): MentionAnalytics {
  const sentiment = { positive: 0, neutral: 0, negative: 0 };
  const byDay = new Map<string, { total: number; positive: number; negative: number }>();
  const bySource = new Map<string, number>();
  const byTopic = new Map<string, number>();
  let reach = 0;
  let engagement = 0;

  for (const m of mentions) {
    const s = (m.sentiment ?? "neutral") as keyof typeof sentiment;
    sentiment[s] = (sentiment[s] ?? 0) + 1;
    reach += m.reach ?? 0;
    engagement += m.engagement ?? 0;

    const day = (m.published_at ?? "").slice(0, 10);
    const entry = byDay.get(day) ?? { total: 0, positive: 0, negative: 0 };
    entry.total += 1;
    if (s === "positive") entry.positive += 1;
    if (s === "negative") entry.negative += 1;
    byDay.set(day, entry);

    if (m.source_domain) bySource.set(m.source_domain, (bySource.get(m.source_domain) ?? 0) + 1);
    if (m.topic) byTopic.set(m.topic, (byTopic.get(m.topic) ?? 0) + 1);
  }

  // TF-IDF sobre el corpus en vez de conteo bruto: sin IDF, los términos que
  // aparecen en todas las notas dominan la nube y no dicen nada.
  const words = extractTopics(mentions.map(mentionText), 30).map((t) => ({
    word: t.topic,
    total: t.count,
    weight: t.weight,
  }));

  const timeline = Array.from(byDay.entries())
    .map(([date, v]) => ({ date, ...v }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const half = Math.floor(timeline.length / 2);
  const first = timeline.slice(0, half).reduce((s, d) => s + d.total, 0) || 1;
  const second = timeline.slice(half).reduce((s, d) => s + d.total, 0);

  const rank = (map: Map<string, number>, key: string) =>
    Array.from(map.entries())
      .map(([k, total]) => ({ [key]: k, total }))
      .sort((a, b) => (b.total as number) - (a.total as number));

  return {
    total: mentions.length,
    reach,
    engagement,
    sentiment,
    timeline,
    sources: rank(bySource, "domain").slice(0, 10) as MentionAnalytics["sources"],
    topics: rank(byTopic, "topic").slice(0, 10) as MentionAnalytics["topics"],
    words,
    trend: Math.round(((second - first) / first) * 100),
  };
}
