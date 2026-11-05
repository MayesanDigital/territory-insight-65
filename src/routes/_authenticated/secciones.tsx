import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { ClientOnly } from "@tanstack/react-router";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { SIN_CONTACTOS, SIN_NOMINAL, type SectionContacts } from "@/components/territory-map";
import type { TerritorialUnit, TerritorialUnitDetailed } from "@/types";

/* El mapa carga aparte: Leaflet y sus estilos pesan más que el resto de la
   pantalla, y quien solo viene a buscar una sección en la tabla no debería
   esperarlo. */
const TerritoryMap = lazy(() => import("@/components/territory-map"));

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
  const [municipio, setMunicipio] = useState("todos");
  const [seleccionada, setSeleccionada] = useState<TerritorialUnit | null>(null);
  const [centrar, setCentrar] = useState<{ id: string; n: number } | null>(null);
  const units = useQuery({ queryKey: ["units"], queryFn: () => territoryService.list() });
  const contacts = useQuery({ queryKey: ["contacts", {}], queryFn: () => contactsService.list() });

  // La lista nominal no está en el catálogo territorial: llega con cada cómputo
  // electoral, así que se toma del proceso más reciente.
  const listaNominal = useQuery({
    queryKey: ["lista-nominal", 2024],
    queryFn: () => electionsService.listaNominal(2024),
    staleTime: 30 * 60 * 1000,
  });

  // Los polígonos solo se piden al acotar por municipio: traer los 1,777 del
  // estado serían unos 15 MB por visita, igual que en el mapa territorial.
  const geometries = useQuery({
    queryKey: ["units", "geometry", municipio],
    queryFn: () => territoryService.listWithGeometry({ municipio }),
    enabled: municipio !== "todos",
  });

  const geometryById = useMemo(() => {
    const map: Record<string, NonNullable<TerritorialUnitDetailed["geometry"]>> = {};
    for (const u of geometries.data ?? []) if (u.geometry) map[u.id] = u.geometry;
    return map;
  }, [geometries.data]);

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of contacts.data ?? []) {
      if (c.section_code) map[c.section_code] = (map[c.section_code] ?? 0) + 1;
    }
    return map;
  }, [contacts.data]);

  // El mapa desglosa la cartera por categoría; la tabla solo necesita el total.
  const carteras = useMemo(() => {
    const map: Record<string, SectionContacts> = {};
    for (const c of contacts.data ?? []) {
      if (!c.section_code) continue;
      const fila = (map[c.section_code] ??= { total: 0, fidelizado: 0, seguro: 0 });
      fila.total += 1;
      if (c.category === "fidelizado") fila.fidelizado += 1;
      else if (c.category === "seguro") fila.seguro += 1;
    }
    return map;
  }, [contacts.data]);

  const municipios = useMemo(
    () => Array.from(new Set((units.data ?? []).map((u) => u.municipio))).sort(),
    [units.data],
  );

  /** Las mismas secciones que lista la tabla, para que el mapa no muestre otras. */
  const visibles = useMemo(
    () =>
      (units.data ?? []).filter(
        (u) =>
          (municipio === "todos" || u.municipio === municipio) &&
          (!search ||
            u.section_code.includes(search) ||
            u.municipio.toLowerCase().includes(search.toLowerCase())),
      ),
    [units.data, municipio, search],
  );

  const rows = useMemo(
    () =>
      visibles.map((u) => ({
        id: u.id,
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
    [visibles, counts, listaNominal.data],
  );

  const dibujables = useMemo(
    () => visibles.filter((u) => u.centroid_lat != null && u.centroid_lng != null).length,
    [visibles],
  );
  const sinUbicacion = visibles.length - dibujables;

  /** Mostrar una sección en el mapa desde la tabla, y al revés. */
  const mostrarEnMapa = (id: string) => {
    const unidad = visibles.find((u) => u.id === id) ?? null;
    setSeleccionada(unidad);
    if (unidad) setCentrar((previo) => ({ id: unidad.id, n: (previo?.n ?? 0) + 1 }));
  };

  return (
    <>
      <PageHeader
        title="Secciones territoriales"
        description="Catálogo completo de unidades territoriales con indicadores agregados."
        actions={
          <Button
            variant="outline"
            onClick={() =>
              // Sin el id: es la llave interna de la base y fuera no significa nada.
              exportCSV(
                "secciones",
                rows.map(({ id: _id, ...fila }) => fila),
              )
            }
          >
            <Download className="mr-2 h-4 w-4" /> Exportar CSV
          </Button>
        }
      />

      <Card className="mb-4">
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Select value={municipio} onValueChange={setMunicipio}>
              <SelectTrigger className="w-[220px]" aria-label="Municipio del mapa">
                <SelectValue placeholder="Municipio" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="todos">Todos los municipios</SelectItem>
                {municipios.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {municipio === "todos" && (
              <span className="text-xs text-muted-foreground">
                Elige un municipio para ver los contornos; así el mapa no carga 15 MB de geometría.
              </span>
            )}
            {geometries.isFetching && (
              <span className="text-xs text-muted-foreground">Cargando contornos…</span>
            )}
            <Badge variant="secondary" className="ml-auto">
              {dibujables.toLocaleString("es-MX")} secciones en el mapa
            </Badge>
            {/* Las secciones creadas en el reseccionamiento no traen coordenada
                en la cartografía de 2021: aparecen en la tabla pero no se
                pueden dibujar, y callarlo haría pensar que faltan datos. */}
            {sinUbicacion > 0 && (
              <span className="text-xs text-muted-foreground">
                {sinUbicacion} {sinUbicacion === 1 ? "sección" : "secciones"} sin ubicación en la
                cartografía
              </span>
            )}
          </div>

          <div className="h-[420px]">
            {units.isLoading ? (
              <Skeleton className="h-full w-full" />
            ) : visibles.length === 0 ? (
              <EmptyState
                icon={Layers}
                title="Ninguna sección que dibujar"
                description="Cambia el municipio o limpia la búsqueda."
                compact
              />
            ) : (
              <ClientOnly fallback={<Skeleton className="h-full w-full" />}>
                <Suspense fallback={<Skeleton className="h-full w-full" />}>
                  <TerritoryMap
                    units={visibles}
                    geometryById={geometryById}
                    contactCounts={carteras}
                    listaNominal={listaNominal.data ?? SIN_NOMINAL}
                    metric="nominal"
                    selectedId={seleccionada?.id ?? null}
                    focusRequest={centrar}
                    onSelect={setSeleccionada}
                  />
                </Suspense>
              </ClientOnly>
            )}
          </div>

          {seleccionada && (
            <p className="text-xs text-muted-foreground">
              Sección <strong>{seleccionada.section_code}</strong> · {seleccionada.municipio} ·{" "}
              {(listaNominal.data?.[seleccionada.section_code] ?? 0).toLocaleString("es-MX")} en
              lista nominal · {(carteras[seleccionada.section_code] ?? SIN_CONTACTOS).total}{" "}
              contactos
            </p>
          )}
        </CardContent>
      </Card>

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
                que incluye menores; la columna de población se retiró de la vista, pero sigue en la
                exportación a CSV.
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
                      <TableRow
                        key={r.seccion}
                        // Pulsar la fila lleva esa sección al mapa de arriba: es
                        // la forma natural de pasar del dato al territorio.
                        onClick={() => mostrarEnMapa(r.id)}
                        className={`cursor-pointer ${
                          seleccionada?.section_code === r.seccion ? "bg-muted" : ""
                        }`}
                      >
                        <TableCell className="font-medium">{r.seccion}</TableCell>
                        <TableCell>{r.municipio}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.listaNominal ? (
                            r.listaNominal.toLocaleString("es-MX")
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
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
