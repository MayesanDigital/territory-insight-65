import { lazy, Suspense, useMemo, useState } from "react";
import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ClipboardCheck, ClipboardList, Layers, MapPin } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState } from "@/components/query-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SurveyFormDialog } from "@/components/survey-form-dialog";
import { SectionSurveyPanorama } from "@/components/section-survey-panorama";
import {
  AgendaProximos,
  CampaignAgendaForm,
  CampaignAgendaList,
} from "@/components/campaign-agenda";
import { territoryService } from "@/services/territoryService";
import { electionsService } from "@/services/electionsService";
import { campaignService } from "@/services/campaignService";
import { surveyService, type SurveyEtapa } from "@/services/surveyService";
import { useAuth } from "@/hooks/useAuth";
import { SIN_NOMINAL, type SectionContacts } from "@/components/territory-map";
import type { TerritorialUnit, TerritorialUnitDetailed } from "@/types";

/* Leaflet y sus estilos pesan más que el resto de la pantalla; se carga aparte. */
const TerritoryMap = lazy(() => import("@/components/territory-map"));

export const Route = createFileRoute("/_authenticated/avances")({
  head: () => ({
    meta: [
      { title: "Avances de campaña | Territorio Intelligence" },
      {
        name: "description",
        content:
          "Mediciones por sección antes y después de la visita del candidato, con la agenda del ciclo y el discurso que sale de las respuestas.",
      },
      { property: "og:title", content: "Avances de campaña | Territorio Intelligence" },
      {
        property: "og:description",
        content:
          "Mide conocimiento y aceptación del candidato sección por sección, con el ciclo de visitas agendado.",
      },
    ],
  }),
  component: AvancesPage,
});

const ELECCION_NOMINAL = 2024;

/* Esta pantalla no usa los contactos, pero el mapa pide el conteo. Una constante
   estable y no un `{}` por render: ese objeto entra en las dependencias del
   dibujo y mandaría a redibujar las ~1,800 capas sin parar. */
const SIN_CARTERAS: Record<string, SectionContacts> = {};

