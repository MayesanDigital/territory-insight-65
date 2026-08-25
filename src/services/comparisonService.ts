import { analyzeMentions, monitoringService, type MentionAnalytics } from "@/services/monitoringService";
import type { WebMention, WebMonitor } from "@/types";

/**
 * Comparativo entre búsquedas del historial de monitoreo.
 *
 * Pone lado a lado a dos o más sujetos monitoreados y traduce las diferencias en
 * fortalezas y debilidades. La comparación es relativa por diseño: tener un 30%
 * de menciones negativas no significa lo mismo si el rival tiene 10% que si
 * tiene 50%, y una cifra aislada no permite decidir nada.
 *
 * Cada juicio se acompaña de la cifra que lo sostiene, y solo se emite cuando la
 * diferencia supera un umbral: por debajo de él, dos números distintos son el
 * mismo resultado con ruido.
 */

/** Diferencia mínima para afirmar que alguien aventaja a otro, en puntos. */
const UMBRAL_PUNTOS = 8;
/** Diferencia mínima en volumen para hablar de ventaja, en proporción. */
const UMBRAL_VOLUMEN = 1.25;

export interface SujetoComparado {
  id: string;
  nombre: string;
  consulta: string;
  tipo: string;
  analytics: MentionAnalytics;
  menciones: WebMention[];
  /** Porcentaje del total de menciones del comparativo. */
  cuotaVoz: number;
  positivo: number;
  neutral: number;
  negativo: number;
  /** Positivo menos negativo. Resume el saldo en un solo número. */
  saldo: number;
  /** Medios distintos que lo mencionan. */
  diversidadFuentes: number;
  /** Términos que dominan su conversación y no la de los demás. */
  terminosPropios: string[];
  fortalezas: string[];
  debilidades: string[];
}

export interface Comparativo {
  sujetos: SujetoComparado[];
  totalMenciones: number;
  /** Serie diaria con una columna por sujeto, para el gráfico de evolución. */
  evolucion: Array<Record<string, string | number>>;
  lectura: string[];
  generadoEl: string;
}

const pct = (parte: number, total: number) => (total > 0 ? Math.round((parte / total) * 1000) / 10 : 0);

/** Términos que pesan en un sujeto y están ausentes o son marginales en el resto. */
function terminosDistintivos(propio: MentionAnalytics, otros: MentionAnalytics[]): string[] {
  const ajenos = new Set(
    otros.flatMap((o) => o.words.slice(0, 12).map((w) => w.word.toLowerCase())),
  );
  return propio.words
    .filter((w) => !ajenos.has(w.word.toLowerCase()))
    .slice(0, 5)
    .map((w) => w.word);
}

