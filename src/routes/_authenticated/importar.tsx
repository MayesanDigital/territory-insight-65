import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Upload } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parseCSV } from "@/lib/export";
import { territoryService } from "@/services/territoryService";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/_authenticated/importar")({
  head: () => ({
    meta: [
      { title: "Importar datos | Territorio Intelligence" },
      {
        name: "description",
        content: "Carga masiva de unidades territoriales con demografía agregada desde archivos CSV.",
      },
      { property: "og:title", content: "Importar datos | Territorio Intelligence" },
      {
        property: "og:description",
        content: "Importa secciones territoriales y sus indicadores agregados vía CSV.",
      },
    ],
  }),
  component: ImportarPage,
});

function ImportarPage() {
  const { orgId, canWrite } = useAuth();
  const [rows, setRows] = useState<Array<Record<string, string>>>([]);
  const [busy, setBusy] = useState(false);

  const onFile = async (file: File) => {
    const text = await file.text();
    setRows(parseCSV(text));
  };

  const importar = async () => {
    if (!orgId) {
      toast.error("Sin organización asignada");
      return;
    }
    setBusy(true);
    try {
      const payload = rows.map((r) => ({
        section_code: r["section_code"] ?? "",
        municipio: r["municipio"] ?? "",
        localidad: r["localidad"] ?? null,
        population: Number(r["population"] ?? 0),
        households: Number(r["households"] ?? 0),
      }));
      const count = await territoryService.importUnits(payload, orgId);
      toast.success(`${count} secciones importadas`);
      setRows([]);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Importar datos"
        description="Carga secciones territoriales con indicadores agregados. Columnas: section_code, municipio, localidad, population, households."
      />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Archivo CSV</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            type="file"
            accept=".csv"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
            }}
          />
          {rows.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {rows.length} filas listas para importar.
            </p>
          )}
          <Button onClick={importar} disabled={!canWrite || busy || rows.length === 0}>
            <Upload className="mr-2 h-4 w-4" /> {busy ? "Importando…" : "Importar"}
          </Button>
        </CardContent>
      </Card>
    </>
  );
}
