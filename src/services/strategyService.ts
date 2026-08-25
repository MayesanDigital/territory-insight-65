import { supabase } from "@/integrations/supabase/client";
import type { TerritorialUnit } from "@/types";

/**
 * Nombre de municipio comparable.
 *
 * El catálogo convive con dos grafías del mismo municipio —"JEREZ" y "Jerez"—
 * porque la importación de cartografía creó filas paralelas en vez de actualizar
 * las existentes. Sin normalizar, elegir una grafía dejaría fuera la mayoría de
 * las secciones sin avisar de nada.
 */
export const normalizaMunicipio = (m: string) => m.trim().toUpperCase();

/**
 * Análisis electoral estratégico por partido y municipio.
 *
 * Clasifica las secciones de un municipio según el historial del partido elegido:
 * dónde gana siempre, dónde perdió lo que antes tenía, dónde conquistó terreno y
 * dónde nunca ha ganado. Es el insumo para decidir a qué territorio dedicar
 * estructura y visitas.
 *
 * Los votos se leen de las fuerzas ya agrupadas, no de la columna suelta del
 * partido: donde hubo coalición, la cifra que importa es la del bloque que
 * llevaba la candidatura. La agrupación se detectó municipio por municipio en el
 * ETL, así que un partido que compitió solo aparece con su cifra propia.
 */

/** Catálogo de partidos presentes en los procesos cargados. */
export const PARTIDOS = [
  { siglas: "MORENA", nombre: "Morena" },
  { siglas: "PAN", nombre: "PAN" },
  { siglas: "PRI", nombre: "PRI" },
  { siglas: "PRD", nombre: "PRD" },
  { siglas: "PT", nombre: "PT" },
  { siglas: "PVEM", nombre: "PVEM" },
  { siglas: "MC", nombre: "Movimiento Ciudadano" },
  { siglas: "NA", nombre: "Nueva Alianza" },
  { siglas: "PES", nombre: "PES" },
] as const;

export type Clasificacion =
  | "siempre_gana"
  | "perdida"
  | "conquistada"
  | "siempre_pierde"
  | "sin_historial";

export const CLASIFICACION: Record<
  Clasificacion,
  { titulo: string; prioridad: "ALTA" | "MEDIA" | "BAJA" | "—"; accion: string; color: string }
> = {
  siempre_gana: {
    titulo: "Siempre gana",
    prioridad: "ALTA",
    accion: "Base sólida. Primera parada para formar comités y consolidar estructura.",
    color: "#2F6B4F",
  },
  perdida: {
    titulo: "Ganó antes — perdió en la última",
    prioridad: "ALTA",
    accion: "Recuperable: el voto ya estuvo ahí. Diagnóstico urgente por sección.",
    color: "#B3402F",
  },
  conquistada: {
    titulo: "Conquistada en la última",
    prioridad: "MEDIA",
    accion: "Terreno ganado reciente. Consolidar antes de que se revierta.",
    color: "#4A5D6B",
  },
  siempre_pierde: {
    titulo: "Nunca ha ganado",
    prioridad: "BAJA",
    accion: "Territorio adverso. Medir coste de disputa antes de invertir.",
    color: "#8A8A8A",
  },
  sin_historial: {
    titulo: "Sin historial completo",
    prioridad: "MEDIA",
    accion: "Sección nueva o sin dato en algún proceso. Diagnóstico de campo.",
    color: "#C9A227",
  },
};

export interface ResultadoProceso {
  etiqueta: string;
  año: number;
  votos: number;
  porcentaje: number;
  gano: boolean;
  ganador: string | null;
  totalVotos: number;
  listaNominal: number;
  participacion: number | null;
  /** Aliados con los que concurrió en esa sección, si hubo coalición. */
  coaligadoCon: string[];
}

export interface SeccionAnalizada {
  seccion: string;
  colonia: string;
  tipo: string | null;
  listaNominal: number;
  poblacion: number;
  clasificacion: Clasificacion;
  procesos: ResultadoProceso[];
  /** Diferencia en puntos entre el primer y el último proceso con dato. */
  tendencia: number | null;
  /** Fuerza que ganó en el proceso más reciente, si no fue el partido elegido. */
  rival: string | null;
  /** Margen contra el ganador en el último proceso. Negativo si se perdió. */
  margen: number | null;
  /** Lectura en una frase de lo que ocurre en esta sección. */
  observacion: string;
}

export interface AnalisisEstrategico {
  partido: string;
  municipio: string;
  procesos: { año: number; tipo: string; etiqueta: string }[];
  secciones: SeccionAnalizada[];
  totales: {
    secciones: number;
    listaNominal: number;
    votosEmitidos: number;
    votosPartido: number;
    porcentajePartido: number;
    participacion: number;
  };
  /** Cambio medio en puntos porcentuales entre el primer y el último proceso. */
  tendenciaMedia: number | null;
}

