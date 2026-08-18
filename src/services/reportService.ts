import { supabase } from "@/integrations/supabase/client";
import { analyticsService, fetchMunicipalDemographics } from "@/services/analyticsService";
import { contactsService, maskPhone } from "@/services/contactsService";
import { monitoringService, analyzeMentions } from "@/services/monitoringService";
import { territoryService } from "@/services/territoryService";
import { summarizeMentions } from "@/services/aiAnalysisService";
import { CENSUS_DISPLAY_LABEL, GENDER_LABELS, SENTIMENT_LABELS } from "@/types";
import type { ReportMeta, ReportSection } from "@/lib/export";

export type ReportType = "territorial" | "contactos" | "monitoreo";

export interface ReportPayload {
  meta: ReportMeta;
  sections: ReportSection[];
}

export const REPORT_LABELS: Record<ReportType, { title: string; description: string }> = {
  territorial: {
    title: "Reporte territorial y demográfico",
    description:
      "Población, estructura por edad y género, y cobertura administrativa por municipio y sección.",
  },
  contactos: {
    title: "Reporte de contactos",
    description:
      "Padrón administrativo con consentimiento, distribución territorial y evolución de altas.",
  },
  monitoreo: {
    title: "Reporte de monitoreo público",
    description: "Menciones, sentimiento, temas, fuentes y evolución de la conversación.",
  },
};

const pct = (part: number, whole: number) => (whole > 0 ? Number(((part / whole) * 100).toFixed(2)) : 0);

/**
 * Construye el contenido del reporte.
 *
 * Devuelve datos ya formateados y neutros para que los tres formatos —PDF, CSV
 * y XLSX— salgan del mismo origen. Si cada uno armara su propia consulta,
 * acabarían discrepando entre sí.
 */
