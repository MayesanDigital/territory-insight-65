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
import { SectionTeamBreakdown } from "@/components/section-team-breakdown";
import { PovertySectionFilter } from "@/components/poverty-section-filter";
import { SectionPovertyDetail } from "@/components/section-poverty-detail";
import { territoryService } from "@/services/territoryService";
import { contactsService } from "@/services/contactsService";
import { electionsService, resumePartido } from "@/services/electionsService";
import { campaignService } from "@/services/campaignService";
import { claveMunicipio, povertyService, type PobrezaSeccion } from "@/services/povertyService";
import { colorPartido, PARTIDOS } from "@/services/strategyService";
import type {
  ResumenPartido as ResumenPartidoDatos,
  VotosPartidoSeccion,
} from "@/services/electionsService";
import { useAuth } from "@/hooks/useAuth";
import { CENSUS_DISPLAY_LABEL, type TerritorialUnit, type TerritorialUnitDetailed } from "@/types";
import type { MapHighlight, MapMetric, SectionContacts } from "@/components/territory-map";
import { SIN_CONTACTOS, SIN_NOMINAL, SIN_VOTOS_PARTIDO } from "@/components/territory-map";

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
  { value: "nominal", label: "Lista nominal" },
  { value: "households", label: "Hogares" },
  { value: "contacts", label: "Contactos registrados" },
  { value: "coverage", label: "Cobertura (%)" },
  { value: "density", label: "Personas por hogar" },
  { value: "poverty", label: "Nivel de pobreza" },
];

/** Valor del selector de partido cuando no se resalta a ninguno. */
const SIN_PARTIDO = "__ninguno__";

/** Elección que se compara en el mapa: la municipal más reciente cargada. */
const ELECCION = { año: 2024, tipo: "ayuntamiento" } as const;

