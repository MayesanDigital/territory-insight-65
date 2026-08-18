import { lazy, Suspense, useCallback, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ClientOnly } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Map as MapIcon, UserPlus } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState } from "@/components/query-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ContactFormDialog } from "@/components/contact-form-dialog";
import { SectionElectionComparison } from "@/components/section-election-comparison";
import { SectionContactBreakdown } from "@/components/section-contact-breakdown";
import { territoryService } from "@/services/territoryService";
import { contactsService } from "@/services/contactsService";
import { useAuth } from "@/hooks/useAuth";
import { CENSUS_DISPLAY_LABEL, type TerritorialUnit, type TerritorialUnitDetailed } from "@/types";
import type { MapMetric, SectionContacts } from "@/components/territory-map";
import { SIN_CONTACTOS } from "@/components/territory-map";

const TerritoryMap = lazy(() => import("@/components/territory-map"));

export const Route = createFileRoute("/_authenticated/mapa")({
  head: () => ({
    meta: [
      { title: "Mapa territorial | Territorio Intelligence" },
      {
        name: "description",
        content:
          "Mapa interactivo por secciones con capas de población, hogares y cobertura administrativa agregada.",
      },
      { property: "og:title", content: "Mapa territorial | Territorio Intelligence" },
      {
        property: "og:description",
        content: "Visualiza secciones territoriales y métricas agregadas sobre un mapa Leaflet.",
      },
    ],
  }),
  component: MapaPage,
});

const METRICS: Array<{ value: MapMetric; label: string }> = [
  { value: "population", label: "Población" },
  { value: "contacts", label: "Contactos registrados" },
  { value: "coverage", label: "Cobertura (%)" },
  { value: "density", label: "Personas por hogar" },
];

