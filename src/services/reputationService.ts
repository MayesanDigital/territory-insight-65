import type { MentionAnalytics } from "@/services/monitoringService";
import type { WebMention } from "@/types";

/**
 * Plan de contención y manejo de crisis a partir del monitoreo.
 *
 * Todo lo que devuelve se calcula sobre las menciones realmente encontradas: el
 * reparto de sentimiento, los medios que publican, los términos que dominan la
 * conversación y la tendencia de los últimos días. No hay plantillas genéricas
 * sueltas: cada recomendación cita la cifra que la justifica, para que quien la
 * lea pueda discutirla con el dato delante.
 *
 * La generación es determinista y local. Un modelo de lenguaje daría prosa más
 * variada, pero también inventaría cifras, y en comunicación de crisis un número
 * equivocado cuesta más que una redacción sobria.
 */

export type NivelRiesgo = "critico" | "alerta" | "vigilancia" | "favorable";

export interface BloqueContenido {
  hora: string;
  canal: string;
  formato: string;
  objetivo: string;
  /** Texto propuesto, con huecos entre corchetes para lo que debe verificarse. */
  copy: string;
  nota?: string;
}

export interface DiaParrilla {
  titulo: string;
  foco: string;
  bloques: BloqueContenido[];
}

export interface Recomendacion {
  titulo: string;
  detalle: string;
  plazo: string;
}

export interface PlanReputacion {
  sujeto: string;
  nivel: NivelRiesgo;
  encabezado: string;
  diagnostico: string[];
  mensajesClave: string[];
  recomendaciones: Recomendacion[];
  parrilla: DiaParrilla[];
  noHacer: string[];
  fuentesPrioritarias: Array<{ dominio: string; menciones: number; nota: string }>;
  generadoEl: string;
}

export const NIVEL: Record<NivelRiesgo, { etiqueta: string; color: string; resumen: string }> = {
  critico: {
    etiqueta: "Crítico",
    color: "#B3402F",
    resumen: "La conversación es mayoritariamente adversa. Requiere respuesta hoy.",
  },
  alerta: {
    etiqueta: "Alerta",
    color: "#C9A227",
    resumen: "Hay un núcleo negativo con capacidad de crecer. Contener esta semana.",
  },
  vigilancia: {
    etiqueta: "Vigilancia",
    color: "#4A5D6B",
    resumen: "Predomina lo neutral. Espacio para ocupar la conversación con agenda propia.",
  },
  favorable: {
    etiqueta: "Favorable",
    color: "#2F6B4F",
    resumen: "El saldo es positivo. Consolidar y documentar lo que está funcionando.",
  },
};

const pct = (parte: number, total: number) => (total > 0 ? Math.round((parte / total) * 100) : 0);

function nivelDe(negPct: number, neuPct: number, tendencia: number): NivelRiesgo {
  if (negPct >= 40 || (negPct >= 25 && tendencia > 20)) return "critico";
  if (negPct >= 20 || (negPct >= 10 && tendencia > 30)) return "alerta";
  if (neuPct >= 60) return "vigilancia";
  return "favorable";
}

/** Menciones negativas ordenadas por alcance: son las que hay que atender primero. */
function negativasRelevantes(mentions: WebMention[]) {
  return mentions
    .filter((m) => m.sentiment === "negative")
    .sort((a, b) => (b.reach ?? 0) - (a.reach ?? 0))
    .slice(0, 5);
}