type FilaResultado = {
  section_code: string;
  election_year: number;
  election_type: string;
  election_label: string;
  lista_nominal: number;
  total_votos: number;
  participacion: number | null;
  ganador: string | null;
  resultados: unknown;
};

type Fuerza = { etiqueta: string; votos: number; porcentaje: number; partidos?: string[] };

/** Cuánto sacó el partido en esa sección, contando la coalición que lo llevaba. */
function fuerzaDelPartido(resultados: Fuerza[], siglas: string): Fuerza | null {
  return resultados.find((f) => (f.partidos ?? []).includes(siglas)) ?? null;
}

function clasifica(procesos: ResultadoProceso[], totalProcesos: number): Clasificacion {
  if (procesos.length < totalProcesos || procesos.length === 0) return "sin_historial";

  const ganados = procesos.filter((p) => p.gano).length;
  if (ganados === procesos.length) return "siempre_gana";
  if (ganados === 0) return "siempre_pierde";

  // Con historial mixto, lo que importa es cómo terminó: perder lo que se tenía
  // exige una respuesta distinta a ganar lo que no se tenía.
  const ultimo = procesos[procesos.length - 1];
  return ultimo.gano ? "conquistada" : "perdida";
}

/**
 * Traduce las cifras a una instrucción accionable.
 *
 * Un número suelto no dice qué hacer. Perder por dos puntos y perder por treinta
 * exigen decisiones opuestas, y una sección que gana mientras se desangra merece
 * más atención que una que gana estable.
 */
function observacionDe(
  clasificacion: Clasificacion,
  tendencia: number | null,
  margen: number | null,
  listaNominal: number,
): string {
  const caida = tendencia !== null && tendencia < 0 ? Math.abs(tendencia) : 0;
  const peso = listaNominal >= 2000 ? "Sección de alto padrón: " : "";

  switch (clasificacion) {
    case "perdida": {
      if (margen !== null && margen > -3) {
        return `${peso}Se perdió por apenas ${Math.abs(margen).toFixed(1)} puntos. Recuperable con estructura y movilización.`;
      }
      if (margen !== null && margen > -10) {
        return `${peso}Derrota ajustada de ${Math.abs(margen).toFixed(1)} puntos. Diagnóstico de causa y trabajo de campo.`;
      }
      return `${peso}Derrota amplia. Identificar qué cambió antes de invertir esfuerzo.`;
    }
    case "siempre_gana": {
      if (caida >= 8) {
        return `${peso}Gana, pero cae ${caida.toFixed(1)} puntos. Desgaste serio: atender antes de que se voltee.`;
      }
      if (caida > 0) {
        return `${peso}Se conserva con una caída de ${caida.toFixed(1)} puntos. Vigilar.`;
      }
      return `${peso}Bastión estable. Aprovechar para formar comités y replicar el método.`;
    }
    case "conquistada":
      return `${peso}Terreno ganado en la última elección. Consolidar ahora, que es cuando se pierde.`;
    case "siempre_pierde": {
      if (margen !== null && margen > -10) {
        return `${peso}Nunca se ha ganado, pero está a ${Math.abs(margen).toFixed(1)} puntos. Disputable.`;
      }
      return `${peso}Territorio adverso de forma sostenida. Baja prioridad de inversión.`;
    }
    default:
      return `${peso}Sin historial comparable. Requiere diagnóstico de campo para saber qué hay.`;
  }
}

