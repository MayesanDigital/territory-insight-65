import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Radar, Heart, Eye, TrendingUp } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { monitoringService, analyzeMentions } from "@/services/monitoringService";

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

function MonitorPage() {
  const mentions = useQuery({
    queryKey: ["mentions"],
    queryFn: () => monitoringService.mentions(),
  });
  const monitors = useQuery({
    queryKey: ["monitors"],
    queryFn: () => monitoringService.monitors(),
  });

  const a = analyzeMentions(mentions.data ?? []);
  const loading = mentions.isLoading;

  return (
    <>
      <PageHeader
        title="Monitor de presencia pública"
        description="Análisis de contenidos públicos en internet. No se perfilan personas privadas ni se infieren preferencias políticas."
      />

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

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
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
            <CardTitle className="text-base">Monitores activos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {(monitors.data ?? []).map((m) => (
              <div key={m.id} className="flex items-center justify-between border-b border-border/60 pb-2 last:border-0">
                <div>
                  <p className="font-medium">{m.name}</p>
                  <p className="text-xs text-muted-foreground">{m.query}</p>
                </div>
                <Badge variant={m.active ? "default" : "secondary"}>
                  {m.active ? "Activo" : "Pausado"}
                </Badge>
              </div>
            ))}
            {(monitors.data ?? []).length === 0 && (
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
                <span>{s.domain}</span>
                <Badge variant="secondary">{s.total}</Badge>
              </div>
            ))}
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
                style={{ fontSize: `${Math.min(18, 11 + w.total / 3)}px` }}
              >
                {w.word}
              </span>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
