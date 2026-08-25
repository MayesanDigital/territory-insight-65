import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Download, Printer, Target, TrendingDown, TrendingUp } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState } from "@/components/query-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { exportCSV, exportPrintablePDF, stamped } from "@/lib/export";
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
  type AnalisisEstrategico,
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
            <>
              <Badge variant="secondary" className="ml-auto">
                {analisis.data.procesos.map((p) => p.año).join(" · ")}
              </Badge>
              <Button variant="outline" size="sm" onClick={() => imprimir(analisis.data!, nombrePartido)}>
                <Printer className="mr-2 h-4 w-4" /> Imprimir / PDF
              </Button>
              <Button variant="outline" size="sm" onClick={() => descargar(analisis.data!, nombrePartido)}>
                <Download className="mr-2 h-4 w-4" /> CSV
              </Button>
            </>
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
          <NotaMetodologica datos={analisis.data} nombrePartido={nombrePartido} />
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
                <th className="px-4 py-2">Observación</th>
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
                  <td className="max-w-[320px] px-4 py-2 text-xs text-muted-foreground">
                    {s.observacion}
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

/**
 * Nota metodológica.
 *
 * Un informe que clasifica territorio y sugiere dónde invertir esfuerzo tiene
 * que decir de dónde salen sus cifras y qué NO puede afirmar. Sin esto, el
 * lector no sabe si "siempre gana" son dos elecciones o diez.
 */
function NotaMetodologica({
  datos,
  nombrePartido,
}: {
  datos: AnalisisEstrategico;
  nombrePartido: string;
}) {
  const años = datos.procesos.map((p) => p.año);
  const sinHistorial = datos.secciones.filter((s) => s.clasificacion === "sin_historial").length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Nota metodológica</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-xs text-muted-foreground">
        <p>
          · Se comparan las elecciones de <strong>ayuntamiento</strong> de {años.join(" y ")},
          con cómputos oficiales del IEEZ. Para una campaña municipal, ganar la sección en
          la elección del propio cargo pesa más que ganarla en una federal.
        </p>
        <p>
          · Los votos de {nombrePartido} incluyen <strong>toda la coalición que lo llevaba en
          ese municipio</strong>. Las alianzas se pactan ayuntamiento por ayuntamiento: donde
          compitió solo, la cifra es la suya; donde fue coaligado, es la del bloque. Sumar
          únicamente su columna perdería los votos emitidos marcando a varios aliados a la vez.
        </p>
        <p>
          · <strong>Ganó</strong> significa haber sido la fuerza más votada en esa sección, no
          haber ganado el municipio.
        </p>
        {sinHistorial > 0 && (
          <p>
            · {sinHistorial}{" "}
            {sinHistorial === 1 ? "sección carece" : "secciones carecen"} de dato en alguno de
            los procesos. Suele deberse al <strong>reseccionamiento</strong>: entre 2021 y 2024
            el INE dividió y renumeró secciones, así que no todas tienen historial comparable.
            Se marcan como tales en lugar de estimarles cifras que no existen.
          </p>
        )}
        <p>
          · La <strong>tendencia</strong> es la diferencia en puntos porcentuales entre el
          primer y el último proceso. El <strong>margen</strong> compara contra la fuerza
          ganadora de la última elección: negativo significa derrota.
        </p>
        <p className="pt-1 italic">
          Documento de trabajo interno. Las cifras son públicas y agregadas por sección; no
          describen a ninguna persona.
        </p>
      </CardContent>
    </Card>
  );
}

/** Filas planas para exportar, una por sección. */
function filasPlanas(datos: AnalisisEstrategico) {
  return datos.secciones.map((s) => {
    const fila: Record<string, string | number> = {
      Seccion: s.seccion,
      "Colonia / comunidad": s.colonia,
      Tipo: s.tipo ?? "",
      "Lista nominal": s.listaNominal,
      Clasificacion: CLASIFICACION[s.clasificacion].titulo,
      Prioridad: CLASIFICACION[s.clasificacion].prioridad,
    };
    for (const p of datos.procesos) {
      const r = s.procesos.find((x) => x.año === p.año);
      fila[`Votos ${p.año}`] = r?.votos ?? "";
      fila[`% ${p.año}`] = r?.porcentaje ?? "";
      fila[`Gano ${p.año}`] = r ? (r.gano ? "Si" : "No") : "";
    }
    fila["Tendencia (pts)"] = s.tendencia ?? "";
    fila["Margen (pts)"] = s.margen ?? "";
    fila["Rival ultima"] = s.rival ?? "";
    fila.Observacion = s.observacion;
    return fila;
  });
}

