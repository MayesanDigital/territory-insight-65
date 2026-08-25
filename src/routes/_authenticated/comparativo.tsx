import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { GitCompare, Printer, ThumbsDown, ThumbsUp } from "lucide-react";
import { toast } from "sonner";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState } from "@/components/query-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { exportPrintablePDF } from "@/lib/export";
import { comparisonService, type Comparativo, type SujetoComparado } from "@/services/comparisonService";

export const Route = createFileRoute("/_authenticated/comparativo")({
  head: () => ({
    meta: [
      { title: "Comparativo | Territorio Intelligence" },
      {
        name: "description",
        content:
          "Compara las búsquedas del historial de monitoreo: cuota de voz, sentimiento, alcance y evolución.",
      },
    ],
  }),
  component: ComparativoPage,
});

/** Paleta por posición, estable entre gráficos para poder seguir a cada sujeto. */
const COLORES = ["#7A2E2E", "#4A5D6B", "#C9A227", "#2F6B4F", "#A8763E", "#7A5C9E"];

const fmt = (n: number) => n.toLocaleString("es-MX");

function ComparativoPage() {
  const [seleccion, setSeleccion] = useState<string[]>([]);

  const disponibles = useQuery({
    queryKey: ["monitores-comparables"],
    queryFn: () => comparisonService.comparables(),
  });

  // Al entrar se comparan las dos búsquedas con más menciones: es lo que casi
  // siempre se quiere ver, y evita una pantalla vacía con dos clics por delante.
  const activos = useMemo(() => {
    const lista = disponibles.data ?? [];
    if (seleccion.length > 0) return lista.filter((m) => seleccion.includes(m.id));
    return [...lista].sort((a, b) => (b.mention_count ?? 0) - (a.mention_count ?? 0)).slice(0, 2);
  }, [disponibles.data, seleccion]);

  const comparativo = useQuery({
    queryKey: ["comparativo", activos.map((m) => m.id).sort().join("|")],
    queryFn: () => comparisonService.comparar(activos),
    enabled: activos.length >= 2,
  });

  const alternar = (id: string) =>
    setSeleccion((prev) => {
      const base = prev.length > 0 ? prev : activos.map((m) => m.id);
      return base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
    });

  const idsActivos = activos.map((m) => m.id);

  return (
    <>
      <PageHeader
        title="Comparativo de búsquedas"
        description="Pone lado a lado el historial de monitoreo y traduce las diferencias en fortalezas y debilidades."
      />

      <Card className="mb-4">
        <CardHeader className="flex flex-row flex-wrap items-center gap-2 space-y-0">
          {disponibles.isLoading ? (
            <Skeleton className="h-8 w-64" />
          ) : (
            (disponibles.data ?? []).map((m) => (
              <Button
                key={m.id}
                variant={idsActivos.includes(m.id) ? "default" : "outline"}
                size="sm"
                onClick={() => alternar(m.id)}
              >
                {m.name}
                <span className="ml-2 opacity-60">{m.mention_count}</span>
              </Button>
            ))
          )}
          {comparativo.data && (
            <Button
              variant="outline"
              size="sm"
              className="ml-auto"
              onClick={() => imprimir(comparativo.data!)}
            >
              <Printer className="mr-2 h-4 w-4" /> Imprimir / PDF
            </Button>
          )}
        </CardHeader>
      </Card>

      {(disponibles.data ?? []).length < 2 ? (
        <EmptyState
          icon={GitCompare}
          title="Hacen falta al menos dos búsquedas con menciones"
          description="Ejecuta búsquedas desde Monitor Público; cuando dos de ellas tengan resultados podrás compararlas aquí."
        />
      ) : activos.length < 2 ? (
        <EmptyState
          icon={GitCompare}
          title="Elige al menos dos búsquedas"
          description="Selecciona arriba las búsquedas que quieres poner lado a lado."
        />
      ) : comparativo.isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : comparativo.isError ? (
        <ErrorState
          error={comparativo.error}
          what="el comparativo"
          onRetry={() => void comparativo.refetch()}
        />
      ) : comparativo.data ? (
        <Contenido datos={comparativo.data} />
      ) : null}
    </>
  );
}

