import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Users,
  Layers,
  MapPin,
  Percent,
  AlertTriangle,
  Activity,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { EmptyState, ErrorState } from "@/components/query-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { territoryService } from "@/services/territoryService";
import { contactsService } from "@/services/contactsService";
import { analyticsService } from "@/services/analyticsService";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard | Territorio Intelligence" },
      {
        name: "description",
        content:
          "Panel ejecutivo con población representada, cobertura territorial y actividad reciente.",
      },
      { property: "og:title", content: "Dashboard | Territorio Intelligence" },
      {
        property: "og:description",
        content: "Indicadores territoriales agregados y métricas administrativas de contactos.",
      },
    ],
  }),
  component: DashboardPage,
});

const CHART_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

function DashboardPage() {
  const units = useQuery({ queryKey: ["units"], queryFn: () => territoryService.list() });
  const contacts = useQuery({ queryKey: ["contacts", {}], queryFn: () => contactsService.list() });

  const loading = units.isLoading || contacts.isLoading;
  const error = units.error ?? contacts.error;

  const u = units.data ?? [];
  const c = contacts.data ?? [];
  const totals = analyticsService.totals(u, c);
  const topSections = analyticsService.bySection(u, c).slice(0, 8);
  const monthly = analyticsService.monthlyRegistrations(c);
  const ages = analyticsService.ageDistribution(u);
  const genders = analyticsService.genderDistribution(u);
  const recent = [...c].slice(0, 6);
  const withoutComms = c.filter((x) => !x.consent_comms).length;

  if (error) {
    return (
      <>
        <PageHeader
          title="Dashboard ejecutivo"
          description="Indicadores territoriales y demográficos presentados exclusivamente de forma agregada."
        />
        <ErrorState
          error={error}
          what="los indicadores"
          onRetry={() => {
            void units.refetch();
            void contacts.refetch();
          }}
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Dashboard ejecutivo"
        description="Indicadores territoriales y demográficos presentados exclusivamente de forma agregada. Los contactos son registros administrativos con consentimiento."
      />

      {!loading && u.length === 0 && (
        <div className="mb-4">
          <EmptyState
            icon={Layers}
            title="Todavía no hay territorio cargado"
            description="Importa las secciones territoriales para que el panel empiece a mostrar indicadores."
          />
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Habitantes representados"
          value={totals.population.toLocaleString("es-MX")}
          hint={`${totals.municipios} municipios`}
          icon={Users}
          loading={loading}
        />
        <StatCard
          label="Secciones territoriales"
          value={totals.sections}
          hint="Unidades con demografía agregada"
          icon={Layers}
          loading={loading}
        />
        <StatCard
          label="Contactos registrados"
          value={totals.contacts.toLocaleString("es-MX")}
          hint="Con consentimiento vigente"
          icon={MapPin}
          loading={loading}
        />
        <StatCard
          label="Cobertura administrativa"
          value={`${totals.coverage.toFixed(2)}%`}
          hint="Contactos / población de referencia"
          icon={Percent}
          loading={loading}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Evolución mensual de registros</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {loading ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="month" fontSize={11} stroke="var(--muted-foreground)" />
                  <YAxis fontSize={11} stroke="var(--muted-foreground)" />
                  <Tooltip />
                  <Area
                    type="monotone"
                    dataKey="total"
                    stroke="var(--chart-1)"
                    fill="var(--chart-1)"
                    fillOpacity={0.18}
                    name="Registros"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Distribución por género (agregada)</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {loading ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={genders} dataKey="value" nameKey="name" innerRadius={55} outerRadius={90}>
                    {genders.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Secciones con mayor concentración de contactos
            </CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {loading ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topSections}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="key" fontSize={11} stroke="var(--muted-foreground)" />
                  <YAxis fontSize={11} stroke="var(--muted-foreground)" />
                  <Tooltip />
                  <Bar dataKey="contacts" fill="var(--chart-1)" name="Contactos" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Distribución demográfica por edad</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {loading ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ages} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis type="number" fontSize={11} stroke="var(--muted-foreground)" />
                  <YAxis dataKey="range" type="category" fontSize={11} stroke="var(--muted-foreground)" />
                  <Tooltip />
                  <Bar dataKey="value" fill="var(--chart-2)" name="Personas" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4 text-primary" /> Actividad reciente
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading && <Skeleton className="h-32 w-full" />}
            {!loading && recent.length === 0 && (
              <p className="text-sm text-muted-foreground">Sin actividad registrada.</p>
            )}
            {recent.map((r) => (
              <div key={r.id} className="flex items-center justify-between border-b border-border/60 pb-2 text-sm last:border-0">
                <div>
                  <p className="font-medium">Alta de contacto · sección {r.section_code}</p>
                  <p className="text-xs text-muted-foreground">{r.municipio}</p>
                </div>
                <span className="text-xs text-muted-foreground">
                  {new Date(r.registered_at).toLocaleDateString("es-MX")}
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-accent" /> Alertas del sistema
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-start justify-between gap-3">
              <span>Contactos sin consentimiento de comunicaciones</span>
              <Badge variant="secondary">{withoutComms}</Badge>
            </div>
            <div className="flex items-start justify-between gap-3">
              <span>Secciones sin geometría cargada</span>
              <Badge variant="secondary">{u.filter((x) => !x.has_geometry).length}</Badge>
            </div>
            <div className="flex items-start justify-between gap-3">
              <span>Origen de datos territoriales</span>
              <Badge variant="outline">demo · sin datos oficiales</Badge>
            </div>
            <p className="pt-2 text-xs text-muted-foreground">
              Estos indicadores son administrativos. No representan votos, votantes ni probabilidad
              de voto.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