function MapaPage() {
  const [metric, setMetric] = useState<MapMetric>("population");
  const [municipio, setMunicipio] = useState("todos");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<TerritorialUnit | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formUnit, setFormUnit] = useState<TerritorialUnit | null>(null);
  const { canAdmin } = useAuth();

  // Registrar desde el mapa ahorra teclear sección y municipio, que es
  // justamente el contexto que el usuario ya eligió al hacer clic.
  const openForm = useCallback((unit: TerritorialUnit) => {
    setSelected(unit);
    setFormUnit(unit);
    setFormOpen(true);
  }, []);

  // Catálogo ligero: todas las secciones con centroide, sin polígonos.
  const units = useQuery({ queryKey: ["units"], queryFn: () => territoryService.list() });

  // Los polígonos se piden solo al acotar por municipio. Con 1,777 secciones y
  // 380 mil vértices, cargarlos todos serían unos 15 MB por visita al mapa.
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

  const contacts = useQuery({ queryKey: ["contacts", {}], queryFn: () => contactsService.list() });

  // Conteo por sección desglosado por categoría de seguimiento. Los contactos
  // dados de alta antes de que existiera el campo no suman a ninguna categoría,
  // pero sí al total; por eso se cuentan por separado.
  const counts = useMemo(() => {
    const map: Record<string, SectionContacts> = {};
    for (const c of contacts.data ?? []) {
      if (!c.section_code) continue;
      const row = (map[c.section_code] ??= { total: 0, fidelizado: 0, seguro: 0 });
      row.total += 1;
      if (c.category === "fidelizado") row.fidelizado += 1;
      else if (c.category === "seguro") row.seguro += 1;
    }
    return map;
  }, [contacts.data]);

  const municipios = useMemo(
    () => Array.from(new Set((units.data ?? []).map((u) => u.municipio))).sort(),
    [units.data],
  );

  const filtered = useMemo(
    () =>
      (units.data ?? []).filter(
        (u) =>
          (municipio === "todos" || u.municipio === municipio) &&
          (!search || u.section_code.includes(search) || u.municipio.toLowerCase().includes(search.toLowerCase())),
      ),
    [units.data, municipio, search],
  );

  return (
    <>
      <PageHeader
        title="Mapa territorial"
        description="Capas temáticas por sección. Toda la información demográfica se muestra agregada; nunca se representan personas individuales."
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card className="overflow-hidden">
          <CardHeader className="flex flex-row flex-wrap items-center gap-3 space-y-0">
            <Select value={metric} onValueChange={(v) => setMetric(v as MapMetric)}>
              <SelectTrigger className="w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {METRICS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={municipio} onValueChange={setMunicipio}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Municipio" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos los municipios</SelectItem>
                {municipios.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="Buscar sección…"
              className="w-[180px]"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="ml-auto flex items-center gap-2">
              {municipio === "todos" && (
                <span className="text-xs text-muted-foreground">
                  Elige un municipio para ver los polígonos
                </span>
              )}
              {geometries.isFetching && (
                <span className="text-xs text-muted-foreground">Cargando geometrías…</span>
              )}
              <Badge variant="secondary">{filtered.length} secciones</Badge>
            </div>
          </CardHeader>
          <CardContent className="h-[560px] p-3 pt-0">
            {units.isLoading ? (
              <Skeleton className="h-full w-full" />
            ) : units.isError ? (
              <ErrorState
                error={units.error}
                what="el territorio"
                onRetry={() => void units.refetch()}
              />
            ) : filtered.length === 0 ? (
              <EmptyState
                icon={MapIcon}
                title={
                  units.data?.length
                    ? "Ninguna sección coincide con el filtro"
                    : "Todavía no hay territorio cargado"
                }
                description={
                  units.data?.length
                    ? "Cambia el municipio o limpia la búsqueda."
                    : "Importa las secciones territoriales para dibujar el mapa."
                }
              />
            ) : (
              <ClientOnly fallback={<Skeleton className="h-full w-full" />}>
                <Suspense fallback={<Skeleton className="h-full w-full" />}>
                  <TerritoryMap
                    units={filtered}
                    geometryById={geometryById}
                    contactCounts={counts}
                    metric={metric}
                    selectedId={selected?.id ?? null}
                    onSelect={setSelected}
                    onAddContact={openForm}
                    canAddContact={canAdmin}
                  />
                </Suspense>
              </ClientOnly>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {selected ? `Sección ${selected.section_code}` : "Detalle de sección"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {!selected && (
              <p className="text-muted-foreground">
                Selecciona una sección en el mapa para ver su perfil demográfico agregado.
              </p>
            )}
            {selected && (
              <>
                <Row label="Municipio" value={selected.municipio} />
                <Row label="Localidad" value={selected.localidad ?? "—"} />
                <Row
                  label="Población"
                  value={(selected.population ?? 0).toLocaleString("es-MX")}
                />
                <Row label="Hogares" value={(selected.households ?? 0).toLocaleString("es-MX")} />
                <Row
                  label="Contactos"
                  value={String((counts[selected.section_code] ?? SIN_CONTACTOS).total)}
                />
                <Row
                  label="Cobertura"
                  value={`${
                    selected.population
                      ? (
                          ((counts[selected.section_code] ?? SIN_CONTACTOS).total /
                            selected.population) *
                          100
                        ).toFixed(2)
                      : "0.00"
                  }%`}
                />

                <SectionContactBreakdown counts={counts[selected.section_code] ?? SIN_CONTACTOS} />

                <SectionElectionComparison sectionCode={selected.section_code} />

                {canAdmin && (
                  <Button className="w-full" size="sm" onClick={() => openForm(selected)}>
                    <UserPlus className="mr-2 h-4 w-4" /> Registrar contacto aquí
                  </Button>
                )}
                {selected.has_demographics && (
                  <>
                    <div className="pt-3">
                      <p className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">
                        Estructura por edad
                      </p>
                      <div className="space-y-1.5">
                        <DistBar
                          label="0–17"
                          value={selected.pop_0_17}
                          total={selected.population}
                          color="#A8763E"
                        />
                        <DistBar
                          label="18–24"
                          value={selected.pop_18_24}
                          total={selected.population}
                          color="#C79E5E"
                        />
                        <DistBar
                          label="25–59"
                          value={selected.pop_25_59}
                          total={selected.population}
                          color="#8B6B3E"
                        />
                        <DistBar
                          label="60+"
                          value={selected.pop_60_plus}
                          total={selected.population}
                          color="#7A4E23"
                        />
                      </div>
                    </div>

                    <div className="pt-3">
                      <p className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">
                        Género (agregado)
                      </p>
                      {/* Una sola barra apilada: el reparto entre dos categorías
                          se lee mejor comparándolas que en barras separadas. */}
                      <div className="flex h-6 w-full overflow-hidden rounded-md">
                        <div
                          className="flex items-center justify-center text-[10px] font-medium text-white"
                          style={{
                            width: `${percent(selected.women, selected.population)}%`,
                            backgroundColor: "#7A2E2E",
                          }}
                        >
                          {percent(selected.women, selected.population)}%
                        </div>
                        <div
                          className="flex items-center justify-center text-[10px] font-medium text-white"
                          style={{
                            width: `${percent(selected.men, selected.population)}%`,
                            backgroundColor: "#4A5D6B",
                          }}
                        >
                          {percent(selected.men, selected.population)}%
                        </div>
                      </div>
                      <div className="mt-2 space-y-1">
                        <DistBar
                          label="Mujeres"
                          value={selected.women}
                          total={selected.population}
                          color="#7A2E2E"
                        />
                        <DistBar
                          label="Hombres"
                          value={selected.men}
                          total={selected.population}
                          color="#4A5D6B"
                        />
                        {selected.gender_other > 0 && (
                          <DistBar
                            label="Otro / N.E."
                            value={selected.gender_other}
                            total={selected.population}
                            color="#9A9A9A"
                          />
                        )}
                      </div>
                    </div>

                    <div className="pt-3">
                      <p className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">
                        Indicadores derivados
                      </p>
                      <Row
                        label="Personas por hogar"
                        value={
                          selected.households
                            ? (selected.population / selected.households).toFixed(2)
                            : "—"
                        }
                      />
                      <Row
                        label="Mujeres por cada 100 hombres"
                        value={selected.men ? Math.round((selected.women / selected.men) * 100).toString() : "—"}
                      />
                      <Row
                        label="Población adulta (18+)"
                        value={`${selected.adults_18_plus.toLocaleString("es-MX")} · ${percent(
                          selected.adults_18_plus,
                          selected.population,
                        )}%`}
                      />
                    </div>
                  </>
                )}
                {/* La procedencia del dato (fuente y año) sigue almacenada en
                    demographics; solo se retiró de la interfaz a petición. */}
                <div className="space-y-1 pt-3 text-xs text-muted-foreground">
                  {selected.section_type && (
                    <p>
                      Tipo de sección: <span className="font-medium">{selected.section_type}</span>
                      {selected.district !== null && ` · Distrito federal ${selected.district}`}
                    </p>
                  )}
                  {selected.has_demographics && <p>{CENSUS_DISPLAY_LABEL}</p>}
                  {!selected.has_demographics && (
                    <p className="text-destructive">
                      Sin datos censales: sección creada en el reseccionamiento posterior al censo.
                    </p>
                  )}
                  {selected.data_status === "census_only" && (
                    <p className="text-destructive">
                      Sección extinta: ya no aparece en el catálogo vigente del INE.
                    </p>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <ContactFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        municipios={municipios}
        defaults={{
          section_code: formUnit?.section_code ?? "",
          municipio: formUnit?.municipio ?? "",
        }}
      />
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border/60 py-1 last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}

function percent(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

/** Barra proporcional con etiqueta, conteo y porcentaje. */
function DistBar({
  label,
  value,
  total,
  color,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
}) {
  const p = percent(value, total);
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 shrink-0 text-xs text-muted-foreground">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full" style={{ width: `${p}%`, backgroundColor: color }} />
      </div>
      <span className="w-24 shrink-0 text-right text-xs tabular-nums">
        {value.toLocaleString("es-MX")} <span className="text-muted-foreground">{p}%</span>
      </span>
    </div>
  );
}
