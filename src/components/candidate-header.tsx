import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CalendarDays, UserRound } from "lucide-react";

import { campaignService } from "@/services/campaignService";
import { useAuth } from "@/hooks/useAuth";

/** Días que faltan para la jornada. Negativo si ya pasó. */
function diasPara(fecha: string): number {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const jornada = new Date(`${fecha}T00:00:00`);
  return Math.round((jornada.getTime() - hoy.getTime()) / 86_400_000);
}

function textoJornada(fecha: string): string {
  const dias = diasPara(fecha);
  const legible = new Date(`${fecha}T00:00:00`).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  if (dias > 1) return `${legible} · faltan ${dias} días`;
  if (dias === 1) return `${legible} · mañana`;
  if (dias === 0) return `${legible} · hoy`;
  return legible;
}

/**
 * Banda superior con la ficha de la candidatura.
 *
 * Se oculta por completo mientras no exista ficha: una banda vacía ocuparía
 * espacio en todas las pantallas sin aportar nada. Los administradores ven en su
 * lugar un enlace para capturarla.
 */
export function CandidateHeader() {
  const { canAdmin } = useAuth();
  const q = useQuery({
    queryKey: ["candidato"],
    queryFn: () => campaignService.getCandidate(),
    staleTime: 5 * 60 * 1000,
  });

  if (q.isLoading || q.isError) return null;
  const c = q.data;

  if (!c) {
    if (!canAdmin) return null;
    return (
      <div className="border-b border-border bg-muted/30 px-4 py-2">
        <p className="text-xs text-muted-foreground">
          Sin ficha de candidatura.{" "}
          <Link to="/configuracion" className="font-medium underline underline-offset-2">
            Captúrala en Configuración
          </Link>{" "}
          para que aparezca aquí.
        </p>
      </div>
    );
  }

  const contexto = [c.municipio, c.distrito].filter(Boolean).join(" · ");

  return (
    <div className="border-b border-border bg-muted/30">
      <div className="flex items-center gap-3 px-4 py-3">
        {c.photo_url ? (
          <img
            src={c.photo_url}
            alt={c.full_name}
            className="h-12 w-12 shrink-0 rounded-full border border-border object-cover"
            /* Una URL rota dejaría el icono de imagen partida en todas las
               pantallas; se sustituye por el marcador neutro. */
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
          />
        ) : (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-border bg-background">
            <UserRound className="h-5 w-5 text-muted-foreground" />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <p className="font-display truncate text-base font-semibold">{c.full_name}</p>
            {c.partido && (
              <span className="rounded border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                {c.partido}
              </span>
            )}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {[c.cargo, contexto].filter(Boolean).join(" · ") || "Candidatura"}
          </p>
          {c.eslogan && (
            <p className="truncate text-xs italic text-muted-foreground/80">“{c.eslogan}”</p>
          )}
        </div>

        {c.fecha_eleccion && (
          <div className="hidden shrink-0 items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 md:flex">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <div className="leading-tight">
              <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                Jornada electoral
              </p>
              <p className="text-xs font-medium tabular-nums">
                {textoJornada(c.fecha_eleccion)}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
