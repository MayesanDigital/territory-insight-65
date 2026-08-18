import { supabase } from "@/integrations/supabase/client";
import type { Contact, ContactInsert } from "@/types";

export interface ContactFilters {
  search?: string;
  municipio?: string;
  section_code?: string;
  status?: string;
}

export const contactsService = {
  /**
   * Pagina explícitamente porque PostgREST devuelve como mucho 1000 filas y no
   * avisa de que truncó. Estos contactos alimentan el cálculo de cobertura, así
   * que un corte silencioso no se vería como un error: se vería como una
   * cobertura más baja de la real.
   */
  async list(filters: ContactFilters = {}): Promise<Contact[]> {
    const PAGE = 1000;
    const rows: Contact[] = [];
    for (let from = 0; ; from += PAGE) {
      let query = supabase
        .from("contacts")
        .select("*")
        .order("registered_at", { ascending: false })
        .range(from, from + PAGE - 1);
      if (filters.municipio) query = query.eq("municipio", filters.municipio);
      if (filters.section_code) query = query.eq("section_code", filters.section_code);
      if (filters.status) query = query.eq("status", filters.status);
      if (filters.search) query = query.ilike("full_name", `%${filters.search}%`);
      const { data, error } = await query;
      if (error) throw error;
      if (!data?.length) break;
      rows.push(...data);
      if (data.length < PAGE) break;
    }
    return rows;
  },

  async create(payload: ContactInsert) {
    const { data, error } = await supabase.from("contacts").insert(payload).select().single();
    if (error) throw error;
    await contactsService.log(payload.org_id, data.id, "created");
    return data;
  },

  async update(id: string, payload: Partial<ContactInsert>, orgId: string) {
    const { data, error } = await supabase
      .from("contacts")
      .update(payload)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    await contactsService.log(orgId, id, "updated");
    return data;
  },

  async remove(id: string, orgId: string) {
    await contactsService.log(orgId, null, "deleted", { contact_id: id });
    const { error } = await supabase.from("contacts").delete().eq("id", id);
    if (error) throw error;
  },

  async history(contactId: string) {
    const { data, error } = await supabase
      .from("contact_history")
      .select("*")
      .eq("contact_id", contactId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  async log(
    orgId: string,
    contactId: string | null,
    action: string,
    details?: Record<string, unknown>,
  ) {
    await supabase.from("contact_history").insert({
      org_id: orgId,
      contact_id: contactId,
      action,
      details: (details ?? null) as never,
    });
  },
};

export function maskPhone(phone: string | null): string {
  if (!phone) return "—";
  const clean = phone.replace(/\s/g, "");
  if (clean.length < 4) return "•••";
  return `••• ••• ${clean.slice(-4)}`;
}
