import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Target, TrendingDown, TrendingUp } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState } from "@/components/query-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { territoryService } from "@/services/territoryService";
import {
  CLASIFICACION,
  normalizaMunicipio,
  PARTIDOS,
  strategyService,
  type Clasificacion,
  type SeccionAnalizada,
} from "@/services/strategyService";

export const Route = createFileRoute("/_authenticated/analisis-estrategico")({
  head: () => ({
    meta: [
      { title: "Análisis estratégico | Territorio Intelligence" },
      {
        name: "description",
        content:
          "Clasificación de secciones por historial electoral: base sólida, recuperables, conquistadas y adversas.",
      },
    ],
  }),
  component: AnalisisPage,
});

/** Orden de atención: lo urgente arriba. */
const ORDEN: Clasificacion[] = [
  "siempre_gana",
  "perdida",
  "conquistada",
  "sin_historial",
  "siempre_pierde",
];

const fmt = (n: number) => n.toLocaleString("es-MX");

function AnalisisPage() {
  const [partido, setPartido] = useState("MORENA");
  const [municipio, setMunicipio] = useState("");

  const unidades = useQuery({ queryKey: ["units"], queryFn: () => territoryService.list() });

  // Se agrupan por nombre normalizado: el catálogo trae "JEREZ" y "Jerez" como
  // municipios distintos, y ofrecer ambos partiría el análisis en dos mitades.
  const municipios = useMemo(
    () =>
      Array.from(
        new Set((unidades.data ?? []).map((u) => normalizaMunicipio(u.municipio))),
      ).sort(),
    [unidades.data],
  );

  const analisis = useQuery({
    queryKey: ["analisis", partido, municipio],
    queryFn: () => strategyService.analizar(partido, municipio, unidades.data ?? []),
    enabled: Boolean(municipio) && (unidades.data ?? []).length > 0,
  });

  const grupos = useMemo(() => {
    const mapa = new Map<Clasificacion, SeccionAnalizada[]>();
    for (const s of analisis.data?.secciones ?? []) {
      const lista = mapa.get(s.clasificacion) ?? [];
      lista.push(s);
      mapa.set(s.clasificacion, lista);
    }
    return mapa;
  }, [analisis.data]);

  const nombrePartido =
    PARTIDOS.find((p) => p.siglas === partido)?.nombre ?? partido;

  return (
    <>
      <PageHeader
        title="Análisis electoral estratégico"
        description="Clasifica las secciones de un municipio según el historial del partido elegido, para decidir dónde poner estructura."
      />

      <Card className="mb-4">
        <CardHeader className="flex flex-row flex-wrap items-center gap-3 space-y-0">
          <Select value={partido} onValueChange={setPartido}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Partido" />
            </SelectTrigger>
            <SelectContent>
              {PARTIDOS.map((p) => (
                <SelectItem key={p.siglas} value={p.siglas}>
                  {p.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={municipio} onValueChange={setMunicipio}>
            <SelectTrigger className="w-[240px]">
              <SelectValue placeholder="Elige un municipio" />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {municipios.map((m) => (
                <SelectItem key={m} value={m}>
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {analisis.data && (
            <Badge variant="secondary" className="ml-auto">
              {analisis.data.procesos.map((p) => p.año).join(" · ")}
            </Badge>
          )}
        </CardHeader>
      </Card>

      {!municipio ? (
        <EmptyState
          icon={Target}
          title="Elige un partido y un municipio"
          description="El análisis compara las elecciones de ayuntamiento cargadas y clasifica cada sección según su historial."
        />
      ) : analisis.isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : analisis.isError ? (
        <ErrorState
          error={analisis.error}
          what="el análisis"
          onRetry={() => void analisis.refetch()}
        />
      ) : !analisis.data || analisis.data.secciones.length === 0 ? (
        <EmptyState
          icon={Target}
          title="Sin secciones para este municipio"
          description="No hay resultados electorales cargados para el territorio seleccionado."
        />
      ) : (
        <div className="space-y-4">
          <Encabezado datos={analisis.data} nombrePartido={nombrePartido} />
          <ResumenEjecutivo grupos={grupos} total={analisis.data.secciones.length} />
          {ORDEN.filter((c) => (grupos.get(c) ?? []).length > 0).map((c) => (
            <TablaGrupo
              key={c}
              clasificacion={c}
              secciones={grupos.get(c) ?? []}
              nombrePartido={nombrePartido}
              procesos={analisis.data!.procesos}
            />
          ))}
        </div>
      )}
    </>
  );
}

function Encabezado({
  datos,
  nombrePartido,
}: {
  datos: NonNullable<ReturnType<typeof strategyService.analizar> extends Promise<infer T> ? T : never>;
  nombrePartido: string;
}) {
  const t = datos.totales;
  const ultimo = datos.procesos[datos.procesos.length - 1];

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi etiqueta="Secciones" valor={fmt(t.secciones)} />
        <Kpi etiqueta="Lista nominal" valor={fmt(t.listaNominal)} />
        <Kpi etiqueta={`Votos emitidos ${ultimo?.año ?? ""}`} valor={fmt(t.votosEmitidos)} />
        <Kpi etiqueta={`Votos ${nombrePartido}`} valor={fmt(t.votosPartido)} destacado />
        <Kpi
          etiqueta={`% ${nombrePartido} / emitidos`}
          valor={`${t.porcentajePartido}%`}
          destacado
          nota={`Participación ${t.participacion}%`}
        />
      </div>

      {datos.tendenciaMedia !== null && (
        <div
          className={`flex items-start gap-2 rounded-md border p-3 text-sm ${
            datos.tendenciaMedia < 0
              ? "border-destructive/40 bg-destructive/5"
              : "border-emerald-600/30 bg-emerald-600/5"
          }`}
        >
          {datos.tendenciaMedia < 0 ? (
            <TrendingDown className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          ) : (
            <TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
          )}
          <p>
            <span className="font-medium">
              Tendencia {datos.tendenciaMedia > 0 ? "al alza" : "a la baja"}:{" "}
              {datos.tendenciaMedia > 0 ? "+" : ""}
              {datos.tendenciaMedia} puntos
            </span>{" "}
            de media entre {datos.procesos[0]?.año} y {ultimo?.año} en las secciones con
            historial completo. Ganar una sección hoy no garantiza ganarla mañana si no se
            trabaja la estructura.
          </p>
        </div>
      )}
    </>
  );
}

function Kpi({
  etiqueta,
  valor,
  nota,
  destacado,
}: {
  etiqueta: string;
  valor: string;
  nota?: string;
  destacado?: boolean;
}) {
  return (
    <div className={`rounded-md border p-3 ${destacado ? "border-primary/40 bg-primary/5" : "border-border"}`}>
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{etiqueta}</p>
      <p className="font-display text-xl font-semibold tabular-nums">{valor}</p>
      {nota && <p className="text-[11px] text-muted-foreground">{nota}</p>}
    </div>
  );
}

function ResumenEjecutivo({
  grupos,
  total,
}: {
  grupos: Map<Clasificacion, SeccionAnalizada[]>;
  total: number;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Resumen ejecutivo</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2">Clasificación</th>
                <th className="px-4 py-2 text-right">Secciones</th>
                <th className="px-4 py-2">Números de sección</th>
                <th className="px-4 py-2">Prioridad</th>
                <th className="px-4 py-2">Acción recomendada</th>
              </tr>
            </thead>
            <tbody>
              {ORDEN.map((c) => {
                const lista = grupos.get(c) ?? [];
                const cfg = CLASIFICACION[c];
                return (
                  <tr key={c} className="border-b border-border/60 last:border-0 align-top">
                    <td className="px-4 py-2">
                      <span className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: cfg.color }}
                        />
                        <span className="font-medium">{cfg.titulo}</span>
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      <span className="font-semibold">{lista.length}</span>
                      {total > 0 && (
                        <span className="ml-1 text-xs text-muted-foreground">
                          {Math.round((lista.length / total) * 100)}%
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {lista.length
                        ? lista
                            .map((s) => s.seccion)
                            .slice(0, 14)
                            .join(", ") + (lista.length > 14 ? `… (+${lista.length - 14})` : "")
                        : "Ninguna"}
                    </td>
                    <td className="px-4 py-2">
                      {lista.length ? (
                        <Badge variant={cfg.prioridad === "ALTA" ? "default" : "secondary"}>
                          {cfg.prioridad}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {lista.length
                        ? cfg.accion
                        : c === "siempre_pierde"
                          ? "Hallazgo positivo: ninguna sección cae en este grupo."
                          : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function TablaGrupo({
  clasificacion,
  secciones,
  nombrePartido,
  procesos,
}: {
  clasificacion: Clasificacion;
  secciones: SeccionAnalizada[];
  nombrePartido: string;
  procesos: { año: number; etiqueta: string }[];
}) {
  const cfg = CLASIFICACION[clasificacion];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2 space-y-0">
        <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: cfg.color }} />
        <CardTitle className="text-base">
          {cfg.titulo} · {nombrePartido}
        </CardTitle>
        <Badge variant="secondary" className="ml-auto">
          {secciones.length} {secciones.length === 1 ? "sección" : "secciones"}
        </Badge>
      </CardHeader>
      <CardContent className="p-0">
        {clasificacion === "perdida" && (
          <div className="mx-4 mb-3 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2.5 text-xs">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
            <span>
              Aquí el voto ya estuvo. Recuperarlo cuesta menos que conquistar territorio
              nuevo, pero exige saber qué cambió: son las de diagnóstico más urgente.
            </span>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2">Sección</th>
                <th className="px-4 py-2">Colonia / comunidad</th>
                <th className="px-4 py-2">Tipo</th>
                <th className="px-4 py-2 text-right">Lista nominal</th>
                {procesos.map((p) => (
                  <th key={p.año} className="px-4 py-2 text-right" translate="no">
                    {p.año}
                  </th>
                ))}
                <th className="px-4 py-2 text-right">Tendencia</th>
                <th className="px-4 py-2">Rival</th>
              </tr>
            </thead>
            <tbody>
              {secciones.map((s) => (
                <tr key={s.seccion} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-2 font-medium tabular-nums">{s.seccion}</td>
                  <td className="max-w-[240px] truncate px-4 py-2 text-xs" title={s.colonia}>
                    {s.colonia}
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">{s.tipo ?? "—"}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{fmt(s.listaNominal)}</td>
                  {procesos.map((p) => {
                    const r = s.procesos.find((x) => x.año === p.año);
                    return (
                      <td key={p.año} className="px-4 py-2 text-right tabular-nums">
                        {r ? (
                          <span className={r.gano ? "font-medium text-emerald-700" : ""}>
                            {fmt(r.votos)}
                            <span className="ml-1 text-xs text-muted-foreground">
                              {r.porcentaje}%
                            </span>
                            {r.gano && <span className="ml-1">✓</span>}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">sin dato</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-4 py-2 text-right tabular-nums">
                    {s.tendencia === null ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : (
                      <span
                        className={
                          s.tendencia > 0
                            ? "text-emerald-700"
                            : s.tendencia < 0
                              ? "text-destructive"
                              : ""
                        }
                      >
                        {s.tendencia > 0 ? "+" : ""}
                        {s.tendencia} pts
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-xs" translate="no">
                    {s.rival ?? <span className="text-muted-foreground">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
