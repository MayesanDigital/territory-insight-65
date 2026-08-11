import type { Database } from "@/integrations/supabase/types";

export type TerritorialUnit = Database["public"]["Tables"]["territorial_units"]["Row"];
export type Contact = Database["public"]["Tables"]["contacts"]["Row"];
export type ContactInsert = Database["public"]["Tables"]["contacts"]["Insert"];
export type WebMonitor = Database["public"]["Tables"]["web_monitors"]["Row"];
export type WebMention = Database["public"]["Tables"]["web_mentions"]["Row"];
export type WebSource = Database["public"]["Tables"]["web_sources"]["Row"];
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type AppRole = Database["public"]["Enums"]["app_role"];

export const GENDER_LABELS: Record<string, string> = {
  femenino: "Femenino",
  masculino: "Masculino",
  no_especificado: "No especificado",
};

export const SENTIMENT_LABELS: Record<string, string> = {
  positive: "Positivo",
  neutral: "Neutral",
  negative: "Negativo",
};