function evaluar(sujeto: SujetoComparado, otros: SujetoComparado[]): void {
  const fortalezas: string[] = [];
  const debilidades: string[] = [];

  const saldoMedioOtros =
    otros.length > 0 ? otros.reduce((a, o) => a + o.saldo, 0) / otros.length : 0;
  const vozMediaOtros =
    otros.length > 0 ? otros.reduce((a, o) => a + o.cuotaVoz, 0) / otros.length : 0;

  // --- Saldo de sentimiento -------------------------------------------------
  const difSaldo = sujeto.saldo - saldoMedioOtros;
  if (difSaldo >= UMBRAL_PUNTOS) {
    fortalezas.push(
      `Saldo de sentimiento favorable: ${sujeto.saldo > 0 ? "+" : ""}${sujeto.saldo} puntos ` +
        `(${sujeto.positivo}% positivo contra ${sujeto.negativo}% negativo), ` +
        `${Math.abs(Math.round(difSaldo))} puntos por encima del resto. La conversación juega a favor.`,
    );
  } else if (difSaldo <= -UMBRAL_PUNTOS) {
    debilidades.push(
      `Saldo de sentimiento adverso: ${sujeto.saldo > 0 ? "+" : ""}${sujeto.saldo} puntos, ` +
        `${Math.abs(Math.round(difSaldo))} por debajo del resto. Es la brecha más costosa de ` +
        `cerrar, porque exige cambiar percepción y no solo aparecer más.`,
    );
  }

  if (sujeto.negativo >= 30) {
    debilidades.push(
      `Casi un tercio de sus menciones son negativas (${sujeto.negativo}%). Aumentar volumen sin ` +
        `corregir esto amplifica la crítica en lugar de diluirla.`,
    );
  }

  // --- Cuota de voz ---------------------------------------------------------
  if (sujeto.cuotaVoz >= vozMediaOtros * UMBRAL_VOLUMEN) {
    fortalezas.push(
      `Domina la conversación con el ${sujeto.cuotaVoz}% de las menciones del comparativo. ` +
        `Marcar la agenda obliga a los demás a responder sobre sus términos.`,
    );
  } else if (sujeto.cuotaVoz * UMBRAL_VOLUMEN <= vozMediaOtros) {
    debilidades.push(
      `Presencia baja: ${sujeto.cuotaVoz}% de las menciones frente a una media de ` +
        `${Math.round(vozMediaOtros)}% del resto. Poca voz no es neutralidad, es ausencia del debate.`,
    );
  }

  // --- Impulso --------------------------------------------------------------
  if (sujeto.analytics.trend >= 20) {
    fortalezas.push(
      `Tendencia al alza: el volumen creció ${Math.round(sujeto.analytics.trend)}% respecto al ` +
        `periodo anterior. ` +
        (sujeto.saldo >= 0
          ? "Con saldo positivo, crecer es ganar terreno."
          : "Con saldo negativo, sin embargo, crecer significa que se difunde más la crítica."),
    );
  } else if (sujeto.analytics.trend <= -20) {
    debilidades.push(
      `Pierde presencia: el volumen cayó ${Math.abs(Math.round(sujeto.analytics.trend))}% ` +
        `respecto al periodo anterior. Desaparecer de la conversación cede el espacio sin disputarlo.`,
    );
  }

  // --- Diversidad de medios -------------------------------------------------
  const diversidadMediaOtros =
    otros.length > 0 ? otros.reduce((a, o) => a + o.diversidadFuentes, 0) / otros.length : 0;

  if (sujeto.diversidadFuentes >= diversidadMediaOtros * UMBRAL_VOLUMEN) {
    fortalezas.push(
      `Cobertura repartida entre ${sujeto.diversidadFuentes} medios distintos. Una narrativa que ` +
        `no depende de una sola redacción es más difícil de apagar.`,
    );
  } else if (sujeto.diversidadFuentes > 0 && sujeto.diversidadFuentes * UMBRAL_VOLUMEN <= diversidadMediaOtros) {
    const principal = sujeto.analytics.sources[0];
    debilidades.push(
      `Cobertura concentrada en ${sujeto.diversidadFuentes} medios` +
        (principal
          ? `, con ${principal.domain} aportando ${pct(principal.total, sujeto.analytics.total)}% de sus menciones`
          : "") +
        `. Depender de pocas redacciones deja la narrativa en manos ajenas.`,
    );
  }

  // --- Alcance --------------------------------------------------------------
  const alcanceMedioOtros =
    otros.length > 0 ? otros.reduce((a, o) => a + o.analytics.reach, 0) / otros.length : 0;
  if (sujeto.analytics.reach >= alcanceMedioOtros * UMBRAL_VOLUMEN && alcanceMedioOtros > 0) {
    fortalezas.push(
      `Alcance estimado de ${sujeto.analytics.reach.toLocaleString("es-MX")} impresiones, muy por ` +
        `encima del resto. Sus menciones llegan a públicos más amplios aunque sean menos numerosas.`,
    );
  }

  // --- Territorio propio ----------------------------------------------------
  if (sujeto.terminosPropios.length >= 2) {
    fortalezas.push(
      `Tiene agenda propia: ${sujeto.terminosPropios.slice(0, 3).join(", ")} aparecen en su ` +
        `conversación y no en la de los demás. Son los temas donde no compite, define.`,
    );
  } else if (sujeto.terminosPropios.length === 0 && sujeto.analytics.total > 0) {
    debilidades.push(
      `Sin términos distintivos: toda su conversación comparte vocabulario con los demás. ` +
        `Sin tema propio, la comparación la gana quien tenga más volumen.`,
    );
  }

  if (fortalezas.length === 0) {
    fortalezas.push(
      "Sin ventaja destacable sobre el resto en volumen, sentimiento, alcance ni diversidad de medios.",
    );
  }
  if (debilidades.length === 0) {
    debilidades.push("Sin desventaja relevante frente al resto en los indicadores comparados.");
  }

  sujeto.fortalezas = fortalezas;
  sujeto.debilidades = debilidades;
}

