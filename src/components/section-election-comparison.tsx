import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";
import { electionsService, type ResultadoSeccion } from "@/services/electionsService";

/**
 * Color por partido. Se asigna por siglas y no por bloque porque las alianzas
 * cambian de un municipio a otro: el PRD puede ir con el PAN en un ayuntamiento
 * y competirle en el de al lado, y el color debe seguir al partido.
 */
const COLOR_PARTIDO: Record<string, string> = {
  MORENA: "#7A2E2E",
  PAN: "#4A5D6B",
  PRI: "#2F6B4F",
  PRD: "#C9A227",
  PT: "#B3402F",
  PVEM: "#5C8A4A",
  MC: "#C97B2A",
  NA: "#6B7BA8",
  PES: "#7A5C9E",
  ES: "#7A5C9E",
  RSP: "#8C6D8C",
  FXM: "#B07A5A",
  FMZ: "#B07A5A",
  MAZ: "#7C8B6B",
  RPZ: "#9A7B4F",
};

const COLOR_NEUTRO = "#9A9A9A";

/**
 * Orden de lectura: primero lo más reciente y, dentro de un mismo año, el
 * ayuntamiento antes que el resto. La presidencia municipal es la elección que
 * más dice del territorio inmediato.
 */
const PESO_TIPO: Record<string, number> = {
  ayuntamiento: 0,
  gubernatura: 1,
  presidencial: 2,
  diputacion: 3,
};

const fmt = (n: number) => n.toLocaleString("es-MX");

function colorDe(siglas: string | undefined) {
  return (siglas && COLOR_PARTIDO[siglas.toUpperCase()]) || COLOR_NEUTRO;
}

export function SectionElectionComparison({ sectionCode }: { sectionCode: string }) {
  const q = useQuery({
    queryKey: ["elecciones", sectionCode],
    queryFn: () => electionsService.bySection(sectionCode),
    enabled: Boolean(sectionCode),
  });

  if (q.isLoading) return <Skeleton className="h-40 w-full" />;
  if (q.isError) return null;

  const procesos = [...(q.data ?? [])].sort(
    (a, b) => b.año - a.año || (PESO_TIPO[a.tipo] ?? 9) - (PESO_TIPO[b.tipo] ?? 9),
  );

  return (
    <div className="pt-3">
      <p className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">
        Resultados por elección
      </p>

      {procesos.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Sin resultados para esta sección. Suele ocurrir en secciones creadas por el
          reseccionamiento posterior a los procesos cargados.
        </p>
      ) : (
        <>
          <div className="divide-y divide-border/60 rounded-md border border-border/60">
            {procesos.map((p) => (
              <FilaEleccion key={`${p.año}-${p.tipo}`} proceso={p} />
            ))}
          </div>
          <p className="mt-2 text-[10px] leading-snug text-muted-foreground">
            Fuerza más votada en esta sección, no quien ganó el municipio. Las coaliciones
            se detectan municipio por municipio: donde los partidos compitieron por
            separado, cada uno aparece con su propia cifra.
          </p>
        </>
      )}
    </div>
  );
}

