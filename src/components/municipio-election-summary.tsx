import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { colorPartido } from "@/services/strategyService";
import type { ResultadoMunicipio } from "@/services/electionsService";

/**
 * Resultado del municipio elegido en el mapa.
 *
 * El mapa ya decía quién ganó cada sección, pero no quién ganó el municipio, y
 * son preguntas distintas: una fuerza puede llevarse más secciones y perder la
 * presidencia, porque las secciones no pesan igual. Aquí se responde en el
 * orden en que se pregunta —quién ganó, con cuánto, quién quedó segundo y por
 * cuánto— y luego el resto de las fuerzas.
 *
 * Los porcentajes van sobre el total del acta, que cierra exacto sumando las
 * fuerzas, los nulos y las candidaturas no registradas. Por eso los dos últimos
 * se muestran: sin ellos la suma no llegaría a 100 % y parecería un dato
 * incompleto cuando está completo.
 */

const fmt = (n: number) => n.toLocaleString("es-MX");

export function MunicipioElectionSummary({
  municipio,
  resultado,
  cargando,
  error,
}: {
  municipio: string;
  resultado: ResultadoMunicipio | null;
  cargando: boolean;
  error?: unknown;
}) {
  if (cargando) return <Skeleton className="h-28 w-full" />;

  if (error) {
    return (
      <p className="text-sm text-muted-foreground">
        No se pudo cargar el resultado de {municipio}.
      </p>
    );
  }

  if (!resultado || resultado.fuerzas.length === 0) {
    return <p className="text-sm text-muted-foreground">Sin cómputos cargados para {municipio}.</p>;
  }

  const { fuerzas, totalVotos } = resultado;
  const pct = (v: number) => (totalVotos > 0 ? Math.round((v / totalVotos) * 1000) / 10 : 0);

  const ganador = fuerzas[0]!;
  const segundo = fuerzas[1] ?? null;
  const margenPuntos = segundo
    ? Math.round((pct(ganador.votos) - pct(segundo.votos)) * 10) / 10
    : null;
  const margenVotos = segundo ? ganador.votos - segundo.votos : null;

  // Quién se llevó más secciones. Se dice solo cuando NO es el ganador: ahí es
  // donde el dato explica algo que los votos por sí solos no cuentan.
  const masSecciones = [...fuerzas].sort((a, b) => b.seccionesGanadas - a.seccionesGanadas)[0]!;
  const ganoSinMasSecciones =
    masSecciones.etiqueta !== ganador.etiqueta &&
    masSecciones.seccionesGanadas > ganador.seccionesGanadas;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="font-display text-lg font-semibold">{resultado.municipio}</h3>
        <span className="text-xs text-muted-foreground">{resultado.eleccion}</span>
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          <Badge variant="secondary">{fmt(resultado.secciones)} secciones</Badge>
          {resultado.participacion !== null && (
            <Badge variant="outline">{resultado.participacion}% de participación</Badge>
          )}
        </div>
      </div>

      {/* --- Quién ganó y por cuánto. --- */}
      <div className="grid gap-2 sm:grid-cols-2">
        <Puesto
          lugar="Ganó el municipio"
          fuerza={ganador}
          porcentaje={pct(ganador.votos)}
          secciones={resultado.secciones}
          destacado
        />
        {segundo ? (
          <Puesto
            lugar="Segundo lugar"
            fuerza={segundo}
            porcentaje={pct(segundo.votos)}
            secciones={resultado.secciones}
          />
        ) : (
          <div className="rounded-md border border-border/60 px-3 py-2 text-sm text-muted-foreground">
            Sin una segunda fuerza en el cómputo.
          </div>
        )}
      </div>

      {margenPuntos !== null && margenVotos !== null && (
        <p className="text-sm">
          <span className="font-medium">
            Ganó por {margenPuntos} {margenPuntos === 1 ? "punto" : "puntos"}
          </span>{" "}
          <span className="text-muted-foreground">
            ({fmt(margenVotos)} {margenVotos === 1 ? "voto" : "votos"} de diferencia sobre{" "}
            <span translate="no">{segundo!.etiqueta}</span>)
          </span>
        </p>
      )}

      {ganoSinMasSecciones && (
        <p className="rounded-md bg-muted px-2.5 py-2 text-xs leading-snug">
          <span translate="no">{ganador.etiqueta}</span> ganó el municipio en votos, pero{" "}
          <span translate="no">{masSecciones.etiqueta}</span> se llevó más secciones (
          {masSecciones.seccionesGanadas} contra {ganador.seccionesGanadas}). Las secciones no pesan
          igual: se puede ganar más territorio y perder la elección.
        </p>
      )}

      {/* --- Todas las fuerzas, con lo que cierra el acta. --- */}
      <div>
        <p className="mb-1.5 text-xs uppercase tracking-widest text-muted-foreground">
          Todas las fuerzas
        </p>
        <div className="divide-y divide-border/60 rounded-md border border-border/60">
          {fuerzas.map((f, i) => (
            <Fila
              key={f.etiqueta}
              lugar={i + 1}
              etiqueta={f.etiqueta}
              siglas={f.partidos[0] ?? ""}
              votos={f.votos}
              porcentaje={pct(f.votos)}
              secciones={f.seccionesGanadas}
            />
          ))}
          <Fila
            etiqueta="Votos nulos"
            votos={resultado.votosNulos}
            porcentaje={pct(resultado.votosNulos)}
            apagada
          />
          {resultado.noRegistrados > 0 && (
            <Fila
              etiqueta="Candidaturas no registradas"
              votos={resultado.noRegistrados}
              porcentaje={pct(resultado.noRegistrados)}
              apagada
            />
          )}
          <div className="flex items-center gap-2 px-2.5 py-2 text-sm font-medium">
            <span className="flex-1">Total de votos emitidos</span>
            <span className="tabular-nums">{fmt(resultado.totalVotos)}</span>
            <span className="w-16 text-right tabular-nums">100%</span>
          </div>
        </div>
        <p className="mt-1.5 text-[10px] leading-snug text-muted-foreground">
          Los votos son los del bloque que llevaba cada candidatura: donde hubo coalición, la cifra
          es de la alianza completa, y las columnas propias de cada partido se ven al abrir una
          sección. La columna de la derecha son las secciones que ganó cada fuerza, de{" "}
          {fmt(resultado.secciones)}. Lista nominal del municipio: {fmt(resultado.listaNominal)}.
        </p>
      </div>
    </div>
  );
}