function MapaPage() {
  const [metric, setMetric] = useState<MapMetric>("population");
  const [municipio, setMunicipio] = useState("todos");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<TerritorialUnit | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formUnit, setFormUnit] = useState<TerritorialUnit | null>(null);
  const [seccionPobreza, setSeccionPobreza] = useState<string | null>(null);
  const [partido, setPartido] = useState(SIN_PARTIDO);
  const [focusRequest, setFocusRequest] = useState<{ id: string; n: number } | null>(null);
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

  // Contactos de la sección seleccionada, para el desglose por equipo.
  const contactosSeccion = useMemo(
    () =>
      selected ? (contacts.data ?? []).filter((c) => c.section_code === selected.section_code) : [],
    [contacts.data, selected],
  );

  // Ganador de la última municipal y metas fijadas: alimentan el popup para que
  // muestre lo mismo que la ficha lateral. Se piden una vez para todo el mapa;
  // pedirlos por sección al abrir cada popup sería un viaje de red por clic.
  const winners = useQuery({
    queryKey: ["ganadores", 2024, "ayuntamiento"],
    queryFn: () => electionsService.ganadores(2024, "ayuntamiento"),
    staleTime: 30 * 60 * 1000,
  });

  const goals = useQuery({
    queryKey: ["metas"],
    queryFn: () => campaignService.listGoals(),
  });

  // Lista nominal por sección: es el padrón que llega con cada cómputo, no un
  // dato del catálogo territorial, así que se toma de la elección más reciente.
  const listaNominal = useQuery({
    queryKey: ["lista-nominal", ELECCION.año],
    queryFn: () => electionsService.listaNominal(ELECCION.año),
    staleTime: 30 * 60 * 1000,
  });

  // Secciones que ganó el partido elegido, para pintarlas con su color. Sale de
  // los mismos ganadores que ya alimentan el popup, así que no cuesta otra
  // consulta: lo que se compara son las siglas del bloque, no su etiqueta,
  // porque "PAN-PRD-PRI" y "PAN" son el mismo partido en municipios distintos.
  const resalte = useMemo<MapHighlight | null>(() => {
    if (partido === SIN_PARTIDO) return null;
    const ganadores = winners.data ?? {};
    const ganadas = new Set<string>();
    const conResultado = new Set<string>();
    let etiqueta = `Ayuntamiento ${ELECCION.año}`;
    for (const [seccion, g] of Object.entries(ganadores)) {
      conResultado.add(seccion);
      if (g.etiqueta) etiqueta = g.etiqueta;
      if (g.partidos?.includes(partido)) ganadas.add(seccion);
    }
    return {
      siglas: partido,
      nombre: PARTIDOS.find((p) => p.siglas === partido)?.nombre ?? partido,
      color: colorPartido(partido),
      etiqueta,
      ganadas,
      conResultado,
    };
  }, [partido, winners.data]);

  // Desglose de votos del partido, sección por sección: su columna propia, las
  // combinaciones donde aparece y el total del bloque que lo llevó. Se pide una
  // vez por partido y sirve para el resumen y para la ficha de cada sección.
  const votosPartido = useQuery({
    queryKey: ["votos-partido", partido, ELECCION.tipo, ELECCION.año],
    queryFn: () => electionsService.votosPorSeccion(partido, ELECCION.tipo, ELECCION.año),
    enabled: partido !== SIN_PARTIDO,
    staleTime: 30 * 60 * 1000,
  });

  /**
   * Secciones del ámbito elegido, para sumar el resumen sobre ellas.
   *
   * Se usa el municipio y no el texto buscado: el resumen responde a "cómo le
   * fue al partido aquí", y recalcularlo mientras se teclea una búsqueda daría
   * una cifra distinta en cada pulsación.
   */
  const seccionesAmbito = useMemo(() => {
    if (municipio === "todos") return undefined;
    return new Set(
      (units.data ?? []).filter((u) => u.municipio === municipio).map((u) => u.section_code),
    );
  }, [units.data, municipio]);

  const resumen = useMemo(() => {
    const filas = votosPartido.data;
    if (!filas) return null;
    const total = resumePartido(Object.values(filas), seccionesAmbito);
    return total.seccionesConResultado > 0 ? total : null;
  }, [votosPartido.data, seccionesAmbito]);

  // Índice de pobreza por sección (ya viene de la más pobre a la menos) y
  // pobreza oficial por municipio. Son datos de referencia que no cambian.
  const pobreza = useQuery({
    queryKey: ["pobreza", "secciones"],
    queryFn: () => povertyService.listSecciones(),
    staleTime: 60 * 60 * 1000,
  });
  const pobrezaMunicipal = useQuery({
    queryKey: ["pobreza", "municipios"],
    queryFn: () => povertyService.listMunicipios(),
    staleTime: 60 * 60 * 1000,
  });

  const pobrezaPorSeccion = useMemo(() => {
    const map: Record<string, PobrezaSeccion> = {};
    for (const p of pobreza.data ?? []) map[p.section_code] = p;
    return map;
  }, [pobreza.data]);

  const municipioDe = useMemo(() => {
    const map: Record<string, string> = {};
    for (const u of units.data ?? []) map[u.section_code] = u.municipio;
    return map;
  }, [units.data]);

  // Elegir una sección en el filtro de pobreza acota al municipio (para tener
  // su polígono), la selecciona, cambia la capa a pobreza y centra el mapa.
  const elegirSeccionPobreza = useCallback(
    (code: string | null) => {
      setSeccionPobreza(code);
      if (!code) return;
      const unit = (units.data ?? []).find((u) => u.section_code === code);
      if (!unit) return;
      setSearch("");
      setMunicipio(unit.municipio);
      setMetric("poverty");
      setSelected(unit);
      setFocusRequest((prev) => ({ id: unit.id, n: (prev?.n ?? 0) + 1 }));
    },
    [units.data],
  );

  const cambiarMunicipio = (m: string) => {
    setMunicipio(m);
    // La sección elegida por pobreza deja de tener sentido fuera de su municipio.
    if (seccionPobreza && m !== "todos" && municipioDe[seccionPobreza] !== m)
      setSeccionPobreza(null);
  };

  const municipios = useMemo(
    () => Array.from(new Set((units.data ?? []).map((u) => u.municipio))).sort(),
    [units.data],
  );

  const filtered = useMemo(
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
            <Select value={municipio} onValueChange={cambiarMunicipio}>
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
            <Select value={partido} onValueChange={setPartido}>
              <SelectTrigger className="w-[190px]" aria-label="Resaltar partido ganador">
                <SelectValue placeholder="Partido ganador" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SIN_PARTIDO}>Sin partido</SelectItem>
                {PARTIDOS.map((p) => (
                  <SelectItem key={p.siglas} value={p.siglas}>
                    <span className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-sm border border-black/10"
                        style={{ backgroundColor: colorPartido(p.siglas) }}
                      />
                      {p.nombre}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <PovertySectionFilter
              secciones={pobreza.data ?? []}
              municipioDe={municipioDe}
              municipio={municipio}
              value={seccionPobreza}
              onChange={elegirSeccionPobreza}
              loading={pobreza.isLoading || units.isLoading}
            />
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

          {resalte && (
            <ResumenPartido
              nombre={resalte.nombre}
              color={resalte.color}
              ambito={municipio === "todos" ? "todo el estado" : municipio}
              etiqueta={resalte.etiqueta}
              resumen={resumen}
              cargando={votosPartido.isLoading}
            />
          )}

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
                    winners={winners.data ?? {}}
                    goals={goals.data ?? {}}
                    metric={metric}
                    poverty={pobrezaPorSeccion}
                    listaNominal={listaNominal.data ?? SIN_NOMINAL}
                    highlight={resalte}
                    partyVotes={votosPartido.data ?? SIN_VOTOS_PARTIDO}
                    focusRequest={focusRequest}
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
                <Row label="Población" value={(selected.population ?? 0).toLocaleString("es-MX")} />
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

                <SectionPovertyDetail
                  pobreza={pobrezaPorSeccion[selected.section_code]}
                  total={pobreza.data?.length ?? 0}
                  municipal={pobrezaMunicipal.data?.[claveMunicipio(selected.municipio)]}
                />

                <SectionContactBreakdown
                  counts={counts[selected.section_code] ?? SIN_CONTACTOS}
                  sectionCode={selected.section_code}
                />

                <SectionTeamBreakdown
                  contactos={contactosSeccion}
                  sectionCode={selected.section_code}
                />

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
                        value={
                          selected.men
                            ? Math.round((selected.women / selected.men) * 100).toString()
                            : "—"
                        }
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

const fmt = (n: number) => n.toLocaleString("es-MX");

/**
 * Lo que logró el partido resaltado, con los votos desglosados.
 *
 * Va junto a los filtros y no en la ficha lateral porque responde a la
 * selección, no a la sección que se esté viendo, y se mueve con el municipio.
 *
 * Las tres cifras se muestran separadas a propósito. Antes se publicaba una
 * sola —la del bloque— y eso le adjudicaba al partido los votos de su aliado:
 * el PVEM aparecía con 200,780 votos en los ayuntamientos de 2024 cuando su
 * columna propia suma 40,683. Las tres son ciertas, pero responden a preguntas
 * distintas y mezclarlas convierte el dato en una cifra inservible.
 */
function ResumenPartido({
  nombre,
  color,
  ambito,
  etiqueta,
  resumen,
  cargando,
}: {
  nombre: string;
  color: string;
  ambito: string;
  etiqueta: string;
  resumen: ResumenPartidoDatos | null;
  cargando: boolean;
}) {
  const pct = (parte: number, total: number) =>
    total > 0 ? Math.round((parte / total) * 1000) / 10 : 0;

  const hayCoalicion = (resumen?.seccionesEnCoalicion ?? 0) > 0;
  // Lo que en el bloque no salió ni de la columna propia ni de las
  // combinaciones es, por definición, voto de los aliados.
  const deAliados = resumen
    ? Math.max(0, resumen.bloqueVotos - resumen.propios - resumen.coalicion)
    : 0;

  return (
    <div className="mx-4 mb-3 rounded-md border border-border bg-muted/40 p-3 sm:mx-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="flex items-center gap-2 font-medium">
          <span
            className="h-3 w-3 shrink-0 rounded-sm border border-black/20"
            style={{ backgroundColor: color }}
          />
          <span translate="no">{nombre}</span>
        </span>
        {cargando && <span className="text-sm text-muted-foreground">Contando votos…</span>}
        {!cargando && resumen && (
          <>
            <span className="text-sm">
              <span className="font-display text-lg font-semibold tabular-nums">
                {fmt(resumen.seccionesGanadas)}
              </span>{" "}
              <span className="text-muted-foreground">
                de {fmt(resumen.seccionesConResultado)} secciones ganadas (
                {pct(resumen.seccionesGanadas, resumen.seccionesConResultado)}%)
              </span>
            </span>
            <span className="text-xs text-muted-foreground sm:ml-auto">
              {etiqueta} · {ambito}
            </span>
          </>
        )}
        {!cargando && !resumen && (
          <span className="text-sm text-muted-foreground">
            Sin cómputos cargados para este ámbito.
          </span>
        )}
      </div>

      {!cargando && resumen && (
        <>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <CifraVoto
              titulo="Votos propios"
              detalle="Su columna en el acta"
              votos={resumen.propios}
              porcentaje={pct(resumen.propios, resumen.votosEmitidos)}
              color={color}
              destacada
            />
            <CifraVoto
              titulo="Votos en coalición"
              detalle={
                hayCoalicion
                  ? "Boletas marcando a varios aliados"
                  : "No concurrió en coalición en este ámbito"
              }
              votos={resumen.coalicion}
              porcentaje={pct(resumen.coalicion, resumen.votosEmitidos)}
              color="#8A8A8A"
              compartida
            />
            <CifraVoto
              titulo="Total del bloque"
              detalle={
                hayCoalicion
                  ? `Incluye ${fmt(deAliados)} de los aliados`
                  : "Compitió solo: igual a su columna"
              }
              votos={resumen.bloqueVotos}
              porcentaje={pct(resumen.bloqueVotos, resumen.votosEmitidos)}
              color="#B9AFA0"
            />
          </div>

          <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
            <strong>Votos propios</strong> son los de la columna de{" "}
            <span translate="no">{nombre}</span>: voto exclusivo suyo. Los{" "}
            <strong>votos en coalición</strong> se emitieron marcando a varios aliados en la misma
            boleta, cuentan para la alianza y la ley los reparte entre sus integrantes, así que no
            son suyos en exclusiva. El <strong>total del bloque</strong> es la cifra que decide
            quién ganó la sección y suma las columnas de todos los aliados; por eso no se pueden
            sumar los totales de dos partidos coaligados.
            {hayCoalicion &&
              ` ${nombre} fue en coalición en ${fmt(resumen.seccionesEnCoalicion)} de ${fmt(
                resumen.seccionesConResultado,
              )} secciones de este ámbito.`}
          </p>
        </>
      )}
    </div>
  );
}

/** Una de las tres cantidades del desglose, con su porcentaje de lo emitido. */
function CifraVoto({
  titulo,
  detalle,
  votos,
  porcentaje,
  color,
  destacada = false,
  compartida = false,
}: {
  titulo: string;
  detalle: string;
  votos: number;
  porcentaje: number;
  color: string;
  destacada?: boolean;
  compartida?: boolean;
}) {
  return (
    <div
      className={`rounded-md border bg-card px-3 py-2 ${
        destacada ? "border-foreground/25" : "border-border/60"
      }`}
    >
      <div className="flex items-center gap-1.5">
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {titulo}
        </span>
      </div>
      <p className="mt-0.5 font-display text-xl font-semibold tabular-nums">
        {fmt(votos)}
        <span className="ml-1.5 text-xs font-normal text-muted-foreground">
          {porcentaje}% de lo emitido
        </span>
      </p>
      <p className="text-[10px] leading-snug text-muted-foreground">
        {compartida ? "Compartido · " : ""}
        {detalle}
      </p>
    </div>
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