export function generarPlan(
  analytics: MentionAnalytics,
  mentions: WebMention[],
  sujeto: string,
  tipoSujeto: "person" | "topic" | string,
): PlanReputacion {
  const total = analytics.sentiment.positive + analytics.sentiment.neutral + analytics.sentiment.negative;
  const negPct = pct(analytics.sentiment.negative, total);
  const neuPct = pct(analytics.sentiment.neutral, total);
  const posPct = pct(analytics.sentiment.positive, total);
  const nivel = nivelDe(negPct, neuPct, analytics.trend);

  const esPersona = tipoSujeto === "person";
  const terminos = analytics.words.slice(0, 6).map((w) => w.word);
  const temas = analytics.topics.slice(0, 4).map((t) => t.topic);
  const negativas = negativasRelevantes(mentions);

  const dominiosNegativos = [
    ...new Set(negativas.map((m) => m.source_domain).filter(Boolean)),
  ] as string[];

  const narrativa = temas.length
    ? temas.join(", ")
    : terminos.length
      ? terminos.slice(0, 3).join(", ")
      : "sin un tema dominante identificado";

  // --- Diagnóstico -----------------------------------------------------------

  const diagnostico: string[] = [
    `Se analizaron ${total} menciones sobre ${sujeto}, con un alcance estimado de ` +
      `${analytics.reach.toLocaleString("es-MX")} impresiones. El reparto es ${posPct}% positivo, ` +
      `${neuPct}% neutral y ${negPct}% negativo.`,
  ];

  if (analytics.trend > 10) {
    diagnostico.push(
      `El volumen creció ${Math.round(analytics.trend)}% respecto al periodo anterior. Una ` +
        `conversación que se acelera deja menos margen: lo que hoy se corrige con una ` +
        `aclaración, en tres días exige una rueda de prensa.`,
    );
  } else if (analytics.trend < -10) {
    diagnostico.push(
      `El volumen cayó ${Math.abs(Math.round(analytics.trend))}% respecto al periodo anterior. ` +
        `El tema pierde fuerza por sí solo, así que conviene no reavivarlo con respuestas ` +
        `desproporcionadas.`,
    );
  } else {
    diagnostico.push(
      `El volumen se mantiene estable respecto al periodo anterior. No hay pico que apagar, ` +
        `pero tampoco disminuye solo.`,
    );
  }

  diagnostico.push(
    `La conversación gira alrededor de ${narrativa}. ` +
      (analytics.sources.length
        ? `Los medios que más publican son ${analytics.sources
            .slice(0, 3)
            .map((s) => `${s.domain} (${s.total})`)
            .join(", ")}.`
        : "No se identificó una fuente dominante."),
  );

  if (dominiosNegativos.length) {
    diagnostico.push(
      `La carga negativa se concentra en ${dominiosNegativos.slice(0, 3).join(", ")}. ` +
        `Atender primero ahí rinde más que responder a todo por igual: una réplica bien ` +
        `colocada en el medio que originó el tema corta la cadena de réplicas.`,
    );
  }

  // --- Mensajes clave --------------------------------------------------------

  const mensajesClave: string[] = [
    `Reconocer antes que justificar. Si hay un hecho verificable detrás de las críticas sobre ` +
      `${terminos[0] ?? "el tema"}, admitirlo en la primera intervención evita que la segunda ` +
      `sea sobre el encubrimiento.`,
    `Un solo vocero. Todas las declaraciones sobre ${narrativa} deben salir de la misma ` +
      `persona y con la misma redacción; las versiones distintas se convierten en la noticia.`,
    `Hechos con fecha y cifra. Sustituir adjetivos por datos comprobables: fechas, montos, ` +
      `documentos consultables. Lo que no se pueda documentar, no se afirma.`,
  ];

  if (esPersona) {
    mensajesClave.push(
      `Separar a la persona del cargo. Responder sobre la actuación pública y no sobre la vida ` +
        `privada mantiene la discusión en un terreno donde se puede aportar prueba.`,
    );
  }

  // --- Recomendaciones -------------------------------------------------------

  const recomendaciones: Recomendacion[] = [];

  if (nivel === "critico" || nivel === "alerta") {
    recomendaciones.push({
      titulo: "Verificar los hechos antes de emitir nada",
      detalle:
        `Reunir en un solo documento qué se afirma, quién lo afirma y qué prueba existe a favor ` +
        `y en contra. Con ${analytics.sentiment.negative} menciones negativas sobre la mesa, ` +
        `salir a desmentir algo que luego resulte cierto multiplica el daño en lugar de contenerlo.`,
      plazo: "Primeras 3 horas",
    });
    recomendaciones.push({
      titulo: "Responder en el medio de origen, no en todos",
      detalle:
        dominiosNegativos.length
          ? `Contactar a ${dominiosNegativos[0]} para ofrecer versión y datos. Es donde nació la ` +
            `carga negativa; replicar en medios que no publicaron el tema solo lo lleva a públicos ` +
            `que aún no lo conocían.`
          : `Identificar el medio que originó la crítica y ofrecerle la versión propia antes de ` +
            `abrir una respuesta pública general.`,
      plazo: "Primeras 12 horas",
    });
  }

  if (neuPct >= 40) {
    recomendaciones.push({
      titulo: "Convertir el terreno neutral en positivo",
      detalle:
        `El ${neuPct}% de las menciones son neutrales: coberturas informativas sin valoración. ` +
        `Ese espacio se gana aportando material que los medios puedan usar —datos, avances, ` +
        `testimonios verificables—, porque una nota neutral se vuelve favorable cuando quien la ` +
        `escribe tiene con qué ilustrarla.`,
      plazo: "Esta semana",
    });
  }

  recomendaciones.push({
    titulo: "Ocupar la agenda con tema propio",
    detalle:
      `Mientras la conversación la fije ${narrativa}, cada intervención se lee como reacción. ` +
      `Programar dos anuncios con hecho comprobable —una entrega, un acuerdo, una cifra de ` +
      `avance— desplaza el foco sin necesidad de negar nada.`,
    plazo: "72 horas",
  });

  if (analytics.sources.length > 1) {
    recomendaciones.push({
      titulo: "Ampliar la base de medios",
      detalle:
        `La cobertura se concentra en ${analytics.sources[0].domain} con ` +
        `${analytics.sources[0].total} de ${total} menciones. Depender de una sola fuente deja ` +
        `la narrativa en manos ajenas: conviene abrir relación con medios locales que hoy no ` +
        `están publicando.`,
      plazo: "Dos semanas",
    });
  }

  recomendaciones.push({
    titulo: "Medir antes y después",
    detalle:
      `Repetir esta búsqueda a las 48 y 96 horas con los mismos términos. Si el porcentaje ` +
      `negativo no baja de ${negPct}% tras la primera respuesta, el problema no es de mensaje ` +
      `sino de hecho: hay algo que corregir en la actuación, no en la comunicación.`,
    plazo: "48 y 96 horas",
  });

  // --- Parrilla de dos días --------------------------------------------------

  const urgente = nivel === "critico" || nivel === "alerta";
  const tema1 = terminos[0] ?? "el tema en cuestión";
  const tema2 = terminos[1] ?? tema1;

  const parrilla: DiaParrilla[] = [
    {
      titulo: "Día 1 — Contención",
      foco: urgente
        ? "Cortar la propagación con una versión propia, verificable y única."
        : "Ocupar la conversación antes de que otro la defina.",
      bloques: [
        {
          hora: "08:00",
          canal: "Interno",
          formato: "Documento de posición",
          objetivo: "Fijar una sola versión antes de hablar en público",
          copy:
            `Documento de una página con: (1) qué se está diciendo sobre ${tema1}; (2) qué es ` +
            `cierto y qué no, con la prueba de cada punto; (3) la frase exacta que dirá el vocero; ` +
            `(4) las tres preguntas más incómodas y su respuesta. Circular solo al equipo.`,
          nota: "Nadie habla en público hasta que este documento esté cerrado.",
        },
        {
          hora: "11:00",
          canal: urgente ? "Comunicado" : "Redes sociales",
          formato: urgente ? "Posicionamiento oficial" : "Publicación con dato",
          objetivo: urgente ? "Responder de frente y sin rodeos" : "Instalar agenda propia",
          copy: urgente
            ? `«Sobre lo publicado en torno a ${tema1}: [reconocer el hecho verificable]. ` +
              `Lo ocurrido fue [descripción con fecha y lugar]. Ya se tomó la siguiente medida: ` +
              `[acción concreta con responsable y plazo]. Quien quiera revisar la documentación ` +
              `puede solicitarla en [canal].» Máximo 120 palabras. Sin adjetivos sobre quien ` +
              `publicó la crítica.`
            : `Publicación con un hecho comprobable de la semana: cifra, fecha y lugar. ` +
              `Formato: imagen con el dato + tres líneas de contexto. Evitar autoelogio; ` +
              `el dato se defiende solo.`,
        },
        {
          hora: "14:00",
          canal: dominiosNegativos[0] ?? "Medios locales",
          formato: "Contacto directo",
          objetivo: "Llevar la versión propia a donde nació el tema",
          copy:
            `Llamada, no correo, a la redacción de ${dominiosNegativos[0] ?? "el medio que abrió el tema"}. ` +
            `Ofrecer entrevista y entregar el documento de posición. Pedir derecho de réplica solo ` +
            `si hay un dato factualmente incorrecto que se pueda demostrar; usarlo por molestia ` +
            `desgasta el recurso para cuando haga falta.`,
          nota: "Registrar quién atendió y qué se comprometió.",
        },
        {
          hora: "18:00",
          canal: "Territorio",
          formato: "Mensaje a estructura",
          objetivo: "Que la red conozca la versión antes que el rumor",
          copy:
            `Audio de 60 segundos a coordinadores de sección con la misma versión del comunicado, ` +
            `en lenguaje llano. Instrucción explícita: no discutir en grupos públicos, sí escuchar ` +
            `y reportar qué se está diciendo en cada colonia.`,
          nota: "Lo que la estructura no sabe, lo llena el rumor.",
        },
      ],
    },
    {
      titulo: "Día 2 — Recuperación",
      foco:
        "Demostrar con hechos lo que el día anterior se dijo con palabras, y medir si funcionó.",
      bloques: [
        {
          hora: "09:00",
          canal: "Interno",
          formato: "Medición",
          objetivo: "Saber si la contención sirvió",
          copy:
            `Repetir la búsqueda de monitoreo con los mismos términos. Comparar contra el ` +
            `${negPct}% negativo de partida. Si subió, el mensaje no está funcionando y hay que ` +
            `revisar el hecho de fondo, no la redacción.`,
        },
        {
          hora: "11:00",
          canal: "Territorio",
          formato: "Acto con evidencia",
          objetivo: "Sustituir la palabra por el hecho",
          copy:
            `Actividad pública en una sección prioritaria con resultado tangible y verificable: ` +
            `entrega, arranque de obra, reunión con comité. Documentar con foto, fecha y nombres. ` +
            `Un hecho comprobable pesa más que tres comunicados.`,
          nota: "Elegir sección con padrón alto y presencia de medios locales.",
        },
        {
          hora: "15:00",
          canal: "Redes sociales",
          formato: "Video corto",
          objetivo: "Explicar en primera persona",
          copy:
            `Video de 45 a 60 segundos, cámara fija, sin música ni edición vistosa: ` +
            `«Les debo una explicación sobre ${tema1}. Esto es lo que pasó: [hechos]. ` +
            `Esto es lo que hicimos: [medida]. Esto es lo que sigue: [compromiso con fecha].» ` +
            `La sobriedad comunica seriedad; la producción elaborada, campaña.`,
        },
        {
          hora: "19:00",
          canal: "Medios",
          formato: "Agenda propia",
          objetivo: "Devolver la conversación al terreno de la gestión",
          copy:
            `Enviar a la lista de medios un tema distinto y con dato duro relacionado con ` +
            `${tema2}. Cerrar el ciclo de crisis significa dejar de hablar de ella: si al tercer ` +
            `día la única noticia sigue siendo la respuesta, la crisis se alimenta sola.`,
        },
      ],
    },
  ];

  // --- Qué no hacer ----------------------------------------------------------

  const noHacer = [
    "No responder con cuentas falsas ni comprar interacciones: se detecta, y convierte un problema de imagen en uno de credibilidad.",
    "No atacar a quien publicó la crítica. Convierte al periodista en parte del conflicto y garantiza una segunda nota.",
    "No borrar publicaciones ni comentarios salvo que incumplan la ley. La captura de pantalla sobrevive al borrado y añade la sospecha de encubrimiento.",
    "No prometer lo que no se pueda cumplir con fecha. Un compromiso incumplido reabre la crisis con más fuerza.",
    "No difundir datos personales de terceros para desacreditar. Además del daño reputacional, expone a responsabilidad legal.",
    "No saturar con publicaciones defensivas. Más de dos intervenciones diarias sobre el mismo tema lo mantienen vivo en el algoritmo.",
  ];

  // --- Fuentes prioritarias --------------------------------------------------

  const fuentesPrioritarias = analytics.sources.slice(0, 5).map((s) => {
    const esNegativa = dominiosNegativos.includes(s.domain);
    return {
      dominio: s.domain,
      menciones: s.total,
      nota: esNegativa
        ? "Origen de carga negativa. Contacto directo prioritario."
        : "Cobertura sin carga adversa. Canal útil para instalar agenda propia.",
    };
  });

  const encabezado = urgente
    ? `${negPct}% de menciones negativas sobre ${sujeto}. ${NIVEL[nivel].resumen}`
    : `${posPct}% positivo y ${neuPct}% neutral sobre ${sujeto}. ${NIVEL[nivel].resumen}`;

  return {
    sujeto,
    nivel,
    encabezado,
    diagnostico,
    mensajesClave,
    recomendaciones,
    parrilla,
    noHacer,
    fuentesPrioritarias,
    generadoEl: new Date().toISOString(),
  };
}
