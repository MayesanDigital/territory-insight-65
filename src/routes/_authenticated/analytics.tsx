import { useMemo } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { PageHeader } from "@/components/page-header";
import { ErrorState } from "@/components/query-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { territoryService } from "@/services/territoryService";
import { contactsService } from "@/services/contactsService";
import { analyticsService, fetchMunicipalDemographics } from "@/services/analyticsService";
import { exportCSV } from "@/lib/export";

export const Route = createFileRoute("/_authenticated/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics | Territorio Intelligence" },
      {
        name: "description",
        content:
          "Análisis demográfico agregado por municipio, estructura de edad y evolución de registros.",
      },
      { property: "og:title", content: "Analytics | Territorio Intelligence" },
      {
        property: "og:description",
        content: "Comparativos de cobertura territorial y demografía agregada.",
      },
    ],
  }),
  component: AnalyticsPage,
});

function AnalyticsPage() {
  const units = useQuery({ queryKey: ["units"], queryFn: () => territoryService.list() });
  const contacts = useQuery({ queryKey: ["contacts", {}], queryFn: () => contactsService.list() });
  const loading = units.isLoading || contacts.isLoading;
  const error = units.error ?? contacts.error ?? null;

  const municipal = useQuery({
    queryKey: ["municipal-demographics"],
    queryFn: fetchMunicipalDemographics,
  });

  const u = useMemo(() => units.data ?? [], [units.data]);
  const c = useMemo(() => contacts.data ?? [], [contacts.data]);
  const m = useMemo(() => municipal.data ?? [], [municipal.data]);
  const byMuni = analyticsService.byMunicipio(u, c);
  const ages = analyticsService.prdAgeDistribution(m);
  const monthly = analyticsService.monthlyRegistrations(c);

  return (
    <>
      <PageHeader
        title="Analytics demográfico"
        description="Indicadores sobre agregados territoriales, sin inferencias individuales ni políticas. La estructura por edad usa la escala municipal, única donde el censo publica esos rangos."
        actions={
          <Button variant="outline" onClick={() => exportCSV("analytics-municipios", byMuni.map((r) => ({ ...r })))}>
            <Download className="mr-2 h-4 w-4" /> Exportar
          </Button>
        }
      />

      {error && (
        <ErrorState
          error={error}
          what="los datos de analítica"
          onRetry={() => {
            void units.refetch();
            void contacts.refetch();
          }}
        />
      )}

      <div className={`grid gap-4 lg:grid-cols-2 ${error ? "hidden" : ""}`}>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cobertura por municipio</CardTitle>
          </CardHeader>
          <CardContent className="h-80">
            {loading ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byMuni}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="key" fontSize={11} stroke="var(--muted-foreground)" />
                  <YAxis fontSize={11} stroke="var(--muted-foreground)" />
                  <Tooltip />
                  <Bar dataKey="contacts" name="Contactos" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Estructura por edad (agregada)</CardTitle>
          </CardHeader>
          <CardContent className="h-80">
            {municipal.isLoading ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ages}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="range" fontSize={11} stroke="var(--muted-foreground)" />
                  <YAxis fontSize={11} stroke="var(--muted-foreground)" />
                  <Tooltip />
                  <Bar dataKey="value" name="Personas" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Evolución de registros</CardTitle>
          </CardHeader>
          <CardContent className="h-80">
            {loading ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="month" fontSize={11} stroke="var(--muted-foreground)" />
                  <YAxis fontSize={11} stroke="var(--muted-foreground)" />
                  <Tooltip />
                  <Line type="monotone" dataKey="total" stroke="var(--chart-4)" strokeWidth={2} name="Registros" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
