import { supabase } from "@/integrations/supabase/client";
import type { Candidate, SectionGoal } from "@/types";

export type CandidateInput = {
  full_name: string;
  photo_url?: string | null;
  cargo?: string | null;
  partido?: string | null;
  municipio?: string | null;
  distrito?: string | null;
  eslogan?: string | null;
  fecha_eleccion?: string | null;
};

/** Formatos y tamaño que acepta el bucket. Se validan aquí para dar un mensaje
 *  claro en vez del error genérico que devuelve el almacenamiento. */
export const FOTO_TIPOS = ["image/jpeg", "image/png", "image/webp", "image/avif"];
export const FOTO_MAX_BYTES = 5 * 1024 * 1024;

export const campaignService = {
  /**
   * Sube la fotografía de la candidatura y devuelve su URL pública.
   *
   * Se guarda siempre en la misma ruta por organización y se sobrescribe. Así no
   * se acumulan archivos huérfanos cada vez que se cambia la foto, y no hace
   * falta borrar nada. Como la ruta no cambia, la URL se devuelve con una marca
   * de tiempo para que el navegador no siga mostrando la imagen anterior.
   */
  async uploadPhoto(orgId: string, file: File): Promise<string> {
    if (!FOTO_TIPOS.includes(file.type)) {
      throw new Error("Formato no admitido. Usa JPG, PNG, WEBP o AVIF.");
    }
    if (file.size > FOTO_MAX_BYTES) {
      throw new Error(
        `La imagen pesa ${(file.size / 1048576).toFixed(1)} MB y el máximo son 5 MB.`,
      );
    }

    const ruta = `${orgId}/foto`;
    const { error } = await supabase.storage
      .from("candidatos")
      .upload(ruta, file, { upsert: true, contentType: file.type, cacheControl: "3600" });
    if (error) throw error;

    const { data } = supabase.storage.from("candidatos").getPublicUrl(ruta);
    return `${data.publicUrl}?v=${Date.now()}`;
  },

  /** Ficha de la candidatura. `null` mientras nadie la haya capturado. */
  async getCandidate(): Promise<Candidate | null> {
    const { data, error } = await supabase.from("candidates").select("*").maybeSingle();
    if (error) throw error;
    return data ?? null;
  },

  /**
   * Crea o actualiza la ficha. Hay una sola por organización, así que el
   * conflicto sobre `org_id` convierte el alta y la edición en la misma llamada.
   */
  async saveCandidate(orgId: string, values: CandidateInput): Promise<Candidate> {
    const { data, error } = await supabase
      .from("candidates")
      .upsert({ ...values, org_id: orgId, updated_at: new Date().toISOString() },
              { onConflict: "org_id" })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  /** Metas de todas las secciones, indexadas por clave. */
  async listGoals(): Promise<Record<string, number>> {
    const { data, error } = await supabase
      .from("section_goals")
      .select("section_code, meta_contactos");
    if (error) throw error;

    const mapa: Record<string, number> = {};
    for (const row of data ?? []) mapa[row.section_code] = row.meta_contactos;
    return mapa;
  },

  async getGoal(sectionCode: string): Promise<SectionGoal | null> {
    const { data, error } = await supabase
      .from("section_goals")
      .select("*")
      .eq("section_code", sectionCode)
      .maybeSingle();
    if (error) throw error;
    return data ?? null;
  },

  async saveGoal(orgId: string, sectionCode: string, meta: number): Promise<SectionGoal> {
    const { data, error } = await supabase
      .from("section_goals")
      .upsert(
        {
          org_id: orgId,
          section_code: sectionCode,
          meta_contactos: Math.max(0, Math.round(meta)),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "org_id,section_code" },
      )
      .select()
      .single();
    if (error) throw error;
    return data;
  },
};

export interface AvanceSeccion {
  meta: number;
  fidelizados: number;
  seguros: number;
  /** Registrados sin categoría asignada. Cuentan para el avance, no para el reparto. */
  sinCategoria: number;
  registrados: number;
  /** Contactos que faltan para alcanzar la meta. Nunca negativo. */
  restantes: number;
  /** Porcentajes sobre la meta. Suman 100 salvo que se haya superado. */
  pctFidelizados: number;
  pctSeguros: number;
  pctSinCategoria: number;
  pctRestantes: number;
  /** Avance total sobre la meta; puede pasar de 100. */
  pctAvance: number;
  cumplida: boolean;
}

/**
 * Reparte la meta de una sección en fidelizados, seguros y restantes.
 *
 * Los porcentajes se calculan sobre la META, no sobre lo registrado: es lo que
 * permite leer de un vistazo cuánto falta. Si la meta se supera, los restantes
 * quedan en cero y el avance pasa de 100, que es información útil y no un error.
 * Sin meta fijada no hay denominador y todo queda en cero.
 */
export function calculaAvance(
  meta: number,
  fidelizados: number,
  seguros: number,
  total: number,
): AvanceSeccion {
  const sinCategoria = Math.max(0, total - fidelizados - seguros);
  const restantes = Math.max(0, meta - total);
  const pct = (v: number) => (meta > 0 ? Math.round((v / meta) * 1000) / 10 : 0);

  return {
    meta,
    fidelizados,
    seguros,
    sinCategoria,
    registrados: total,
    restantes,
    pctFidelizados: pct(fidelizados),
    pctSeguros: pct(seguros),
    pctSinCategoria: pct(sinCategoria),
    pctRestantes: pct(restantes),
    pctAvance: pct(total),
    cumplida: meta > 0 && total >= meta,
  };
}