export const comparisonService = {
  /** Búsquedas del historial que tienen menciones y por tanto pueden compararse. */
  async comparables(): Promise<WebMonitor[]> {
    const monitores = await monitoringService.monitors();
    return monitores.filter((m) => (m.mention_count ?? 0) > 0);
  },

  async comparar(monitores: WebMonitor[]): Promise<Comparativo> {
    const cargados = await Promise.all(
      monitores.map(async (m) => ({ monitor: m, menciones: await monitoringService.mentions(m.id) })),
    );

    const totalMenciones = cargados.reduce((a, c) => a + c.menciones.length, 0);

    const sujetos: SujetoComparado[] = cargados.map(({ monitor, menciones }) => {
      const analytics = analyzeMentions(menciones);
      const t = analytics.sentiment.positive + analytics.sentiment.neutral + analytics.sentiment.negative;
      const positivo = pct(analytics.sentiment.positive, t);
      const negativo = pct(analytics.sentiment.negative, t);

      return {
        id: monitor.id,
        nombre: monitor.name,
        consulta: monitor.query,
        tipo: monitor.subject_type ?? "topic",
        analytics,
        menciones,
        cuotaVoz: pct(menciones.length, totalMenciones),
        positivo,
        neutral: pct(analytics.sentiment.neutral, t),
        negativo,
        saldo: Math.round((positivo - negativo) * 10) / 10,
        diversidadFuentes: analytics.sources.length,
        terminosPropios: [],
        fortalezas: [],
        debilidades: [],
      };
    });

    // Los términos propios y los juicios necesitan a los demás sujetos ya
    // calculados, así que van en una segunda pasada.
    for (const s of sujetos) {
      const otros = sujetos.filter((o) => o.id !== s.id);
      s.terminosPropios = terminosDistintivos(
        s.analytics,
        otros.map((o) => o.analytics),
      );
      evaluar(s, otros);
    }

    // --- Serie de evolución, con una columna por sujeto ----------------------
    const fechas = new Set<string>();
    for (const s of sujetos) for (const p of s.analytics.timeline) fechas.add(p.date);

    const evolucion = [...fechas]
      .sort()
      .map((fecha) => {
        const fila: Record<string, string | number> = { fecha };
        for (const s of sujetos) {
          fila[s.nombre] = s.analytics.timeline.find((p) => p.date === fecha)?.total ?? 0;
        }
        return fila;
      });

    // --- Lectura general -----------------------------------------------------
    const porVoz = [...sujetos].sort((a, b) => b.cuotaVoz - a.cuotaVoz);
    const porSaldo = [...sujetos].sort((a, b) => b.saldo - a.saldo);
    const lectura: string[] = [];

    if (sujetos.length >= 2) {
      const lider = porVoz[0];
      const segundo = porVoz[1];
      lectura.push(
        `${lider.nombre} concentra el ${lider.cuotaVoz}% de las ${totalMenciones} menciones ` +
          `comparadas, frente al ${segundo.cuotaVoz}% de ${segundo.nombre}. ` +
          (lider.cuotaVoz >= segundo.cuotaVoz * UMBRAL_VOLUMEN
            ? "La diferencia de volumen es sustancial: marca la agenda."
            : "La diferencia de volumen es estrecha: ninguno domina la conversación."),
      );

      const mejor = porSaldo[0];
      const peor = porSaldo[porSaldo.length - 1];
      if (mejor.id !== peor.id) {
        lectura.push(
          `En calidad de la conversación, ${mejor.nombre} encabeza con un saldo de ` +
            `${mejor.saldo > 0 ? "+" : ""}${mejor.saldo} puntos, y ${peor.nombre} cierra con ` +
            `${peor.saldo > 0 ? "+" : ""}${peor.saldo}. ` +
            (mejor.id !== lider.id
              ? `Quien más aparece no es quien mejor aparece: ${lider.nombre} tiene más volumen, ` +
                `pero ${mejor.nombre} tiene mejor saldo. Volumen y percepción son problemas distintos.`
              : `${mejor.nombre} lidera en ambas dimensiones, lo que consolida su posición.`),
        );
      }

      const enAlza = sujetos.filter((s) => s.analytics.trend >= 20);
      const enCaida = sujetos.filter((s) => s.analytics.trend <= -20);
      if (enAlza.length || enCaida.length) {
        lectura.push(
          [
            enAlza.length ? `Ganan presencia: ${enAlza.map((s) => s.nombre).join(", ")}.` : "",
            enCaida.length ? `La pierden: ${enCaida.map((s) => s.nombre).join(", ")}.` : "",
            "La tendencia importa más que la foto fija: quien crece hoy fija el marco de mañana.",
          ]
            .filter(Boolean)
            .join(" "),
        );
      }
    }

    lectura.push(
      `Comparación relativa entre las búsquedas seleccionadas, no una medición absoluta de ` +
        `reputación. Depende de qué medios cubre el monitoreo y del periodo con menciones ` +
        `recogidas, y solo se afirma una ventaja cuando la diferencia supera ${UMBRAL_POR_CIENTO}.`,
    );

    return {
      sujetos: porVoz,
      totalMenciones,
      evolucion,
      lectura,
      generadoEl: new Date().toISOString(),
    };
  },
};

const UMBRAL_POR_CIENTO = `${UMBRAL_PUNTOS} puntos o el ${Math.round((UMBRAL_VOLUMEN - 1) * 100)}% en volumen`;
