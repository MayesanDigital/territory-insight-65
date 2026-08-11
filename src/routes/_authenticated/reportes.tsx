import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { FileDown, FileJson, FileSpreadsheet, Printer } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { territoryService } from "@/services/territoryService";
import { contactsService } from "@/services/contactsService";
import { analyticsService } from "@/services/analyticsService";
import { exportCSV, exportExcel, exportJSON, exportPrintablePDF } from "@/lib/export";

export const Route = createFileRoute("/_authenticated/reportes")({
  head: () => ({
    meta: [
      { title: "Reportes | Territorio Intelligence" },
      {
        name: "description",
        content: "Genera reportes territoriales agregados en CSV, Excel, JSON o PDF imprimible.",
      },
      { property: "og:title", content: "Reportes | Territorio Intelligence" },
      {
        property: "og:description",
        content: "Exporta indicadores agregados de cobertura y demografía territorial.",
      },
    ],
  }),
  component: ReportesPage,
});

function ReportesPage() {
  const units = useQuery({ queryKey: ["units"], queryFn: () => territoryService.list() });
  const contacts = useQuery({ queryKey: ["contacts", {}], queryFn: () => contactsService.list() });

  const u = units.data ?? [];
  const c = contacts.data ?? [];
  const rows = analyticsService.byMunicipio(u, c).map((r) => ({ ...r }));
  const ages = analyticsService.ageDistribution(u).map((r) => ({ ...r }));

  return (
    <>
      <PageHeader
        title="Reportes"
        description="Exporta agregados territoriales y demográficos. Los archivos no incluyen inferencias políticas."
      />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Reporte de cobertura por municipio</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => exportCSV("reporte-cobertura", rows)}>
            <FileDown className="mr-2 h-4 w-4" /> CSV
          </Button>
          <Button variant="outline" onClick={() => exportExcel("reporte-cobertura", rows)}>
            <FileSpreadsheet className="mr-2 h-4 w-4" /> Excel
          </Button>
          <Button variant="outline" onClick={() => exportJSON("reporte-cobertura", rows)}>
            <FileJson className="mr-2 h-4 w-4" /> JSON
          </Button>
          <Button
            onClick={() =>
              exportPrintablePDF("Reporte territorial agregado", [
                { heading: "Cobertura por municipio", rows },
                { heading: "Estructura por edad", rows: ages },
              ])
            }
          >
            <Printer className="mr-2 h-4 w-4" /> PDF imprimible
          </Button>
        </CardContent>
      </Card>
    </>
  );
}
