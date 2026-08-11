import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { monitoringService } from "@/services/monitoringService";
import { exportCSV } from "@/lib/export";
import { SENTIMENT_LABELS } from "@/types";

export const Route = createFileRoute("/_authenticated/menciones")({
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

function MencionesPage() {
  const mentions = useQuery({
    queryKey: ["mentions"],
    queryFn: () => monitoringService.mentions(),
  });
  const rows = mentions.data ?? [];

  return (
    <>
      <PageHeader
        title="Menciones públicas"
        description="Contenidos públicos indexados por los monitores configurados."
        actions={
          <Button
            variant="outline"
            onClick={() =>
              exportCSV(
                "menciones",
                rows.map((m) => ({
                  titulo: m.title,
                  fuente: m.source_domain ?? "",
                  sentimiento: m.sentiment ?? "",
                  alcance: m.reach ?? 0,
                  fecha: m.published_at,
                })),
              )
            }
          >
            <Download className="mr-2 h-4 w-4" /> Exportar
          </Button>
        }
      />
      <Card>
        <CardContent className="space-y-3 p-4">
          {mentions.isLoading && <Skeleton className="h-80 w-full" />}
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
