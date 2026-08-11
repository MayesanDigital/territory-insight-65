import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";

import { PageHeader } from "@/components/page-header";
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
import { exportCsv } from "@/lib/export";

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
          localidad: u.localidad ?? "",
          poblacion: u.population ?? 0,
          hogares: u.households ?? 0,
          contactos: counts[u.section_code] ?? 0,
          cobertura: u.population
            ? (((counts[u.section_code] ?? 0) / u.population) * 100).toFixed(2)
            : "0.00",
        })),
    [units.data, counts, search],
  );

  return (
    <>
      <PageHeader
        title="Secciones territoriales"
        description="Catálogo completo de unidades territoriales con indicadores agregados."
        actions={
          <Button variant="outline" onClick={() => exportCsv("secciones", rows)}>
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
          ) : (
            <div className="max-h-[600px] overflow-auto rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sección</TableHead>
                    <TableHead>Municipio</TableHead>
                    <TableHead>Localidad</TableHead>
                    <TableHead className="text-right">Población</TableHead>
                    <TableHead className="text-right">Hogares</TableHead>
                    <TableHead className="text-right">Contactos</TableHead>
                    <TableHead className="text-right">Cobertura</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.seccion}>
                      <TableCell className="font-medium">{r.seccion}</TableCell>
                      <TableCell>{r.municipio}</TableCell>
                      <TableCell className="text-muted-foreground">{r.localidad}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.poblacion.toLocaleString("es-MX")}
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
          )}
        </CardContent>
      </Card>
    </>
  );
}
