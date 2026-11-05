import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarClock, Megaphone, ClipboardList, ClipboardCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AGENDA_ESTADO,
  DIAS_ENTRE_HITOS,
  hitosDesde,
  surveyService,
  type AgendaCiclo,
  type AgendaEstado,
} from "@/services/surveyService";
import { useAuth } from "@/hooks/useAuth";

/**
 * Agenda del ciclo de medición.
 *
 * Los tres hitos no son fechas sueltas: el discurso de la visita se arma con lo
 * que recoge la primera medición, y la segunda solo mide crecimiento si se
 * levanta después de la visita. Por eso el formulario propone los dos días de
 * separación del método en cuanto se elige la primera fecha, y deja moverlos:
 * en campo una visita se recorre, y forzar las fechas haría que la agenda
 * dejara de reflejar lo que de verdad pasó.
 */

const HOY = () => new Date().toISOString().slice(0, 10);

const fechaLarga = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
};

/** Días desde hoy hasta la fecha. Negativo si ya pasó. */
const diasHasta = (iso: string) => {
  const hoy = Date.parse(`${HOY()}T00:00:00Z`);
  return Math.round((Date.parse(`${iso}T00:00:00Z`) - hoy) / 86400000);
};

export const HITOS = [
  {
    clave: "fecha_medicion" as const,
    titulo: "Lanzar primera medición",
    icono: ClipboardList,
    color: "#8B6B3E",
  },
  {
    clave: "fecha_visita" as const,
    titulo: "Visita del candidato",
    icono: Megaphone,
    color: "#7A2E2E",
  },
  {
    clave: "fecha_resultados" as const,
    titulo: "Lanzar segunda medición",
    icono: ClipboardCheck,
    color: "#2F6B4F",
  },
];

