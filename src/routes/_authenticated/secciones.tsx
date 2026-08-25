import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Download, Layers } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState } from "@/components/query-state";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { territoryService } from "@/services/territoryService";
import { contactsService } from "@/services/contactsService";
import { electionsService } from "@/services/electionsService";
import { exportCSV } from "@/lib/export";

export const Route = createFileRoute("/_authenticated/secciones")({
  head: () => ({
    meta: [
      { title: "Secciones territoriales | Territorio Intelligence" },
      {
        name: "description",
        content:
          "Catálogo de secciones territoriales con población, hogares y cobertura administrativa agregada.",
      },
      { property: "og:title", content: "Secciones territoriales | Territorio Intelligence" },
      {
        property: "og:description",
        content: "Explora y exporta el catálogo de unidades territoriales con métricas agregadas.",
      },
    ],
  }),
  component: SeccionesPage,
});

function SeccionesPage() {
  const [search, setSearch] = useState("");
  const units = useQuery({ queryKey: ["units"], queryFn: () => territoryService.list() });
  const contacts = useQuery({ queryKey: ["contacts", {}], queryFn: () => contactsService.list() });

  // La lista nominal no está en el catálogo territorial: llega con cada cómputo
  // electoral, así que se toma del proceso más reciente.
  const listaNominal = useQuery({
    queryKey: ["lista-nominal", 2024],
    queryFn: () => electionsService.listaNominal(2024),
    staleTime: 30 * 60 * 1000,
  });

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of contacts.data ?? []) {
      if (c.section_code) map[c.section_code] = (map[c.section_code] ?? 0) + 1;
    }
    return map;
  }, [contacts.data]);

  const rows = useMemo(
    () =>
      (units.data ?? [])
        .filter(
          (u) =>
            !search ||
            u.section_code.includes(search) ||
            u.municipio.toLowerCase().includes(search.toLowerCase()),
        )
        .map((u) => ({
          seccion: u.section_code,
          municipio: u.municipio,
          listaNominal: listaNominal.data?.[u.section_code] ?? 0,
          poblacion: u.population ?? 0,
          sinCenso: !u.has_demographics,
          hogares: u.households ?? 0,
          contactos: counts[u.section_code] ?? 0,
          cobertura: u.population
            ? (((counts[u.section_code] ?? 0) / u.population) * 100).toFixed(2)
            : "0.00",
        })),
    [units.data, counts, listaNominal.data, search],
  );

  return (
    <>
      <PageHeader
        title="Secciones territoriales"
        description="Catálogo completo de unidades territoriales con indicadores agregados."
        actions={
          <Button variant="outline" onClick={() => exportCSV("secciones", rows)}>
            <Download className="mr-2 h-4 w-4" /> Exportar CSV
          </Button>
        }
      />

      <Card>
        <CardContent className="p-4">
          <Input
            placeholder="Buscar por sección o municipio…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mb-4 max-w-sm"
          />
          {units.isLoading ? (
            <Skeleton className="h-80 w-full" />
          ) : units.isError ? (
            <ErrorState
              error={units.error}
              what="las secciones"
              onRetry={() => void units.refetch()}
            />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={Layers}
              title={
                units.data?.length
                  ? "Ninguna sección coincide con la búsqueda"
                  : "Todavía no hay secciones cargadas"
              }
              description={
                units.data?.length
                  ? "Prueba con otro código de sección o municipio."
                  : "Importa el territorio desde el módulo de importación para empezar."
              }
            />
          ) : (
            <>
            <p className="mb-2 text-xs text-muted-foreground">
              La <strong>lista nominal</strong> es el padrón electoral de 2024. La{" "}
              <strong>cobertura</strong> se calcula sobre la población del censo INE-ECEG 2020,
              que incluye menores; la columna de población se retiró de la vista, pero sigue en
              la exportación a CSV.
            </p>
            <div className="max-h-[600px] overflow-auto rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sección</TableHead>
                    <TableHead>Municipio</TableHead>
                    <TableHead className="text-right">Lista nominal 2024</TableHead>
                    <TableHead className="text-right">Hogares</TableHead>
                    <TableHead className="text-right">Contactos</TableHead>
                    <TableHead className="text-right">Cobertura s/ población</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.seccion}>
                      <TableCell className="font-medium">{r.seccion}</TableCell>
                      <TableCell>{r.municipio}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.listaNominal
                          ? r.listaNominal.toLocaleString("es-MX")
                          : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.hogares.toLocaleString("es-MX")}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{r.contactos}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.cobertura}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
}