export async function buildReport(type: ReportType, organization?: string): Promise<ReportPayload> {
  const generatedFor = organization ?? "Organización";

  if (type === "territorial") {
    const [units, contacts, municipal] = await Promise.all([
      territoryService.list(),
      contactsService.list(),
      fetchMunicipalDemographics(),
    ]);

    const totals = analyticsService.totals(units, contacts);
    const byMunicipio = analyticsService.byMunicipio(units, contacts);

    return {
      meta: {
        title: REPORT_LABELS.territorial.title,
        subtitle: CENSUS_DISPLAY_LABEL,
        organization: generatedFor,
        kpis: [
          { label: "Secciones", value: totals.sections.toLocaleString("es-MX") },
          { label: "Municipios", value: String(totals.municipios) },
          { label: "Población", value: totals.population.toLocaleString("es-MX") },
          { label: "Contactos", value: totals.contacts.toLocaleString("es-MX") },
          { label: "Cobertura", value: `${totals.coverage.toFixed(3)}%` },
        ],
        summary: [
          `El territorio comprende ${totals.sections.toLocaleString("es-MX")} secciones en ${totals.municipios} municipios, con una población de referencia de ${totals.population.toLocaleString("es-MX")} personas.`,
          `Se registran ${totals.contacts.toLocaleString("es-MX")} contactos con consentimiento, equivalentes a una cobertura administrativa del ${totals.coverage.toFixed(3)}%. Este indicador es administrativo y no representa apoyo, afiliación ni intención de voto.`,
        ],
      },
      sections: [
        {
          heading: "Cobertura por municipio",
          rows: byMunicipio.map((r) => ({
            Municipio: r.key,
            Secciones: r.sections,
            Población: r.population,
            Contactos: r.contacts,
            "Cobertura %": Number(r.coverage.toFixed(3)),
          })),
        },
        {
          heading: "Estructura por edad",
          description:
            "Rangos calculados a escala municipal, la única en la que el censo publica estos cortes.",
          rows: analyticsService.prdAgeDistribution(municipal).map((r) => ({
            Rango: r.range,
            Personas: r.value,
            "% del total": pct(r.value, totals.population),
          })),
        },
        {
          heading: "Distribución por género",
          rows: analyticsService.genderDistribution(units).map((r) => ({
            Género: r.name,
            Personas: r.value,
            "% del total": pct(r.value, totals.population),
          })),
        },
        {
          heading: "Secciones por cobertura",
          description: "Las 50 secciones con mayor número de contactos registrados.",
          rows: analyticsService
            .bySection(units, contacts)
            .slice(0, 50)
            .map((r) => ({
              Sección: r.key,
              Población: r.population,
              Contactos: r.contacts,
              "Cobertura %": Number(r.coverage.toFixed(3)),
            })),
        },
      ],
    };
  }

  if (type === "contactos") {
    const [contacts, units] = await Promise.all([contactsService.list(), territoryService.list()]);
    const byMunicipio = analyticsService.byMunicipio(units, contacts);
    const conComms = contacts.filter((c) => c.consent_comms).length;

    const edades = contacts.filter((c) => c.age !== null).map((c) => c.age as number);
    const edadPromedio = edades.length
      ? (edades.reduce((s, n) => s + n, 0) / edades.length).toFixed(1)
      : "—";

    return {
      meta: {
        title: REPORT_LABELS.contactos.title,
        organization: generatedFor,
        kpis: [
          { label: "Contactos", value: contacts.length.toLocaleString("es-MX") },
          { label: "Con consentimiento", value: contacts.length.toLocaleString("es-MX") },
          { label: "Aceptan comunicación", value: conComms.toLocaleString("es-MX") },
          { label: "Edad promedio", value: String(edadPromedio) },
        ],
        summary: [
          `El padrón contiene ${contacts.length.toLocaleString("es-MX")} contactos, todos con consentimiento explícito de almacenamiento —la base lo impone y no admite registros sin él—. De ellos, ${conComms.toLocaleString("es-MX")} autorizaron además recibir comunicaciones.`,
        ],
      },
      sections: [
        {
          heading: "Distribución por municipio",
          rows: byMunicipio
            .filter((r) => r.contacts > 0)
            .map((r) => ({
              Municipio: r.key,
              Contactos: r.contacts,
              Población: r.population,
              "Cobertura %": Number(r.coverage.toFixed(3)),
            })),
        },
        {
          heading: "Evolución mensual de altas",
          rows: analyticsService.monthlyRegistrations(contacts).map((r) => ({
            Mes: r.month,
            Altas: r.total,
          })),
        },
        {
          heading: "Padrón",
          description:
            "El teléfono se exporta enmascarado. Para obtener el dato completo se requiere acceso directo y queda registrado en la auditoría.",
          rows: contacts.map((c) => ({
            Nombre: c.full_name,
            Edad: c.age ?? "",
            Género: GENDER_LABELS[c.gender ?? "no_especificado"] ?? "",
            Teléfono: maskPhone(c.phone),
            Municipio: c.municipio ?? "",
            Sección: c.section_code ?? "",
            Estado: c.status,
            Comunicaciones: c.consent_comms ? "Sí" : "No",
            Alta: (c.registered_at ?? "").slice(0, 10),
          })),
        },
      ],
    };
  }

  // Monitoreo
  const [mentions, monitors] = await Promise.all([
    monitoringService.mentions(),
    monitoringService.monitors(),
  ]);
  const a = analyzeMentions(mentions);
  const summary = summarizeMentions(mentions);

  return {
    meta: {
      title: REPORT_LABELS.monitoreo.title,
      organization: generatedFor,
      kpis: [
        { label: "Menciones", value: a.total.toLocaleString("es-MX") },
        { label: "Positivas", value: `${pct(a.sentiment.positive, a.total)}%` },
        { label: "Neutrales", value: `${pct(a.sentiment.neutral, a.total)}%` },
        { label: "Negativas", value: `${pct(a.sentiment.negative, a.total)}%` },
        { label: "Tendencia", value: `${a.trend > 0 ? "+" : ""}${a.trend}%` },
      ],
      summary: [summary.headline, ...summary.paragraphs],
    },
    sections: [
      {
        heading: "Monitores configurados",
        rows: monitors.map((m) => ({
          Monitor: m.name,
          Término: m.query,
          Tipo: m.subject_type,
          Menciones: m.mention_count,
          "Última corrida": m.last_run_at ? m.last_run_at.slice(0, 16).replace("T", " ") : "—",
          Estado: m.last_run_status ?? "sin ejecutar",
        })),
      },
      {
        heading: "Evolución diaria",
        rows: a.timeline.map((d) => ({
          Fecha: d.date,
          Total: d.total,
          Positivas: d.positive,
          Negativas: d.negative,
        })),
      },
      {
        heading: "Fuentes principales",
        rows: a.sources.map((s) => ({
          Fuente: s.domain,
          Menciones: s.total,
          "% del total": pct(s.total, a.total),
        })),
      },
      {
        heading: "Términos más relevantes",
        description: "Ponderados por TF-IDF: destacan los distintivos, no los simplemente repetidos.",
        rows: a.words.slice(0, 25).map((w) => ({
          Término: w.word,
          Apariciones: w.total,
          Peso: w.weight,
        })),
      },
      {
        heading: "Menciones",
        description: "Contenidos públicos. No se registra la autoría en fuentes de foro.",
        rows: mentions.slice(0, 300).map((m) => ({
          Fecha: (m.published_at ?? "").slice(0, 10),
          Titular: m.title,
          Fuente: m.source_domain ?? "",
          Tipo: m.source_type ?? "",
          Sentimiento: SENTIMENT_LABELS[m.sentiment ?? "neutral"] ?? "",
          Relevancia: m.relevance ?? 0,
          URL: m.url ?? "",
        })),
      },
    ],
  };
}

/**
 * Deja constancia del reporte generado.
 *
 * No guarda el archivo, solo el hecho: quién lo generó, de qué tipo y en qué
 * formato. Es lo que pide la auditoría del PRD §20 sin duplicar datos
 * personales fuera de las tablas que los protegen.
 */
export async function recordReport(
  orgId: string,
  type: ReportType,
  format: "pdf" | "csv" | "xlsx",
  params: Record<string, unknown> = {},
) {
  const { data, error } = await supabase
    .from("reports")
    .insert({
      org_id: orgId,
      name: REPORT_LABELS[type].title,
      report_type: type,
      format,
      params: params as never,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function listReports() {
  const { data, error } = await supabase
    .from("reports")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(25);
  if (error) throw error;
  return data ?? [];
}
