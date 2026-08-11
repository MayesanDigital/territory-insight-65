import { supabase } from "@/integrations/supabase/client";
import type { TerritorialUnit } from "@/types";

export const territoryService = {
  async list(): Promise<TerritorialUnit[]> {
    const { data, error } = await supabase
      .from("territorial_units")
      .select("*")
      .order("section_code");
    if (error) throw error;
    return data ?? [];
  },

  async getById(id: string): Promise<TerritorialUnit | null> {
    const { data, error } = await supabase
      .from("territorial_units")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data;
  },

  async municipios(): Promise<string[]> {
    const units = await territoryService.list();
    return Array.from(new Set(units.map((u) => u.municipio))).sort();
  },

  async importUnits(rows: Array<Record<string, unknown>>, orgId: string) {
    const payload = rows.map((r) => ({ ...r, org_id: orgId }));
    const { error, count } = await supabase
      .from("territorial_units")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .upsert(payload as any, { onConflict: "org_id,section_code", count: "exact" });
    if (error) throw error;
    return count ?? payload.length;
  },
};