/** Programa o reprograma el ciclo de una sección. */
export function CampaignAgendaForm({
  sectionCode,
  ciclo,
  puedeEditar,
}: {
  sectionCode: string;
  ciclo: AgendaCiclo | null;
  puedeEditar: boolean;
}) {
  const qc = useQueryClient();
  const { orgId, user } = useAuth();

  const inicial = useMemo(
    () => ciclo ?? { ...hitosDesde(HOY()), estado: "planeada" as AgendaEstado, notas: "" },
    [ciclo],
  );

  const [medicion, setMedicion] = useState(inicial.fecha_medicion);
  const [visita, setVisita] = useState(inicial.fecha_visita);
  const [resultados, setResultados] = useState(inicial.fecha_resultados);
  const [estado, setEstado] = useState<AgendaEstado>(inicial.estado);
  const [notas, setNotas] = useState(inicial.notas ?? "");

  // Al cambiar de sección hay que releer su ciclo: conservar el anterior en los
  // campos haría guardar sobre una sección las fechas de otra.
  useEffect(() => {
    setMedicion(inicial.fecha_medicion);
    setVisita(inicial.fecha_visita);
    setResultados(inicial.fecha_resultados);
    setEstado(inicial.estado);
    setNotas(inicial.notas ?? "");
  }, [sectionCode, inicial]);

  /** Mover la primera fecha arrastra las otras dos, que es el plan por omisión. */
  const cambiaMedicion = (v: string) => {
    setMedicion(v);
    if (!v) return;
    const h = hitosDesde(v);
    setVisita(h.fecha_visita);
    setResultados(h.fecha_resultados);
  };

  const cambiaVisita = (v: string) => {
    setVisita(v);
    if (!v) return;
    const h = hitosDesde(v);
    setResultados(h.fecha_visita);
  };

  const ordenCorrecto =
    medicion && visita && resultados && visita >= medicion && resultados >= visita;

  const guardar = useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error("Sin organización activa");
      await surveyService.saveAgenda({
        org_id: orgId,
        section_code: sectionCode,
        fecha_medicion: medicion,
        fecha_visita: visita,
        fecha_resultados: resultados,
        estado,
        notas: notas.trim() || null,
        updated_by: user?.id ?? null,
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["agenda"] });
      toast.success(ciclo ? "Ciclo reprogramado" : "Ciclo programado");
    },
    onError: (e: Error) => toast.error(e.message || "No se pudo guardar la agenda"),
  });

  const quitar = useMutation({
    mutationFn: async () => {
      if (!ciclo) return;
      await surveyService.deleteAgenda(ciclo.id);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["agenda"] });
      toast.success("Ciclo retirado de la agenda");
    },
    onError: (e: Error) => toast.error(e.message || "No se pudo retirar"),
  });

  if (!puedeEditar) {
    return ciclo ? (
      <CicloResumen ciclo={ciclo} />
    ) : (
      <p className="text-sm text-muted-foreground">
        Esta sección no tiene ciclo programado. Programarlo requiere permisos de administración.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <div>
          <Label htmlFor="f-medicion" className="text-xs">
            1 · Lanzar primera medición
          </Label>
          <Input
            id="f-medicion"
            type="date"
            value={medicion}
            onChange={(e) => cambiaMedicion(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="f-visita" className="text-xs">
            2 · Visita del candidato
          </Label>
          <Input
            id="f-visita"
            type="date"
            value={visita}
            min={medicion}
            onChange={(e) => cambiaVisita(e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="f-resultados" className="text-xs">
            3 · Lanzar segunda medición
          </Label>
          <Input
            id="f-resultados"
            type="date"
            value={resultados}
            min={visita}
            onChange={(e) => setResultados(e.target.value)}
          />
        </div>
      </div>

      <p className="text-[11px] leading-snug text-muted-foreground">
        Se proponen {DIAS_ENTRE_HITOS} días entre cada hito, como en el método. Al mover una fecha
        se recalculan las siguientes, y cualquiera se puede ajustar a mano.
      </p>

      {!ordenCorrecto && (
        <p className="text-[11px] text-destructive">
          El orden importa: la visita no puede ir antes de la primera medición, ni la segunda
          medición antes de la visita. Medir después de la visita ya no mide el punto de partida.
        </p>
      )}

      <div>
        <Label className="text-xs">Estado</Label>
        <Select value={estado} onValueChange={(v) => setEstado(v as AgendaEstado)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(AGENDA_ESTADO).map(([clave, etiqueta]) => (
              <SelectItem key={clave} value={clave}>
                {etiqueta}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="f-notas" className="text-xs">
          Notas (opcional)
        </Label>
        <Textarea
          id="f-notas"
          rows={2}
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          placeholder="Punto de reunión, responsable de la brigada…"
        />
      </div>

      <div className="flex gap-2">
        <Button
          size="sm"
          className="flex-1"
          disabled={!ordenCorrecto || guardar.isPending}
          onClick={() => guardar.mutate()}
        >
          {guardar.isPending ? "Guardando…" : ciclo ? "Reprogramar" : "Programar ciclo"}
        </Button>
        {ciclo && (
          <Button
            size="sm"
            variant="outline"
            disabled={quitar.isPending}
            onClick={() => quitar.mutate()}
          >
            Quitar
          </Button>
        )}
      </div>
    </div>
  );
}

function CicloResumen({ ciclo }: { ciclo: AgendaCiclo }) {
  return (
    <div className="space-y-1.5">
      {HITOS.map((h) => (
        <div key={h.clave} className="flex items-center gap-2 text-xs">
          <h.icono className="h-3.5 w-3.5 shrink-0" style={{ color: h.color }} />
          <span className="flex-1 text-muted-foreground">{h.titulo}</span>
          <span className="tabular-nums">{fechaLarga(ciclo[h.clave])}</span>
        </div>
      ))}
      <Badge variant="secondary">{AGENDA_ESTADO[ciclo.estado]}</Badge>
    </div>
  );
}

/**
 * Agenda completa, del hito más próximo al más lejano.
 *
 * Se ordena por el siguiente hito pendiente y no por la fecha de alta: lo que
 * una agenda tiene que responder es qué toca ahora.
 */
export function CampaignAgendaList({
  ciclos,
  municipioDe,
  onSelect,
}: {
  ciclos: AgendaCiclo[];
  municipioDe: Record<string, string>;
  onSelect: (sectionCode: string) => void;
}) {
  const filas = useMemo(() => {
    return ciclos
      .map((c) => {
        // El siguiente hito pendiente es el primero que aún no se cierra.
        const pendiente =
          c.estado === "cerrada"
            ? null
            : (HITOS.find((h) => diasHasta(c[h.clave]) >= 0) ?? HITOS[HITOS.length - 1]!);
        return { ciclo: c, pendiente, dias: pendiente ? diasHasta(c[pendiente.clave]) : null };
      })
      .sort((a, b) => {
        if (a.dias === null) return 1;
        if (b.dias === null) return -1;
        return a.dias - b.dias;
      });
  }, [ciclos]);

  if (filas.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Todavía no hay ciclos programados. Elige una sección en el mapa y programa su primera
        medición: la agenda se arma sola a partir de ahí.
      </p>
    );
  }

  return (
    <div className="divide-y divide-border/60">
      {filas.map(({ ciclo, pendiente, dias }) => (
        <button
          key={ciclo.id}
          type="button"
          onClick={() => onSelect(ciclo.section_code)}
          className="flex w-full items-center gap-3 px-1 py-2 text-left hover:bg-muted/50"
        >
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">
              Sección {ciclo.section_code}
              <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                {municipioDe[ciclo.section_code] ?? "—"}
              </span>
            </p>
            {pendiente ? (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <pendiente.icono className="h-3 w-3 shrink-0" style={{ color: pendiente.color }} />
                {pendiente.titulo} · {fechaLarga(ciclo[pendiente.clave])}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">Ciclo cerrado</p>
            )}
          </div>
          <div className="shrink-0 text-right">
            <Badge
              variant={
                dias === null
                  ? "secondary"
                  : dias < 0
                    ? "destructive"
                    : dias === 0
                      ? "default"
                      : "outline"
              }
            >
              {dias === null
                ? AGENDA_ESTADO[ciclo.estado]
                : dias < 0
                  ? `${Math.abs(dias)} d de retraso`
                  : dias === 0
                    ? "Hoy"
                    : `en ${dias} d`}
            </Badge>
          </div>
        </button>
      ))}
    </div>
  );
}

/** Lo que toca hoy y en los próximos días, para la cabecera de la vista. */
export function AgendaProximos({ ciclos }: { ciclos: AgendaCiclo[] }) {
  const hoy = useMemo(() => {
    const items: Array<{ seccion: string; titulo: string; dias: number; color: string }> = [];
    for (const c of ciclos) {
      if (c.estado === "cerrada") continue;
      for (const h of HITOS) {
        const d = diasHasta(c[h.clave]);
        if (d >= -7 && d <= 7) {
          items.push({ seccion: c.section_code, titulo: h.titulo, dias: d, color: h.color });
        }
      }
    }
    return items.sort((a, b) => a.dias - b.dias).slice(0, 6);
  }, [ciclos]);

  if (hoy.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <CalendarClock className="h-3.5 w-3.5" /> Esta semana
      </span>
      {hoy.map((i) => (
        <Badge
          key={`${i.seccion}-${i.titulo}`}
          variant={i.dias < 0 ? "destructive" : "outline"}
          className="gap-1"
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: i.color }} />
          {i.titulo} · {i.seccion} ·{" "}
          {i.dias < 0
            ? `${Math.abs(i.dias)} d de retraso`
            : i.dias === 0
              ? "hoy"
              : `en ${i.dias} d`}
        </Badge>
      ))}
    </div>
  );
}