function Contenido({ datos }: { datos: Comparativo }) {
  const conColor = datos.sujetos.map((s, i) => ({ ...s, color: COLORES[i % COLORES.length] }));

  return (
    <div className="space-y-4">
      {/* Tarjetas resumen, una por sujeto. */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {conColor.map((s) => (
          <Card key={s.id} style={{ borderTopColor: s.color, borderTopWidth: 3 }}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base" translate="no">
                {s.nombre}
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                {s.tipo === "person" ? "Persona pública" : "Tema"} · {fmt(s.analytics.total)} menciones
              </p>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="grid grid-cols-3 gap-2 text-center">
                <Metrica etiqueta="Cuota de voz" valor={`${s.cuotaVoz}%`} />
                <Metrica
                  etiqueta="Saldo"
                  valor={`${s.saldo > 0 ? "+" : ""}${s.saldo}`}
                  color={s.saldo > 0 ? "#2F6B4F" : s.saldo < 0 ? "#B3402F" : undefined}
                />
                <Metrica etiqueta="Alcance" valor={fmt(s.analytics.reach)} />
              </div>
              <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
                <div style={{ width: `${s.positivo}%`, backgroundColor: "#2F6B4F" }} />
                <div style={{ width: `${s.neutral}%`, backgroundColor: "#B9AFA0" }} />
                <div style={{ width: `${s.negativo}%`, backgroundColor: "#B3402F" }} />
              </div>
              <p className="text-[11px] text-muted-foreground">
                {s.positivo}% positivo · {s.neutral}% neutral · {s.negativo}% negativo
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Lectura general */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lectura del comparativo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {datos.lectura.map((p, i) => (
            <p
              key={i}
              className={
                i === datos.lectura.length - 1
                  ? "border-t border-border/60 pt-2 text-xs italic text-muted-foreground"
                  : "text-sm text-muted-foreground"
              }
            >
              {p}
            </p>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Sentimiento comparado */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Reparto de sentimiento</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={conColor.map((s) => ({
                  nombre: s.nombre,
                  Positivo: s.positivo,
                  Neutral: s.neutral,
                  Negativo: s.negativo,
                }))}
                layout="vertical"
                margin={{ left: 8, right: 16 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" unit="%" fontSize={11} />
                <YAxis type="category" dataKey="nombre" width={110} fontSize={11} />
                <Tooltip formatter={(v: number) => `${v}%`} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Positivo" stackId="s" fill="#2F6B4F" />
                <Bar dataKey="Neutral" stackId="s" fill="#B9AFA0" />
                <Bar dataKey="Negativo" stackId="s" fill="#B3402F" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Cuota de voz */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cuota de voz</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={conColor} margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="nombre" fontSize={11} />
                <YAxis unit="%" fontSize={11} />
                <Tooltip formatter={(v: number) => `${v}%`} />
                <Bar dataKey="cuotaVoz" name="Cuota de voz" radius={[4, 4, 0, 0]}>
                  {conColor.map((s) => (
                    <Cell key={s.id} fill={s.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Evolución */}
      {datos.evolucion.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Evolución de menciones</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={datos.evolucion} margin={{ left: 8, right: 16 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="fecha" fontSize={11} />
                <YAxis fontSize={11} allowDecimals={false} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {conColor.map((s) => (
                  <Line
                    key={s.id}
                    type="monotone"
                    dataKey={s.nombre}
                    stroke={s.color}
                    strokeWidth={2}
                    dot={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Fortalezas y debilidades */}
      <div className="grid gap-4 lg:grid-cols-2">
        {conColor.map((s) => (
          <Card key={s.id}>
            <CardHeader className="flex flex-row items-center gap-2 space-y-0">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: s.color }} />
              <CardTitle className="text-base" translate="no">
                {s.nombre}
              </CardTitle>
              <Badge variant="secondary" className="ml-auto">
                {s.diversidadFuentes} medios
              </Badge>
            </CardHeader>
            <CardContent className="space-y-3">
              <Lista
                titulo="Fortalezas"
                items={s.fortalezas}
                icono={<ThumbsUp className="h-3.5 w-3.5 text-emerald-700" />}
              />
              <Lista
                titulo="Debilidades"
                items={s.debilidades}
                icono={<ThumbsDown className="h-3.5 w-3.5 text-destructive" />}
              />
              {s.terminosPropios.length > 0 && (
                <div>
                  <p className="mb-1 text-xs uppercase tracking-widest text-muted-foreground">
                    Términos propios
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {s.terminosPropios.map((t) => (
                      <Badge key={t} variant="outline" className="text-[10px]" translate="no">
                        {t}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function Metrica({ etiqueta, valor, color }: { etiqueta: string; valor: string; color?: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{etiqueta}</p>
      <p className="text-base font-semibold tabular-nums" style={color ? { color } : undefined}>
        {valor}
      </p>
    </div>
  );
}

function Lista({
  titulo,
  items,
  icono,
}: {
  titulo: string;
  items: string[];
  icono: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5">
        {icono}
        <p className="text-xs uppercase tracking-widest text-muted-foreground">{titulo}</p>
      </div>
      <ul className="space-y-1">
        {items.map((t, i) => (
          <li key={i} className="text-xs text-muted-foreground">
            · {t}
          </li>
        ))}
      </ul>
    </div>
  );
}

function imprimir(datos: Comparativo) {
  const fila = (s: SujetoComparado) => ({
    Sujeto: s.nombre,
    Menciones: s.analytics.total,
    "Cuota de voz": `${s.cuotaVoz}%`,
    Positivo: `${s.positivo}%`,
    Neutral: `${s.neutral}%`,
    Negativo: `${s.negativo}%`,
    Saldo: s.saldo,
    Alcance: s.analytics.reach,
    Medios: s.diversidadFuentes,
    Tendencia: `${Math.round(s.analytics.trend)}%`,
  });

  try {
    exportPrintablePDF(
      {
        title: "Comparativo de monitoreo",
        subtitle: datos.sujetos.map((s) => s.nombre).join("  ·  "),
        kpis: [
          { label: "Sujetos comparados", value: String(datos.sujetos.length) },
          { label: "Menciones analizadas", value: fmt(datos.totalMenciones) },
        ],
        summary: datos.lectura,
      },
      [
        { heading: "Indicadores comparados", rows: datos.sujetos.map(fila) },
        ...datos.sujetos.flatMap((s) => [
          {
            heading: `${s.nombre} — Fortalezas`,
            rows: s.fortalezas.map((t, i) => ({ "#": i + 1, Fortaleza: t })),
          },
          {
            heading: `${s.nombre} — Debilidades`,
            rows: s.debilidades.map((t, i) => ({ "#": i + 1, Debilidad: t })),
          },
        ]),
      ],
    );
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "No se pudo abrir la vista de impresión");
  }
}