function AvancesPage() {
  const [municipio, setMunicipio] = useState("todos");
  const [search, setSearch] = useState("");
  const [seleccionada, setSeleccionada] = useState<TerritorialUnit | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [etapa, setEtapa] = useState<SurveyEtapa>("medicion");
  const [centrar, setCentrar] = useState<{ id: string; n: number } | null>(null);
  const { canAdmin, canAnalyze } = useAuth();

  // Capturar es trabajo de campo: la misma condición que impone RLS al insertar.
  const puedeCapturar = canAdmin || canAnalyze;

  const units = useQuery({ queryKey: ["units"], queryFn: () => territoryService.list() });

  // Los polígonos se piden solo al acotar por municipio: traerlos todos serían
  // unos 15 MB por visita.
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

  const listaNominal = useQuery({
    queryKey: ["lista-nominal", ELECCION_NOMINAL],
    queryFn: () => electionsService.listaNominal(ELECCION_NOMINAL),
    staleTime: 30 * 60 * 1000,
  });

  const encuestas = useQuery({ queryKey: ["encuestas"], queryFn: () => surveyService.list() });
  const agenda = useQuery({ queryKey: ["agenda"], queryFn: () => surveyService.listAgenda() });
  const candidato = useQuery({
    queryKey: ["candidato"],
    queryFn: () => campaignService.getCandidate(),
    staleTime: 10 * 60 * 1000,
  });

  const municipios = useMemo(
    () => Array.from(new Set((units.data ?? []).map((u) => u.municipio))).sort(),
    [units.data],
  );

  const municipioDe = useMemo(() => {
    const map: Record<string, string> = {};
    for (const u of units.data ?? []) map[u.section_code] = u.municipio;
    return map;
  }, [units.data]);

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

  // Muestras por sección, para saber de un vistazo dónde ya se levantó algo.
  const muestrasPorSeccion = useMemo(() => {
    const map: Record<string, { primera: number; segunda: number }> = {};
    for (const r of encuestas.data ?? []) {
      const fila = (map[r.section_code] ??= { primera: 0, segunda: 0 });
      if (r.etapa === "medicion") fila.primera += 1;
      else fila.segunda += 1;
    }
    return map;
  }, [encuestas.data]);

  const respuestasSeccion = useMemo(
    () =>
      seleccionada
        ? (encuestas.data ?? []).filter((r) => r.section_code === seleccionada.section_code)
        : [],
    [encuestas.data, seleccionada],
  );

  const cicloSeccion = useMemo(
    () =>
      seleccionada
        ? ((agenda.data ?? []).find((c) => c.section_code === seleccionada.section_code) ?? null)
        : null,
    [agenda.data, seleccionada],
  );

  /** Abre una sección desde la agenda: la acota, la selecciona y centra el mapa. */
  const irASeccion = (code: string) => {
    const unit = (units.data ?? []).find((u) => u.section_code === code);
    if (!unit) return;
    setSearch("");
    setMunicipio(unit.municipio);
    setSeleccionada(unit);
    setCentrar((prev) => ({ id: unit.id, n: (prev?.n ?? 0) + 1 }));
  };

  const abrirForm = (e: SurveyEtapa) => {
    setEtapa(e);
    setFormOpen(true);
  };

  const totales = useMemo(() => {
    let primera = 0;
    let segunda = 0;
    let secciones = 0;
    for (const f of Object.values(muestrasPorSeccion)) {
      primera += f.primera;
      segunda += f.segunda;
      secciones += 1;
    }
    return { primera, segunda, secciones };
  }, [muestrasPorSeccion]);

  return (
    <>
      <PageHeader
        title="Avances de campaña"
        description="Mide una sección antes de que el candidato la visite, arma su discurso con lo que la gente dijo que necesita, y vuelve a medirla después para ver qué se movió."
      />

      {/* --- Cómo funciona el ciclo. Sin esto, las fechas y los dos
            formularios no se explican solos. --- */}
      <Card className="mb-4">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:gap-6">
          <Paso
            n={1}
            titulo="Primera medición"
            texto="Se levantan muestras en la sección antes de la visita. Mide el punto de partida y recoge las necesidades con sus palabras."
          />
          <Paso
            n={2}
            titulo="Visita del candidato"
            texto="Dos días después, con un discurso armado a partir de esas respuestas."
          />
          <Paso
            n={3}
            titulo="Resultados"
            texto="Dos días después de la visita se vuelve a medir: conocimiento, aceptación e intención de voto."
          />
        </CardContent>
      </Card>

      {agenda.data && agenda.data.length > 0 && (
        <div className="mb-4">
          <AgendaProximos ciclos={agenda.data} />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card className="overflow-hidden">
          <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:flex-wrap sm:items-center">
            <Select value={municipio} onValueChange={setMunicipio}>
              <SelectTrigger className="w-full sm:w-[200px]">
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
              className="w-full sm:w-[180px]"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
              {municipio === "todos" && (
                <span className="text-xs text-muted-foreground">
                  Elige un municipio para ver los polígonos
                </span>
              )}
              <Badge variant="secondary">{visibles.length} secciones</Badge>
              {totales.secciones > 0 && (
                <Badge variant="outline">
                  {totales.primera + totales.segunda} muestras en {totales.secciones}{" "}
                  {totales.secciones === 1 ? "sección" : "secciones"}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="h-[480px] p-3 pt-0">
            {units.isLoading ? (
              <Skeleton className="h-full w-full" />
            ) : units.isError ? (
              <ErrorState
                error={units.error}
                what="el territorio"
                onRetry={() => void units.refetch()}
              />
            ) : visibles.length === 0 ? (
              <EmptyState
                icon={Layers}
                title="Ninguna sección que dibujar"
                description="Cambia el municipio o limpia la búsqueda."
              />
            ) : (
              <ClientOnly fallback={<Skeleton className="h-full w-full" />}>
                <Suspense fallback={<Skeleton className="h-full w-full" />}>
                  <TerritoryMap
                    units={visibles}
                    geometryById={geometryById}
                    contactCounts={SIN_CARTERAS}
                    listaNominal={listaNominal.data ?? SIN_NOMINAL}
                    metric="nominal"
                    selectedId={seleccionada?.id ?? null}
                    focusRequest={centrar}
                    onSelect={setSeleccionada}
                  />
                </Suspense>
              </ClientOnly>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {seleccionada ? `Sección ${seleccionada.section_code}` : "Elige una sección"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {!seleccionada && (
              <p className="text-muted-foreground">
                Pulsa una sección en el mapa para levantar sus mediciones, ver su panorama y
                programar la visita del candidato.
              </p>
            )}

            {seleccionada && (
              <>
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5" />
                  {seleccionada.municipio} ·{" "}
                  {(listaNominal.data?.[seleccionada.section_code] ?? 0).toLocaleString("es-MX")} en
                  lista nominal
                </p>

                {/* --- Las dos opciones de llenado. --- */}
                <div className="grid gap-2">
                  <Button
                    variant="outline"
                    className="h-auto justify-start py-2.5 text-left"
                    disabled={!puedeCapturar}
                    onClick={() => abrirForm("medicion")}
                  >
                    <ClipboardList className="mr-2 h-4 w-4 shrink-0" />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">Medición primera</span>
                      <span className="block text-[11px] font-normal text-muted-foreground">
                        Antes de la visita ·{" "}
                        {muestrasPorSeccion[seleccionada.section_code]?.primera ?? 0} muestras
                      </span>
                    </span>
                  </Button>
                  <Button
                    variant="outline"
                    className="h-auto justify-start py-2.5 text-left"
                    disabled={!puedeCapturar}
                    onClick={() => abrirForm("resultados")}
                  >
                    <ClipboardCheck className="mr-2 h-4 w-4 shrink-0" />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">Resultados</span>
                      <span className="block text-[11px] font-normal text-muted-foreground">
                        Después de la visita ·{" "}
                        {muestrasPorSeccion[seleccionada.section_code]?.segunda ?? 0} muestras
                      </span>
                    </span>
                  </Button>
                </div>

                {!puedeCapturar && (
                  <p className="text-[11px] text-muted-foreground">
                    Tu rol no puede capturar muestras. Pídele acceso a quien administra la
                    plataforma.
                  </p>
                )}

                {/* --- Panorama de la sección. --- */}
                <div className="border-t border-border pt-3">
                  {encuestas.isLoading ? (
                    <Skeleton className="h-24 w-full" />
                  ) : (
                    <SectionSurveyPanorama
                      respuestas={respuestasSeccion}
                      sectionCode={seleccionada.section_code}
                      municipio={seleccionada.municipio}
                      candidato={candidato.data?.full_name ?? null}
                      partidoCandidatura={candidato.data?.partido ?? null}
                    />
                  )}
                </div>

                {/* --- Agenda del ciclo de esta sección. --- */}
                <div className="border-t border-border pt-3">
                  <p className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">
                    Agenda del ciclo
                  </p>
                  <CampaignAgendaForm
                    sectionCode={seleccionada.section_code}
                    ciclo={cicloSeccion}
                    puedeEditar={canAdmin}
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">Agenda de visitas</CardTitle>
        </CardHeader>
        <CardContent>
          {agenda.isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : agenda.isError ? (
            <ErrorState
              error={agenda.error}
              what="la agenda"
              onRetry={() => void agenda.refetch()}
            />
          ) : (
            <CampaignAgendaList
              ciclos={agenda.data ?? []}
              municipioDe={municipioDe}
              onSelect={irASeccion}
            />
          )}
        </CardContent>
      </Card>

      {seleccionada && (
        <SurveyFormDialog
          open={formOpen}
          onOpenChange={setFormOpen}
          etapa={etapa}
          sectionCode={seleccionada.section_code}
          municipio={seleccionada.municipio}
          candidato={candidato.data?.full_name ?? null}
        />
      )}
    </>
  );
}

function Paso({ n, titulo, texto }: { n: number; titulo: string; texto: string }) {
  return (
    <div className="flex flex-1 items-start gap-2.5">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
        {n}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium">{titulo}</p>
        <p className="text-[11px] leading-snug text-muted-foreground">{texto}</p>
      </div>
    </div>
  );
}