function FilaEleccion({ proceso }: { proceso: ResultadoSeccion }) {
  // Las elecciones más recientes se abren solas; el histórico queda plegado para
  // que la ficha de la sección no obligue a desplazarse durante media pantalla.
  const [abierto, setAbierto] = useState(proceso.año >= 2024);

  const ganador = proceso.bloques[0];
  if (!ganador) {
    return (
      <div className="flex items-center justify-between px-2.5 py-2 text-xs">
        <span className="text-muted-foreground">{proceso.etiqueta}</span>
        <span className="text-muted-foreground">Sin votos</span>
      </div>
    );
  }

  // Margen sobre el segundo lugar: distingue una sección disputada de una segura.
  const segundo = proceso.bloques[1];
  const margen = segundo ? ganador.porcentaje - segundo.porcentaje : ganador.porcentaje;
  const esCoalicion = (ganador.partidos?.length ?? 0) > 1;

  const votosCoalicion = proceso.coaliciones.reduce((a, c) => a + c.votos, 0);

  return (
    <div className="px-2.5 py-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs text-muted-foreground">{proceso.etiqueta}</span>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {proceso.participacion !== null ? `${proceso.participacion}% part.` : "—"}
        </span>
      </div>

      <div className="mt-1 flex items-center gap-2">
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: colorDe(ganador.partidos?.[0] ?? ganador.etiqueta) }}
        />
        <span className="flex-1 truncate text-sm font-medium">{ganador.etiqueta}</span>
        <span className="text-sm tabular-nums">{fmt(ganador.votos)}</span>
        <span className="w-14 text-right text-sm tabular-nums">{ganador.porcentaje}%</span>
      </div>
      <p className="mt-0.5 pl-[18px] text-[10px] text-muted-foreground">
        {esCoalicion ? "coalición · " : ""}
        {segundo ? `${margen.toFixed(1)} pts sobre ${segundo.etiqueta}` : "sin rival"}
      </p>

      {/* Resumen de participación de la sección en ese proceso. */}
      <div className="mt-2 grid grid-cols-3 gap-1.5 rounded-md bg-background px-2 py-1.5 text-center">
        <Dato etiqueta="Votos" valor={fmt(proceso.totalVotos)} />
        <Dato etiqueta="Lista nominal" valor={fmt(proceso.listaNominal)} />
        <Dato
          etiqueta="Participación"
          valor={proceso.participacion !== null ? `${proceso.participacion}%` : "—"}
        />
      </div>

      {proceso.partidos.length > 0 && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setAbierto((v) => !v)}
            className="flex w-full items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
          >
            {abierto ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            Votos por partido ({proceso.partidos.length})
          </button>

          {abierto && (
            <div className="mt-1.5 space-y-0.5 rounded-md bg-muted/40 px-2 py-1.5">
              {proceso.partidos.map((p) => (
                <div key={p.siglas} className="flex items-center gap-2 text-xs">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: colorDe(p.siglas) }}
                  />
                  <span className="flex-1 truncate text-muted-foreground">{p.nombre}</span>
                  <span className="tabular-nums">{fmt(p.votos)}</span>
                  <span className="w-12 text-right tabular-nums text-muted-foreground">
                    {p.porcentaje}%
                  </span>
                </div>
              ))}

              {proceso.coaliciones.length > 0 && (
                <div className="mt-1 border-t border-border/60 pt-1">
                  <p className="mb-0.5 text-[10px] text-muted-foreground">
                    Voto conjunto de coalición
                  </p>
                  {proceso.coaliciones.map((c) => (
                    <div key={c.siglas} className="flex items-center gap-2 text-xs">
                      <span className="h-2 w-2 shrink-0 rounded-full bg-muted-foreground/40" />
                      <span className="flex-1 truncate text-muted-foreground">{c.siglas}</span>
                      <span className="tabular-nums">{fmt(c.votos)}</span>
                      <span className="w-12 text-right tabular-nums text-muted-foreground">
                        {c.porcentaje}%
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-1 flex items-center gap-2 border-t border-border/60 pt-1 text-xs">
                <span className="h-2 w-2 shrink-0 rounded-full bg-muted-foreground/25" />
                <span className="flex-1 text-muted-foreground">Nulos</span>
                <span className="tabular-nums">{fmt(proceso.votosNulos)}</span>
                <span className="w-12 text-right tabular-nums text-muted-foreground">
                  {proceso.totalVotos
                    ? Math.round((proceso.votosNulos / proceso.totalVotos) * 1000) / 10
                    : 0}
                  %
                </span>
              </div>

              {votosCoalicion > 0 && (
                <p className="pt-1 text-[10px] leading-snug text-muted-foreground">
                  El voto conjunto no pertenece a ningún partido en solitario: se emite
                  marcando varios aliados a la vez en la misma boleta.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{etiqueta}</p>
      <p className="text-xs font-medium tabular-nums">{valor}</p>
    </div>
  );
}