export const strategyService = {
  /**
   * Analiza un municipio para un partido.
   *
   * `electionType` fija el eje de comparación. Por defecto el ayuntamiento: para
   * una campaña municipal, ganar la sección en la presidencial dice menos que
   * ganarla en la elección del propio cargo.
   */
  async analizar(
    partido: string,
    municipio: string,
    unidades: TerritorialUnit[],
    electionType = "ayuntamiento",
  ): Promise<AnalisisEstrategico> {
    const objetivo = normalizaMunicipio(municipio);

    // Se indexa por clave de sección, lo que además colapsa los duplicados que
    // dejó la importación de cartografía: la misma sección aparece dos veces,
    // una por cada grafía del municipio.
    const porSeccion = new Map<string, TerritorialUnit>();
    for (const u of unidades) {
      if (normalizaMunicipio(u.municipio) !== objetivo) continue;
      const previa = porSeccion.get(u.section_code);
      // Ante duplicados se conserva la fila con más datos censales.
      if (!previa || u.population > previa.population) porSeccion.set(u.section_code, u);
    }

    const claves = [...porSeccion.keys()];
    if (claves.length === 0) {
      return {
        partido,
        municipio,
        procesos: [],
        secciones: [],
        totales: {
          secciones: 0, listaNominal: 0, votosEmitidos: 0,
          votosPartido: 0, porcentajePartido: 0, participacion: 0,
        },
        tendenciaMedia: null,
      };
    }

    // Se pide por lotes de claves: una lista `in` con 1,800 elementos supera el
    // límite de longitud de la URL que acepta PostgREST.
    const LOTE = 250;
    const filas: FilaResultado[] = [];
    for (let i = 0; i < claves.length; i += LOTE) {
      const { data, error } = await supabase
        .from("section_election_results")
        .select(
          "section_code, election_year, election_type, election_label, lista_nominal, total_votos, participacion, ganador, resultados",
        )
        .eq("election_type", electionType)
        .in("section_code", claves.slice(i, i + LOTE));
      if (error) throw error;
      filas.push(...((data ?? []) as FilaResultado[]));
    }

    const procesosDisponibles = [
      ...new Map(
        filas.map((f) => [
          `${f.election_year}-${f.election_type}`,
          { año: f.election_year, tipo: f.election_type, etiqueta: f.election_label },
        ]),
      ).values(),
    ].sort((a, b) => a.año - b.año);

    const porClave = new Map<string, FilaResultado[]>();
    for (const f of filas) {
      const lista = porClave.get(f.section_code) ?? [];
      lista.push(f);
      porClave.set(f.section_code, lista);
    }

    const secciones: SeccionAnalizada[] = [];
    let listaNominal = 0;
    let votosEmitidos = 0;
    let votosPartido = 0;

    for (const [clave, unidad] of porSeccion) {
      const propias = (porClave.get(clave) ?? []).sort((a, b) => a.election_year - b.election_year);

      const procesos: ResultadoProceso[] = [];
      for (const fila of propias) {
        const fuerzas = (fila.resultados as Fuerza[]) ?? [];
        const mia = fuerzaDelPartido(fuerzas, partido);
        if (!mia) continue;

        procesos.push({
          etiqueta: fila.election_label,
          año: fila.election_year,
          votos: mia.votos,
          porcentaje: mia.porcentaje,
          gano: fuerzas[0]?.etiqueta === mia.etiqueta,
          ganador: fila.ganador,
          totalVotos: fila.total_votos,
          listaNominal: fila.lista_nominal,
          participacion: fila.participacion,
          coaligadoCon: (mia.partidos ?? []).filter((p) => p !== partido),
        });
      }

      const ultimo = procesos[procesos.length - 1];
      const primero = procesos[0];

      if (ultimo) {
        listaNominal += ultimo.listaNominal;
        votosEmitidos += ultimo.totalVotos;
        votosPartido += ultimo.votos;
      }

      const tendencia =
        procesos.length >= 2
          ? Math.round((ultimo.porcentaje - primero.porcentaje) * 10) / 10
          : null;
      const ganadorPct = fuerzaGanadora(propias);
      const margen =
        ultimo && ganadorPct !== null
          ? Math.round((ultimo.porcentaje - ganadorPct) * 10) / 10
          : null;
      const clasificacion = clasifica(procesos, procesosDisponibles.length);

      secciones.push({
        seccion: clave,
        colonia: unidad.localidad || unidad.municipio,
        tipo: unidad.section_type,
        listaNominal: ultimo?.listaNominal ?? 0,
        poblacion: unidad.population,
        clasificacion,
        procesos,
        tendencia,
        rival: ultimo && !ultimo.gano ? ultimo.ganador : null,
        margen,
        observacion: observacionDe(clasificacion, tendencia, margen, ultimo?.listaNominal ?? 0),
      });
    }

    // Orden de trabajo: primero lo que más lista nominal moviliza dentro de cada
    // grupo, que es donde un mismo esfuerzo rinde más votos.
    secciones.sort((a, b) => b.listaNominal - a.listaNominal);

    const conTendencia = secciones.filter((s) => s.tendencia !== null);

    return {
      partido,
      municipio,
      procesos: procesosDisponibles,
      secciones,
      totales: {
        secciones: secciones.length,
        listaNominal,
        votosEmitidos,
        votosPartido,
        porcentajePartido: votosEmitidos ? Math.round((votosPartido / votosEmitidos) * 1000) / 10 : 0,
        participacion: listaNominal ? Math.round((votosEmitidos / listaNominal) * 1000) / 10 : 0,
      },
      tendenciaMedia: conTendencia.length
        ? Math.round(
            (conTendencia.reduce((a, s) => a + (s.tendencia ?? 0), 0) / conTendencia.length) * 10,
          ) / 10
        : null,
    };
  },
};

/** Porcentaje de la fuerza ganadora en el proceso más reciente de la sección. */
function fuerzaGanadora(filas: FilaResultado[]): number | null {
  const ultima = filas[filas.length - 1];
  if (!ultima) return null;
  const fuerzas = (ultima.resultados as Fuerza[]) ?? [];
  return fuerzas[0]?.porcentaje ?? null;
}
