import { supabase } from "@/integrations/supabase/client";

/**
 * Mediciones de campaña por sección.
 *
 * El método tiene dos levantamientos y un orden que les da sentido: primero se
 * mide la sección sin que el candidato haya pasado por ahí, se construye el
 * discurso con lo que la gente dijo que necesita, y dos días después de la
 * visita se vuelve a medir. La comparación entre ambos es el dato; cada uno por
 * separado solo describe un momento.
 *
 * Lo que cada etapa PUEDE responder es distinto, y conviene no confundirlo:
 *
 *   * La primera medición no pregunta por el candidato. Su cifra comparable es
 *     la intención de voto, y su aporte real son las necesidades en palabras de
 *     la gente.
 *   * La segunda sí pregunta por él: conocimiento, si creen que puede cambiar
 *     algo y si votarían por él. El conocimiento y la aceptación solo existen
 *     aquí, así que no tienen "antes" contra el que compararse: lo que se
 *     compara entre las dos es la intención de voto.
 */

export type SurveyEtapa = "medicion" | "resultados";

/** Respuestas que no son un partido del catálogo. */
export const VOTO_OTRO = {
  NO_SABE: "No sabe / no contestó",
  NINGUNO: "Por ninguno",
  OTRO: "Otro",
} as const;

export interface SurveyResponse {
  id: string;
  section_code: string;
  etapa: SurveyEtapa;
  nombre: string | null;
  voto_partido: string | null;
  voto_detalle: string | null;
  promesas_incumplidas: string | null;
  necesidad_entidad: string | null;
  necesidad_municipio: string | null;
  conoce_candidato: boolean | null;
  cree_cambio: boolean | null;
  votaria_por_el: boolean | null;
  notas: string | null;
  created_at: string;
}

export interface NuevaRespuesta {
  org_id: string;
  section_code: string;
  etapa: SurveyEtapa;
  nombre?: string | null;
  voto_partido?: string | null;
  voto_detalle?: string | null;
  promesas_incumplidas?: string | null;
  necesidad_entidad?: string | null;
  necesidad_municipio?: string | null;
  conoce_candidato?: boolean | null;
  cree_cambio?: boolean | null;
  votaria_por_el?: boolean | null;
  notas?: string | null;
  created_by?: string | null;
}

export type AgendaEstado = "planeada" | "midiendo" | "visitada" | "cerrada";

export interface AgendaCiclo {
  id: string;
  section_code: string;
  fecha_medicion: string;
  fecha_visita: string;
  fecha_resultados: string;
  estado: AgendaEstado;
  notas: string | null;
}

export const AGENDA_ESTADO: Record<AgendaEstado, string> = {
  planeada: "Planeada",
  midiendo: "Midiendo",
  visitada: "Visitada",
  cerrada: "Cerrada",
};

/** Días que el método deja entre cada hito. */
export const DIAS_ENTRE_HITOS = 2;

/** Suma días a una fecha ISO (YYYY-MM-DD) sin pasar por zonas horarias. */
export function sumaDias(iso: string, dias: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const f = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  f.setUTCDate(f.getUTCDate() + dias);
  return f.toISOString().slice(0, 10);
}

/** Los tres hitos a partir de la fecha de la primera medición. */
export function hitosDesde(fechaMedicion: string) {
  const fechaVisita = sumaDias(fechaMedicion, DIAS_ENTRE_HITOS);
  return {
    fecha_medicion: fechaMedicion,
    fecha_visita: fechaVisita,
    fecha_resultados: sumaDias(fechaVisita, DIAS_ENTRE_HITOS),
  };
}

// -----------------------------------------------------------------------------
// Agregación
// -----------------------------------------------------------------------------

/** Una respuesta de texto libre y cuántas personas la dieron. */
export interface Mencion {
  texto: string;
  veces: number;
}

export interface ResumenEtapa {
  muestras: number;
  /** Intención de voto por clave (siglas o NO_SABE/NINGUNO/OTRO). */
  voto: Record<string, number>;
  /** Muestras que contestaron la intención de voto. */
  votoRespondido: number;
}