function Puesto({
  lugar,
  fuerza,
  porcentaje,
  secciones,
  destacado = false,
}: {
  lugar: string;
  fuerza: { etiqueta: string; votos: number; seccionesGanadas: number; partidos: string[] };
  porcentaje: number;
  secciones: number;
  destacado?: boolean;
}) {
  return (
    <div
      className={`rounded-md border px-3 py-2 ${
        destacado ? "border-foreground/25 bg-muted/40" : "border-border/60"
      }`}
    >
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{lugar}</p>
      <p className="flex items-center gap-2 text-sm font-medium">
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: colorPartido(fuerza.partidos[0] ?? "") }}
        />
        <span className="min-w-0 break-words leading-tight" translate="no">
          {fuerza.etiqueta}
        </span>
      </p>
      <p className="font-display text-xl font-semibold tabular-nums">
        {fmt(fuerza.votos)}
        <span className="ml-1.5 text-xs font-normal text-muted-foreground">
          {porcentaje}% de lo emitido
        </span>
      </p>
      <p className="text-[10px] text-muted-foreground">
        Ganó {fuerza.seccionesGanadas} de {fmt(secciones)} secciones
      </p>
    </div>
  );
}

function Fila({
  lugar,
  etiqueta,
  siglas,
  votos,
  porcentaje,
  secciones,
  apagada = false,
}: {
  lugar?: number;
  etiqueta: string;
  siglas?: string;
  votos: number;
  porcentaje: number;
  secciones?: number;
  apagada?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 px-2.5 py-1.5 text-sm">
      {lugar !== undefined ? (
        <span className="w-3 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground sm:w-4">
          {lugar}
        </span>
      ) : (
        <span className="w-3 shrink-0 sm:w-4" />
      )}
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: apagada ? "#B9AFA0" : colorPartido(siglas ?? "") }}
      />
      <span className="min-w-0 flex-1">
        <span
          className={`block break-words leading-tight ${apagada ? "text-muted-foreground" : ""}`}
          translate="no"
        >
          {etiqueta}
        </span>
        {/* En móvil no cabe una columna más, así que las secciones van aquí. */}
        {secciones !== undefined && (
          <span className="block text-[10px] text-muted-foreground sm:hidden">
            {secciones} {secciones === 1 ? "sección ganada" : "secciones ganadas"}
          </span>
        )}
      </span>
      {secciones !== undefined && (
        <span className="hidden w-20 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground sm:block">
          {secciones} {secciones === 1 ? "sección" : "secciones"}
        </span>
      )}
      <span className="w-14 shrink-0 text-right tabular-nums sm:w-16">{fmt(votos)}</span>
      <span className="w-11 shrink-0 text-right tabular-nums text-muted-foreground sm:w-14">
        {porcentaje}%
      </span>
    </div>
  );
}
