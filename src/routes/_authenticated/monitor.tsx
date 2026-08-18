import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Radar,
  Heart,
  Eye,
  TrendingUp,
  RefreshCw,
  Trash2,
  Loader2,
  AlertCircle,
  SearchX,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { MonitorSearch } from "@/components/monitor-search";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { monitoringService, analyzeMentions } from "@/services/monitoringService";
import { summarizeMentions } from "@/services/aiAnalysisService";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/_authenticated/monitor")({
  head: () => ({
    meta: [
      { title: "Monitor público | Territorio Intelligence" },
      {
        name: "description",
        content:
          "Monitoreo de presencia pública en internet: volumen, sentimiento, fuentes y temas de conversación.",
      },
      { property: "og:title", content: "Monitor público | Territorio Intelligence" },
      {
        property: "og:description",
        content: "Panel de social listening sobre contenidos públicos indexados.",
      },
    ],
  }),
  component: MonitorPage,
});

const RUN_STATUS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" }> =
  {
    ok: { label: "Correcto", variant: "default" },
    partial: { label: "Parcial", variant: "secondary" },
    error: { label: "Con errores", variant: "destructive" },
    running: { label: "En curso", variant: "secondary" },
  };

function MonitorPage() {
  const qc = useQueryClient();
  const { canAnalyze } = useAuth();
  const [activeMonitor, setActiveMonitor] = useState<string | null>(null);

  const monitors = useQuery({
    queryKey: ["monitors"],
    queryFn: () => monitoringService.monitors(),
  });
  const mentions = useQuery({
    queryKey: ["mentions", activeMonitor],
    queryFn: () => monitoringService.mentions(activeMonitor ?? undefined),
  });

  const rows = useMemo(() => mentions.data ?? [], [mentions.data]);
  const a = useMemo(() => analyzeMentions(rows), [rows]);
  const monitorName = monitors.data?.find((m) => m.id === activeMonitor)?.name;
  const summary = useMemo(() => summarizeMentions(rows, monitorName), [rows, monitorName]);
  const loading = mentions.isLoading;

  const run = useMutation({
    mutationFn: (id: string) => monitoringService.runMonitor(id),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["mentions"] });
      qc.invalidateQueries({ queryKey: ["monitors"] });
      toast.success(
        r.items_new > 0 ? `${r.items_new} menciones nuevas` : "Sin novedades desde la última corrida",
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => monitoringService.removeMonitor(id),
    onSuccess: (_d, id) => {
      if (activeMonitor === id) setActiveMonitor(null);
      qc.invalidateQueries({ queryKey: ["monitors"] });
      qc.invalidateQueries({ queryKey: ["mentions"] });
      toast.success("Monitor eliminado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader
        title="Monitor de presencia pública"
        description="Análisis de contenidos públicos en internet. No se perfilan personas privadas ni se infieren preferencias políticas."
      />

      {canAnalyze && (
        <div className="mb-4">
          <MonitorSearch onMonitorReady={setActiveMonitor} />
        </div>
      )}

      {/* Selector del monitor cuyas menciones se están analizando. */}
      {(monitors.data ?? []).length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          <Button
            variant={activeMonitor === null ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveMonitor(null)}
          >
            Todos
          </Button>
          {(monitors.data ?? []).map((m) => (
            <Button
              key={m.id}
              variant={activeMonitor === m.id ? "default" : "outline"}
              size="sm"
              onClick={() => setActiveMonitor(m.id)}
            >
              {m.name}
              <span className="ml-2 opacity-60">{m.mention_count}</span>
            </Button>
          ))}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Menciones" value={a.total} icon={Radar} loading={loading} />
        <StatCard
          label="Alcance estimado"
          value={a.reach.toLocaleString("es-MX")}
          icon={Eye}
          loading={loading}
        />
        <StatCard
          label="Interacciones"
          value={a.engagement.toLocaleString("es-MX")}
          icon={Heart}
          loading={loading}
        />
        <StatCard
          label="Tendencia"
          value={`${a.trend > 0 ? "+" : ""}${a.trend}%`}
          hint="Segunda mitad vs primera"
          icon={TrendingUp}
          loading={loading}
        />
      </div>

      {!loading && rows.length === 0 ? (
        <Card className="mt-6">
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <SearchX className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="font-medium">Todavía no hay menciones</p>
              <p className="text-sm text-muted-foreground">
                {canAnalyze
                  ? "Escribe arriba el nombre del candidato, organización o tema que quieras vigilar."
                  : "Pide a un administrador o analista que configure un monitor."}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="text-base">¿Qué está ocurriendo en internet?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {loading ? (
                <Skeleton className="h-24 w-full" />
              ) : (
                <>
                  <p className="font-display text-lg">{summary.headline}</p>
                  {summary.paragraphs.map((p) => (
                    <p key={p} className="leading-relaxed text-muted-foreground">
                      {p}
                    </p>
                  ))}
                  <p className="pt-2 text-xs text-muted-foreground">
                    Resumen generado a partir de contenidos públicos agregados. No describe ni
                    clasifica a personas individuales.
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Volumen y sentimiento en el tiempo</CardTitle>
              </CardHeader>
              <CardContent className="h-72">
                {loading ? (
                  <Skeleton className="h-full w-full" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={a.timeline}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="date" fontSize={11} stroke="var(--muted-foreground)" />
                      <YAxis fontSize={11} stroke="var(--muted-foreground)" />
                      <Tooltip />
                      <Area type="monotone" dataKey="total" name="Total" stroke="var(--chart-1)" fill="var(--chart-1)" fillOpacity={0.15} />
                      <Area type="monotone" dataKey="positive" name="Positivas" stroke="var(--chart-2)" fill="var(--chart-2)" fillOpacity={0.12} />
                      <Area type="monotone" dataKey="negative" name="Negativas" stroke="var(--chart-5)" fill="var(--chart-5)" fillOpacity={0.12} />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Monitores</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {monitors.isLoading && <Skeleton className="h-32 w-full" />}
                {(monitors.data ?? []).map((m) => {
                  const status = m.last_run_status ? RUN_STATUS[m.last_run_status] : null;
                  return (
                    <div
                      key={m.id}
                      className="space-y-2 border-b border-border/60 pb-3 last:border-0 last:pb-0"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{m.name}</p>
                          <p className="truncate text-xs text-muted-foreground">{m.query}</p>
                        </div>
                        <Badge variant={status?.variant ?? "secondary"}>
                          {status?.label ?? "Sin ejecutar"}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{m.mention_count} menciones</span>
                        {m.last_run_at && (
                          <span>· {new Date(m.last_run_at).toLocaleString("es-MX")}</span>
                        )}
                      </div>
                      {m.last_error && (
                        <p className="flex items-start gap-1 text-xs text-destructive">
                          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" /> {m.last_error}
                        </p>
                      )}
                      {canAnalyze && (
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={run.isPending}
                            onClick={() => run.mutate(m.id)}
                          >
                            {run.isPending && run.variables === m.id ? (
                              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                            ) : (
                              <RefreshCw className="mr-1 h-3 w-3" />
                            )}
                            Actualizar
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label="Eliminar monitor"
                            onClick={() => remove.mutate(m.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
                {(monitors.data ?? []).length === 0 && !monitors.isLoading && (
                  <p className="text-muted-foreground">Sin monitores configurados.</p>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Principales fuentes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {a.sources.map((s) => (
                  <div key={s.domain} className="flex items-center justify-between">
                    <span className="truncate">{s.domain}</span>
                    <Badge variant="secondary">{s.total}</Badge>
                  </div>
                ))}
                {a.sources.length === 0 && (
                  <p className="text-muted-foreground">Sin fuentes registradas.</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Temas frecuentes</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {a.words.slice(0, 24).map((w) => (
                  <span
                    key={w.word}
                    className="rounded-full border border-border px-3 py-1 text-xs"
                    title={`${w.total} apariciones`}
                    // El tamaño sigue el peso TF-IDF, no la frecuencia bruta: así
                    // el término más distintivo destaca sobre el repetido.
                    style={{ fontSize: `${11 + w.weight * 8}px` }}
                  >
                    {w.word}
                  </span>
                ))}
                {a.words.length === 0 && !loading && (
                  <p className="text-sm text-muted-foreground">
                    Todavía no hay suficiente contenido para extraer temas.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </>
  );
}