export interface ResumenSegunda extends ResumenEtapa {
  /** Respuestas afirmativas y total de quienes contestaron, por pregunta. */
  conoce: { si: number; de: number };
  creeCambio: { si: number; de: number };
  votariaPorEl: { si: number; de: number };
}

export interface PanoramaSeccion {
  primera: ResumenEtapa;
  segunda: ResumenSegunda;
  /** Lo que la gente dijo en la primera medición, agrupado por repetición. */
  necesidadesEntidad: Mencion[];
  necesidadesMunicipio: Mencion[];
  promesas: Mencion[];
}

const porcentaje = (parte: number, total: number) =>
  total > 0 ? Math.round((parte / total) * 1000) / 10 : null;

export { porcentaje as pctMuestra };

/** Normaliza para agrupar: sin acentos, sin signos, en minúsculas. */
function normaliza(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Agrupa respuestas de texto libre por repetición exacta.
 *
 * Se agrupa por el texto normalizado y se conserva la primera redacción tal
 * como la escribió quien capturó: resumir o reescribir las respuestas sería
 * poner palabras en boca de la gente, y estas respuestas son la materia prima
 * del discurso.
 */
export function agrupaMenciones(textos: Array<string | null>): Mencion[] {
  const grupos = new Map<string, Mencion>();
  for (const t of textos) {
    const limpio = (t ?? "").trim();
    if (!limpio) continue;
    const clave = normaliza(limpio);
    if (!clave) continue;
    const previo = grupos.get(clave);
    if (previo) previo.veces += 1;
    else grupos.set(clave, { texto: limpio, veces: 1 });
  }
  return [...grupos.values()].sort(
    (a, b) => b.veces - a.veces || a.texto.localeCompare(b.texto, "es"),
  );
}

function resumeEtapa(filas: SurveyResponse[]): ResumenEtapa {
  const voto: Record<string, number> = {};
  let votoRespondido = 0;
  for (const f of filas) {
    if (!f.voto_partido) continue;
    voto[f.voto_partido] = (voto[f.voto_partido] ?? 0) + 1;
    votoRespondido += 1;
  }
  return { muestras: filas.length, voto, votoRespondido };
}

/** Cuenta los sí sobre quienes contestaron; un nulo no es un no. */
function cuentaSi(filas: SurveyResponse[], campo: keyof SurveyResponse) {
  let si = 0;
  let de = 0;
  for (const f of filas) {
    const v = f[campo];
    if (v === null || v === undefined) continue;
    de += 1;
    if (v === true) si += 1;
  }
  return { si, de };
}

export function panoramaDe(filas: SurveyResponse[]): PanoramaSeccion {
  const primeras = filas.filter((f) => f.etapa === "medicion");
  const segundas = filas.filter((f) => f.etapa === "resultados");

  return {
    primera: resumeEtapa(primeras),
    segunda: {
      ...resumeEtapa(segundas),
      conoce: cuentaSi(segundas, "conoce_candidato"),
      creeCambio: cuentaSi(segundas, "cree_cambio"),
      votariaPorEl: cuentaSi(segundas, "votaria_por_el"),
    },
    necesidadesEntidad: agrupaMenciones(primeras.map((f) => f.necesidad_entidad)),
    necesidadesMunicipio: agrupaMenciones(primeras.map((f) => f.necesidad_municipio)),
    promesas: agrupaMenciones(primeras.map((f) => f.promesas_incumplidas)),
  };
}

/**
 * Muestras mínimas para publicar un porcentaje.
 *
 * Por debajo de esto el porcentaje se mueve demasiado con cada respuesta —con
 * cuatro muestras, una sola vale 25 puntos— y presentarlo como medición
 * invitaría a decidir sobre ruido. La cifra se sigue mostrando, pero avisada.
 */
export const MUESTRA_MINIMA = 10;

// -----------------------------------------------------------------------------
// Discurso
// -----------------------------------------------------------------------------

export interface DiscursoCandidato {
  titulo: string;
  apertura: string;
  ejes: Array<{ necesidad: string; veces: number; compromiso: string }>;
  promesasIncumplidas: Mencion[];
  cierre: string;
  advertencia: string | null;
}

/**
 * Discurso para la visita, armado con lo que se levantó en la sección.
 *
 * No inventa temas ni promete nada que no haya salido de las respuestas: cada
 * eje cita una necesidad tal como la dijo la gente y dice cuántas personas la
 * mencionaron, para que el candidato sepa qué peso tiene. Las promesas
 * incumplidas se listan aparte porque son el terreno que hay que desactivar
 * antes de pedir confianza, no un tema que convenga prometer de nuevo.
 */
export function generaDiscurso(
  panorama: PanoramaSeccion,
  datos: { seccion: string; municipio: string; candidato: string | null },
): DiscursoCandidato | null {
  const { primera, necesidadesEntidad, necesidadesMunicipio, promesas } = panorama;
  if (primera.muestras === 0) return null;

  const quien = datos.candidato?.trim() || "la candidatura";

  // Municipio primero: es la escala en la que una presidencia puede actuar.
  const ejes = [...necesidadesMunicipio, ...necesidadesEntidad].slice(0, 4).map((m) => ({
    necesidad: m.texto,
    veces: m.veces,
    compromiso: compromisoPara(m.texto),
  }));

  const apertura =
    `Vengo de escuchar a ${primera.muestras} ` +
    `${primera.muestras === 1 ? "vecina o vecino" : "vecinas y vecinos"} de la sección ` +
    `${datos.seccion}, aquí en ${datos.municipio}. No traigo un discurso hecho en una ` +
    `oficina: traigo lo que ustedes dijeron, con sus palabras, y vengo a responderlo ` +
    `punto por punto.`;

  const cierre = promesas.length
    ? `Sé que ya les prometieron cosas que no llegaron. Me lo dijeron ${promesas.reduce(
        (a, p) => a + p.veces,
        0,
      )} veces en esta sección. Por eso no les voy a pedir que me crean: les voy a pedir ` +
      `que me midan. Vuelvo a esta sección y lo revisamos juntos, punto por punto.`
    : `No les pido que me crean: les pido que me midan. Vuelvo a esta sección y lo ` +
      `revisamos juntos, punto por punto.`;

  return {
    titulo: `Discurso para la sección ${datos.seccion} · ${datos.municipio}`,
    apertura,
    ejes,
    promesasIncumplidas: promesas.slice(0, 5),
    cierre,
    advertencia:
      primera.muestras < MUESTRA_MINIMA
        ? `Construido con ${primera.muestras} ${
            primera.muestras === 1 ? "muestra" : "muestras"
          }. Son pocas para dar por representativa a la sección: sirven para preparar la ` +
          `visita, no para afirmar qué piensa la sección entera.`
        : null,
  };
}

/**
 * Frase de compromiso para una necesidad.
 *
 * Se reconoce el tema por palabras clave y se devuelve una frase que lo nombra
 * sin cifras ni plazos. Poner "en 90 días" o un monto sería inventar un
 * compromiso que nadie autorizó; lo concreto lo pone la campaña al revisarlo.
 */
function compromisoPara(texto: string): string {
  const t = normaliza(texto);
  const tiene = (...claves: string[]) => claves.some((c) => t.includes(c));

  if (tiene("agua", "potable", "pipa", "pozo"))
    return "El agua no se negocia: levantar el censo de tomas y fugas de esta sección y presentar el calendario de obra con fechas públicas.";
  if (tiene("luz", "alumbrado", "lampara", "oscuro"))
    return "Alumbrado encendido calle por calle, con el listado de luminarias de esta sección publicado y revisable.";
  if (tiene("calle", "pavimento", "bache", "camino", "banqueta"))
    return "Pavimentación y bacheo con prioridad por calle, decidida aquí y no en el escritorio.";
  if (tiene("basura", "drenaje", "alcantarilla", "aguas negras"))
    return "Recolección con ruta fija y atención al drenaje, con el reporte a la vista de todos.";
  if (tiene("seguridad", "robo", "violencia", "patrulla", "delincuencia"))
    return "Seguridad con presencia real y un canal directo de reporte para esta sección.";
  if (tiene("salud", "clinica", "medico", "medicina", "centro de salud"))
    return "Abasto de medicamento y horarios de atención que se cumplan en la unidad que les corresponde.";
  if (tiene("escuela", "educacion", "maestro", "beca", "kinder"))
    return "Mantenimiento de las escuelas de la zona y becas que lleguen a quien le toca.";
  if (tiene("empleo", "trabajo", "economia", "negocio", "apoyo al campo", "campo"))
    return "Apoyo al trabajo y al campo de aquí, con reglas claras y sin intermediarios.";
  if (tiene("transporte", "camion", "ruta"))
    return "Transporte con rutas y horarios que sirvan a esta sección, no a la hoja de cálculo.";
  if (tiene("parque", "deporte", "cancha", "espacio"))
    return "Rescate de los espacios públicos de la sección, con mantenimiento que no se abandone.";
  if (tiene("corrupcion", "transparencia", "moche", "desvio"))
    return "Cuentas públicas y abiertas: cada peso de esta sección, consultable.";

  return "Lo asumo como compromiso de esta visita y vuelvo con una respuesta concreta sobre este punto.";
}

// -----------------------------------------------------------------------------
// Acceso a datos
// -----------------------------------------------------------------------------

const PAGINA = 1000;

const CAMPOS =
  "id, section_code, etapa, nombre, voto_partido, voto_detalle, promesas_incumplidas, " +
  "necesidad_entidad, necesidad_municipio, conoce_candidato, cree_cambio, votaria_por_el, " +
  "notas, created_at";

export const surveyService = {
  /**
   * Respuestas de la organización, o de una sola sección.
   *
   * Pagina a mano por el mismo motivo que el resto: PostgREST corta en 1,000
   * filas y un corte silencioso aquí desplazaría todos los porcentajes.
   */
  async list(sectionCode?: string | null): Promise<SurveyResponse[]> {
    const filas: SurveyResponse[] = [];
    for (let desde = 0; ; desde += PAGINA) {
      let q = supabase
        .from("survey_responses")
        .select(CAMPOS)
        .order("created_at", { ascending: false })
        .range(desde, desde + PAGINA - 1);
      if (sectionCode) q = q.eq("section_code", sectionCode);

      const { data, error } = await q;
      if (error) throw error;
      if (!data?.length) break;
      filas.push(...(data as unknown as SurveyResponse[]));
      if (data.length < PAGINA) break;
    }
    return filas;
  },

  async add(payload: NuevaRespuesta): Promise<void> {
    const { error } = await supabase.from("survey_responses").insert(payload);
    if (error) throw error;
  },

  async listAgenda(): Promise<AgendaCiclo[]> {
    const { data, error } = await supabase
      .from("campaign_agenda")
      .select("id, section_code, fecha_medicion, fecha_visita, fecha_resultados, estado, notas")
      .order("fecha_medicion", { ascending: true });
    if (error) throw error;
    return (data ?? []) as unknown as AgendaCiclo[];
  },

  /** Programa o reprograma el ciclo de una sección. */
  async saveAgenda(entrada: {
    org_id: string;
    section_code: string;
    fecha_medicion: string;
    fecha_visita: string;
    fecha_resultados: string;
    estado: AgendaEstado;
    notas?: string | null;
    updated_by?: string | null;
  }): Promise<void> {
    const { error } = await supabase
      .from("campaign_agenda")
      .upsert(
        { ...entrada, updated_at: new Date().toISOString() },
        { onConflict: "org_id,section_code" },
      );
    if (error) throw error;
  },

  async deleteAgenda(id: string): Promise<void> {
    const { error } = await supabase.from("campaign_agenda").delete().eq("id", id);
    if (error) throw error;
  },
};
