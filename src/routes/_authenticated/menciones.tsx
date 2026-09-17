import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/query-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { monitoringService } from "@/services/monitoringService";
import { exportCSV, stamped } from "@/lib/export";
import { SENTIMENT_LABELS } from "@/types";

/** Valor del selector cuando no se acota a nadie: Radix no admite cadena vacía. */
const TODOS = "__todos__";

interface MencionesSearch {
  /** Monitor elegido, es decir de quién se quieren ver las menciones. */
  monitor?: string;
}

export const Route = createFileRoute("/_authenticated/menciones")({
  // La selección vive en la dirección para poder compartir "las menciones de
  // fulano" y para que volver atrás no la pierda.
  validateSearch: (search: Record<string, unknown>): MencionesSearch => {
    const bruto = search["monitor"];
    const monitor = typeof bruto === "string" ? bruto.trim() : "";
    return monitor ? { monitor } : {};
  },
  head: () => ({
    meta: [
      { title: "Menciones | Territorio Intelligence" },
      {
        name: "description",
        content: "Listado de menciones públicas detectadas con sentimiento, alcance y fuente.",
      },
      { property: "og:title", content: "Menciones | Territorio Intelligence" },
      {
        property: "og:description",
        content: "Explora y exporta las menciones públicas capturadas por los monitores.",
      },
    ],
  }),
  component: MencionesPage,
});

/** Nombre de la red social a la que pertenece el dominio, si es una. */
function redSocialDe(dominio: string | null): string | null {
  if (!dominio) return null;
  if (dominio.includes("instagram")) return "Instagram";
  if (dominio.includes("facebook")) return "Facebook";
  return null;
}

function MencionesPage() {
  const { monitor } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  const monitores = useQuery({
    queryKey: ["monitors"],
    queryFn: () => monitoringService.monitors(),
  });

  // El filtro se aplica en la consulta, no sobre lo ya traído: el listado está
  // topado en 500 menciones y filtrar después dejaría fuera a quien tenga pocas.
  const mentions = useQuery({
    queryKey: ["mentions", monitor ?? null],
    queryFn: () => monitoringService.mentions(monitor),
  });
  const rows = mentions.data ?? [];

  const elegido = monitores.data?.find((m) => m.id === monitor);
  const nombre = elegido?.name ?? elegido?.query ?? null;

  const elegir = (valor: string) => {
    void navigate({
      search: valor === TODOS ? {} : { monitor: valor },
      replace: true,
    });
  };

  return (
    <>
      <PageHeader
        title="Menciones públicas"
        description="Contenidos públicos indexados por los monitores configurados."
        actions={
          <>
            <Select value={monitor ?? TODOS} onValueChange={elegir}>
              <SelectTrigger className="w-[230px]" aria-label="De quién ver las menciones">
                <SelectValue placeholder="Todas las búsquedas" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value={TODOS}>Todas las búsquedas</SelectItem>
                {(monitores.data ?? []).map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name || m.query}
                  </SelectItem>
                ))}
                {/* El monitor elegido pudo borrarse desde el Monitor Público;
                    se ofrece igual para que el selector refleje la dirección. */}
                {monitor && !elegido && <SelectItem value={monitor}>Búsqueda borrada</SelectItem>}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              disabled={rows.length === 0}
              onClick={() =>
                exportCSV(
                  stamped(nombre ? `menciones-${nombre.replace(/\s+/g, "-").toLowerCase()}` : "menciones"),
                  rows.map((m) => ({
                    titulo: m.title,
                    fuente: m.source_domain ?? "",
                    tipo: m.source_type ?? "",
                    sentimiento: m.sentiment ?? "",
                    alcance: m.reach ?? 0,
                    fecha: m.published_at,
                    fecha_aproximada: m.published_at_estimated ? "Si" : "No",
                    enlace: m.url ?? "",
                  })),
                )
              }
            >
              <Download className="mr-2 h-4 w-4" /> Exportar
            </Button>
          </>
        }
      />
      <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
        <Badge variant="secondary">{rows.length.toLocaleString("es-MX")}</Badge>
        {nombre ? `menciones de ${nombre}` : "menciones de todas las búsquedas"}
      </div>
      <Card>
        <CardContent className="space-y-3 p-4">
          {mentions.isLoading && <Skeleton className="h-80 w-full" />}
          {!mentions.isLoading && rows.length === 0 && (
            <EmptyState
              title={nombre ? `Sin menciones de ${nombre}` : "Todavía no hay menciones"}
              description={
                nombre
                  ? "Corre esa búsqueda otra vez en Monitor Público para traer lo más reciente."
                  : "Busca a una persona en Monitor Público para empezar a reunir menciones."
              }
              compact
            />
          )}
          {rows.map((m) => (
            <div key={m.id} className="rounded-md border border-border p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant={
                    m.sentiment === "positive"
                      ? "default"
                      : m.sentiment === "negative"
                        ? "destructive"
                        : "secondary"
                  }
                >
                  {SENTIMENT_LABELS[m.sentiment ?? "neutral"]}
                </Badge>
                {/* Por dominio y no por source_type: las menciones guardadas
                    antes de que el monitor buscara en redes llegaron con el
                    tipo de su feed de origen y perderían la etiqueta. */}
                {redSocialDe(m.source_domain) && (
                  <Badge variant="outline" title="Publicación pública de una red social">
                    {redSocialDe(m.source_domain)}
                  </Badge>
                )}
                {m.published_at_estimated && (
                  <Badge
                    variant="outline"
                    title="La red social no publica la fecha; esta es la fecha en que se detectó la mención"
                  >
                    Fecha aproximada
                  </Badge>
                )}
                {m.full_text_analyzed && (
                  <Badge
                    variant="outline"
                    title="El sentimiento se calculó sobre el artículo completo, no solo el titular"
                  >
                    Texto completo
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground">
                  {m.source_domain} · {new Date(m.published_at).toLocaleDateString("es-MX")}
                </span>
                <span className="ml-auto text-xs text-muted-foreground">
                  Alcance {(m.reach ?? 0).toLocaleString("es-MX")}
                </span>
              </div>
              <p className="mt-2 font-medium">{m.title}</p>
              {m.excerpt && <p className="mt-1 text-sm text-muted-foreground">{m.excerpt}</p>}
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}
