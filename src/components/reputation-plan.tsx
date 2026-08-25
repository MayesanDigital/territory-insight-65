import { useState } from "react";
import { CalendarClock, Lightbulb, Printer, ShieldAlert, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { exportPrintablePDF } from "@/lib/export";
import { generarPlan, NIVEL, type PlanReputacion } from "@/services/reputationService";
import type { MentionAnalytics } from "@/services/monitoringService";
import type { WebMention } from "@/types";

/**
 * Plan de contención generado a partir del monitoreo.
 *
 * Se genera bajo demanda y no al cargar la vista: es un documento de trabajo que
 * solo tiene sentido cuando alguien va a actuar sobre él, y mostrarlo siempre lo
 * convertiría en ruido que se aprende a ignorar.
 */
export function ReputationPlan({
  analytics,
  mentions,
  sujeto,
  tipoSujeto,
}: {
  analytics: MentionAnalytics;
  mentions: WebMention[];
  sujeto: string;
  tipoSujeto: string;
}) {
  const [plan, setPlan] = useState<PlanReputacion | null>(null);

  const total =
    analytics.sentiment.positive + analytics.sentiment.neutral + analytics.sentiment.negative;

  if (total === 0) return null;

  if (!plan) {
    return (
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <Lightbulb className="h-5 w-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Plan de imagen y manejo de crisis</p>
            <p className="text-xs text-muted-foreground">
              Genera recomendaciones y una parrilla de contenido de dos días a partir de estas{" "}
              {total} menciones.
            </p>
          </div>
          <Button onClick={() => setPlan(generarPlan(analytics, mentions, sujeto, tipoSujeto))}>
            Generar plan
          </Button>
        </CardContent>
      </Card>
    );
  }

  const cfg = NIVEL[plan.nivel];

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center gap-2 space-y-0">
        <ShieldAlert className="h-4 w-4 shrink-0" style={{ color: cfg.color }} />
        <CardTitle className="text-base">Plan de imagen y manejo de crisis</CardTitle>
        <Badge style={{ backgroundColor: cfg.color }} className="text-white">
          {cfg.etiqueta}
        </Badge>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" size="sm" onClick={() => imprimirPlan(plan)}>
            <Printer className="mr-2 h-4 w-4" /> Imprimir / PDF
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setPlan(null)}>
            Cerrar
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <p className="rounded-md border p-3 text-sm" style={{ borderColor: `${cfg.color}55` }}>
          {plan.encabezado}
        </p>

        <Seccion titulo="Diagnóstico">
          {plan.diagnostico.map((p, i) => (
            <p key={i} className="text-sm text-muted-foreground">
              {p}
            </p>
          ))}
        </Seccion>

        <Seccion titulo="Mensajes clave">
          <ul className="space-y-1.5">
            {plan.mensajesClave.map((m, i) => (
              <li key={i} className="flex gap-2 text-sm text-muted-foreground">
                <span className="text-foreground">·</span>
                <span>{m}</span>
              </li>
            ))}
          </ul>
        </Seccion>

        <Seccion titulo="Recomendaciones">
          <div className="space-y-2">
            {plan.recomendaciones.map((r, i) => (
              <div key={i} className="rounded-md border border-border/60 p-3">
                <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-sm font-medium">{r.titulo}</span>
                  <Badge variant="secondary" className="text-[10px]">
                    {r.plazo}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{r.detalle}</p>
              </div>
            ))}
          </div>
        </Seccion>

        <Seccion titulo="Parrilla de contenido — 2 días" icono={<CalendarClock className="h-4 w-4" />}>
          <div className="space-y-3">
            {plan.parrilla.map((dia) => (
              <div key={dia.titulo} className="rounded-md border border-border/60">
                <div className="border-b border-border/60 bg-muted/40 px-3 py-2">
                  <p className="text-sm font-medium">{dia.titulo}</p>
                  <p className="text-xs text-muted-foreground">{dia.foco}</p>
                </div>
                <div className="divide-y divide-border/60">
                  {dia.bloques.map((b, i) => (
                    <div key={i} className="px-3 py-2.5">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-medium tabular-nums">{b.hora}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {b.canal}
                        </Badge>
                        <span className="text-[11px] text-muted-foreground">{b.formato}</span>
                        <span className="ml-auto text-[11px] italic text-muted-foreground">
                          {b.objetivo}
                        </span>
                      </div>
                      <p className="text-xs">{b.copy}</p>
                      {b.nota && (
                        <p className="mt-1 text-[11px] text-muted-foreground">→ {b.nota}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Seccion>

        {plan.fuentesPrioritarias.length > 0 && (
          <Seccion titulo="Medios a atender">
            <div className="space-y-1">
              {plan.fuentesPrioritarias.map((f) => (
                <div key={f.dominio} className="flex flex-wrap items-baseline gap-2 text-xs">
                  <span className="font-medium" translate="no">
                    {f.dominio}
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    {f.menciones} menciones
                  </span>
                  <span className="text-muted-foreground">— {f.nota}</span>
                </div>
              ))}
            </div>
          </Seccion>
        )}

        <Seccion titulo="Qué no hacer" icono={<XCircle className="h-4 w-4 text-destructive" />}>
          <ul className="space-y-1.5">
            {plan.noHacer.map((n, i) => (
              <li key={i} className="flex gap-2 text-xs text-muted-foreground">
                <span className="text-destructive">·</span>
                <span>{n}</span>
              </li>
            ))}
          </ul>
        </Seccion>

        <p className="border-t border-border/60 pt-3 text-[10px] text-muted-foreground">
          Documento de trabajo interno generado a partir de {total} menciones públicas. Las
          recomendaciones citan las cifras que las justifican para poder discutirse con el dato
          delante; los textos entre corchetes deben verificarse antes de publicarse.
        </p>
      </CardContent>
    </Card>
  );
}

function Seccion({
  titulo,
  icono,
  children,
}: {
  titulo: string;
  icono?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        {icono}
        <p className="text-xs uppercase tracking-widest text-muted-foreground">{titulo}</p>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function imprimirPlan(plan: PlanReputacion) {
  try {
    exportPrintablePDF(
      {
        title: "Plan de imagen y manejo de crisis",
        subtitle: `${plan.sujeto} · Nivel ${NIVEL[plan.nivel].etiqueta}`,
        summary: [plan.encabezado, ...plan.diagnostico, ...plan.mensajesClave],
      },
      [
        {
          heading: "Recomendaciones",
          rows: plan.recomendaciones.map((r) => ({
            Acción: r.titulo,
            Plazo: r.plazo,
            Detalle: r.detalle,
          })),
        },
        ...plan.parrilla.map((d) => ({
          heading: d.titulo,
          description: d.foco,
          rows: d.bloques.map((b) => ({
            Hora: b.hora,
            Canal: b.canal,
            Formato: b.formato,
            Objetivo: b.objetivo,
            Propuesta: b.copy + (b.nota ? ` — ${b.nota}` : ""),
          })),
        })),
        {
          heading: "Medios a atender",
          rows: plan.fuentesPrioritarias.map((f) => ({
            Medio: f.dominio,
            Menciones: f.menciones,
            Criterio: f.nota,
          })),
        },
        {
          heading: "Qué no hacer",
          rows: plan.noHacer.map((n, i) => ({ "#": i + 1, Advertencia: n })),
        },
      ],
    );
  } catch (e) {
    toast.error(e instanceof Error ? e.message : "No se pudo abrir la vista de impresión");
  }
}
