// Servicio de análisis del PRD §16.
//
// La implementación vive en supabase/functions/_shared/analysis.ts para que el
// navegador y las Edge Functions ejecuten exactamente el mismo código: si el
// pipeline de ingesta y el dashboard puntuaran distinto, los números dejarían
// de cuadrar entre lo almacenado y lo que se muestra.

import {
  aiAnalysisService,
  analyzeSentiment,
  calculateRelevance,
  extractEntities,
  extractTopics,
  generateSummary,
} from "@shared/analysis";
import type {
  AnalyzableItem,
  Entity,
  SentimentLabel,
  SentimentResult,
  Summary,
  Topic,
} from "@shared/analysis";
import type { WebMention } from "@/types";

export {
  aiAnalysisService,
  analyzeSentiment,
  calculateRelevance,
  extractEntities,
  extractTopics,
  generateSummary,
};
export type { AnalyzableItem, Entity, SentimentLabel, SentimentResult, Summary, Topic };

/** Adapta una fila de web_mentions a la forma que espera el análisis. */
export function toAnalyzable(mention: WebMention): AnalyzableItem {
  return {
    title: mention.title,
    excerpt: mention.excerpt,
    publishedAt: mention.published_at,
    sourceType: mention.source_type,
    sourceDomain: mention.source_domain,
  };
}

/** Texto completo disponible de una mención, para tokenizar. */
export function mentionText(mention: WebMention): string {
  return `${mention.title} ${mention.excerpt ?? ""}`.trim();
}

/**
 * Resumen ejecutivo de un conjunto de menciones ya almacenadas.
 *
 * Usa el sentimiento persistido, no lo recalcula: es el que produjo el pipeline
 * al ingerir y el que sostiene el resto de las cifras del panel.
 */
export function summarizeMentions(mentions: WebMention[], subject?: string): Summary {
  return generateSummary({
    items: mentions.map(toAnalyzable),
    sentiments: mentions.map((m) => (m.sentiment ?? "neutral") as SentimentLabel),
    topics: extractTopics(mentions.map(mentionText)),
    ...(subject ? { subject } : {}),
  });
}