function descargar(datos: AnalisisEstrategico, nombrePartido: string) {
  exportCSV(
    stamped(`analisis-${nombrePartido}-${datos.municipio}`.replace(/\s+/g, "-").toLowerCase()),
    filasPlanas(datos),
  );
}

function imprimir(datos: AnalisisEstrategico, nombrePartido: string) {
  const t = datos.totales;
  const ultimo = datos.procesos[datos.procesos.length - 1];
  const cuenta = (c: Clasificacion) =>
    datos.secciones.filter((s) => s.clasificacion === c).length;

  const resumen = [
    `El análisis cubre ${t.secciones} secciones del municipio de ${datos.municipio}, con ` +
      `${t.listaNominal.toLocaleString("es-MX")} electores en lista nominal. En ` +
      `${ultimo?.etiqueta ?? "la última elección"} se emitieron ` +
      `${t.votosEmitidos.toLocaleString("es-MX")} votos (participación ${t.participacion}%), ` +
      `de los cuales ${nombrePartido} obtuvo ${t.votosPartido.toLocaleString("es-MX")}, ` +
      `el ${t.porcentajePartido}%.`,
    `${cuenta("siempre_gana")} secciones son base sólida y ${cuenta("perdida")} se perdieron ` +
      `tras haberse ganado: estas últimas son la prioridad, porque el voto ya estuvo ahí y ` +
      `recuperarlo cuesta menos que conquistar territorio nuevo.`,
  ];

  if (datos.tendenciaMedia !== null) {
    resumen.push(
      `La tendencia media entre ${datos.procesos[0]?.año} y ${ultimo?.año} es de ` +
        `${datos.tendenciaMedia > 0 ? "+" : ""}${datos.tendenciaMedia} puntos porcentuales. ` +
        (datos.tendenciaMedia < 0
          ? "Ganar una sección hoy no garantiza ganarla mañana si no se trabaja la estructura."
          : "El avance sostenido facilita consolidar lo ganado."),
    );
  }

  resumen.push(
    `Los votos incluyen la coalición que llevaba a ${nombrePartido} en este municipio. ` +
      `"Ganó" significa haber sido la fuerza más votada en la sección, no haber ganado el ` +
      `municipio. Documento de trabajo interno con cifras públicas agregadas por sección.`,
  );

  try {
    exportPrintablePDF(
      {
        title: "Análisis electoral estratégico",
        subtitle: `${nombrePartido} · Municipio de ${datos.municipio} · Elecciones ${datos.procesos
          .map((p) => p.año)
          .join(" y ")}`,
        kpis: [
          { label: "Secciones", value: t.secciones.toLocaleString("es-MX") },
          { label: "Lista nominal", value: t.listaNominal.toLocaleString("es-MX") },
          { label: `Votos emitidos ${ultimo?.año ?? ""}`, value: t.votosEmitidos.toLocaleString("es-MX") },
          { label: `Votos ${nombrePartido}`, value: t.votosPartido.toLocaleString("es-MX") },
          { label: "% sobre emitidos", value: `${t.porcentajePartido}%` },
        ],
        summary: resumen,
      },
      ORDEN.filter((c) => cuenta(c) > 0).map((c) => ({
        heading: `${CLASIFICACION[c].titulo} — ${cuenta(c)} ${cuenta(c) === 1 ? "sección" : "secciones"}`,
        description: CLASIFICACION[c].accion,
        rows: filasPlanas({
          ...datos,
          secciones: datos.secciones.filter((s) => s.clasificacion === c),
        }),
      })),
    );
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "No se pudo abrir la vista de impresión");
  }
}
