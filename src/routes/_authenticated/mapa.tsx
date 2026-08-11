import { lazy, Suspense, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ClientOnly } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";

import { PageHeader } from "@/components/page-header";
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
import { territoryService } from "@/services/territoryService";
import { contactsService } from "@/services/contactsService";
import type { TerritorialUnit } from "@/types";
import type { MapMetric } from "@/components/territory-map";

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

  const units = useQuery({ queryKey: ["units"], queryFn: () => territoryService.list() });
  const contacts = useQuery({ queryKey: ["contacts", {}], queryFn: () => contactsService.list() });

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of contacts.data ?? []) {
      if (!c.section_code) continue;
      map[c.section_code] = (map[c.section_code] ?? 0) + 1;
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
            <Badge variant="secondary" className="ml-auto">
              {filtered.length} secciones
            </Badge>
          </CardHeader>
          <CardContent className="h-[560px] p-3 pt-0">
            {units.isLoading ? (
              <Skeleton className="h-full w-full" />
            ) : (
              <ClientOnly fallback={<Skeleton className="h-full w-full" />}>
                <Suspense fallback={<Skeleton className="h-full w-full" />}>
                  <TerritoryMap
                    units={filtered}
                    contactCounts={counts}
                    metric={metric}
                    selectedId={selected?.id ?? null}
                    onSelect={setSelected}
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
                <Row label="Contactos" value={String(counts[selected.section_code] ?? 0)} />
                <div className="pt-2">
                  <p className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">
                    Estructura por edad
                  </p>
                  <Row label="0–17" value={selected.pop_0_17.toLocaleString("es-MX")} />
                  <Row label="18–29" value={selected.pop_18_29.toLocaleString("es-MX")} />
                  <Row label="30–44" value={selected.pop_30_44.toLocaleString("es-MX")} />
                  <Row label="45–59" value={selected.pop_45_59.toLocaleString("es-MX")} />
                  <Row label="60+" value={selected.pop_60_plus.toLocaleString("es-MX")} />
                </div>
                <div className="pt-2">
                  <p className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">
                    Género (agregado)
                  </p>
                  <Row label="Mujeres" value={selected.women.toLocaleString("es-MX")} />
                  <Row label="Hombres" value={selected.men.toLocaleString("es-MX")} />
                  <Row label="Otro / N.E." value={selected.gender_other.toLocaleString("es-MX")} />
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
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
