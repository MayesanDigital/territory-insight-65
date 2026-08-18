import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  FileDown,
  FileSpreadsheet,
  Printer,
  Loader2,
  Map as MapIcon,
  Users,
  Radar,
  FileClock,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  buildReport,
  listReports,
  recordReport,
  REPORT_LABELS,
  type ReportType,
} from "@/services/reportService";
import { exportCSV, exportPrintablePDF, exportWorkbook, stamped } from "@/lib/export";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/_authenticated/reportes")({
  head: () => ({
    meta: [
      { title: "Reportes | Territorio Intelligence" },
      {
        name: "description",
        content: "Genera reportes territoriales, de contactos y de monitoreo en PDF, CSV o XLSX.",
      },
      { property: "og:title", content: "Reportes | Territorio Intelligence" },
      {
        property: "og:description",
        content: "Exporta indicadores agregados de cobertura, demografía y presencia pública.",
      },
    ],
  }),
  component: ReportesPage,
});

const TYPES: Array<{ type: ReportType; icon: typeof MapIcon }> = [
  { type: "territorial", icon: MapIcon },
  { type: "contactos", icon: Users },
  { type: "monitoreo", icon: Radar },
];

type Format = "pdf" | "csv" | "xlsx";

function ReportesPage() {
  const qc = useQueryClient();
  const { orgId } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);

  const history = useQuery({ queryKey: ["reports"], queryFn: listReports });
  const organization = useQuery({
    queryKey: ["organization", orgId],
    queryFn: async () => {
      const { data } = await supabase.from("organizations").select("name").eq("id", orgId!).single();
      return data?.name ?? null;
    },
    enabled: !!orgId,
  });

  const generate = useMutation({
    mutationFn: async ({ type, format }: { type: ReportType; format: Format }) => {
      const report = await buildReport(type, organization.data ?? undefined);
      const filename = stamped(`reporte-${type}`);

      if (format === "pdf") {
        exportPrintablePDF(report.meta, report.sections);
      } else if (format === "xlsx") {
        // Una hoja por apartado: mantiene juntas las tablas del reporte sin
        // aplanarlas en un único listado ilegible.
        exportWorkbook(
          filename,
          report.sections.map((s) => ({ name: s.heading, rows: s.rows })),
        );
      } else {
        // CSV es un formato de tabla única, así que se exporta el apartado
        // principal; los demás quedan disponibles en XLSX.
        const main = report.sections.find((s) => s.rows.length > 0) ?? report.sections[0]!;
        exportCSV(filename, main.rows);
      }

      if (orgId) await recordReport(orgId, type, format, { sections: report.sections.length });
      return { type, format };
    },
    onMutate: ({ type, format }) => setBusy(`${type}-${format}`),
    onSettled: () => setBusy(null),
    onSuccess: ({ format }) => {
      qc.invalidateQueries({ queryKey: ["reports"] });
      toast.success(
        format === "pdf"
          ? "Reporte abierto: elige «Guardar como PDF» en el diálogo de impresión"
          : `Reporte ${format.toUpperCase()} descargado`,
      );
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader
        title="Reportes"
        description="Los archivos contienen agregados territoriales y registros administrativos. No incluyen inferencias políticas ni individuales."
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {TYPES.map(({ type, icon: Icon }) => (
          <Card key={type}>
            <CardHeader>
              <div className="mb-2 flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <CardTitle className="text-base">{REPORT_LABELS[type].title}</CardTitle>
              <p className="text-sm text-muted-foreground">{REPORT_LABELS[type].description}</p>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {(["pdf", "xlsx", "csv"] as Format[]).map((format) => {
                const key = `${type}-${format}`;
                const isBusy = busy === key;
                return (
                  <Button
                    key={format}
                    size="sm"
                    variant={format === "pdf" ? "default" : "outline"}
                    disabled={!!busy}
                    onClick={() => generate.mutate({ type, format })}
                  >
                    {isBusy ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : format === "pdf" ? (
                      <Printer className="mr-2 h-4 w-4" />
                    ) : format === "xlsx" ? (
                      <FileSpreadsheet className="mr-2 h-4 w-4" />
                    ) : (
                      <FileDown className="mr-2 h-4 w-4" />
                    )}
                    {format.toUpperCase()}
                  </Button>
                );
              })}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileClock className="h-4 w-4" /> Reportes generados
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Queda constancia de cada generación —tipo, formato y momento— para efectos de auditoría.
            El archivo no se almacena.
          </p>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {history.isLoading && <Skeleton className="h-24 w-full" />}
          {history.data?.length === 0 && !history.isLoading && (
            <p className="text-muted-foreground">Todavía no se ha generado ningún reporte.</p>
          )}
          {(history.data ?? []).map((r) => (
            <div
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2 last:border-0"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{r.name}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(r.created_at).toLocaleString("es-MX")}
                </p>
              </div>
              <Badge variant="secondary">{r.format.toUpperCase()}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}
