import { useQuery } from "@tanstack/react-query";

import { Skeleton } from "@/components/ui/skeleton";
import { electionsService, type ResultadoSeccion } from "@/services/electionsService";

/** Color por fuerza política. Estable entre procesos para leer el cambio de un vistazo. */
const COLOR_BLOQUE: Record<string, string> = {
  morena: "#7A2E2E",
  pan_pri_prd: "#4A5D6B",
  pt_aliados: "#A8763E",
  mc: "#C79E5E",
  otros: "#9A9A9A",
};

/**
 * Orden de lectura: primero lo más reciente y, dentro de un mismo año, el
 * ayuntamiento antes que el resto. La presidencia municipal es la elección que
 * más dice del territorio inmediato.
 */
const PESO_TIPO: Record<string, number> = {
  ayuntamiento: 0,
  gubernatura: 1,
  presidencial: 2,
  diputacion: 3,
};

export function SectionElectionComparison({ sectionCode }: { sectionCode: string }) {
  const q = useQuery({
    queryKey: ["elecciones", sectionCode],
    queryFn: () => electionsService.bySection(sectionCode),
    enabled: Boolean(sectionCode),
  });

  if (q.isLoading) return <Skeleton className="h-28 w-full" />;
  if (q.isError) return null;

  const procesos = [...(q.data ?? [])].sort(
    (a, b) => b.año - a.año || (PESO_TIPO[a.tipo] ?? 9) - (PESO_TIPO[b.tipo] ?? 9),
  );

  return (
    <div className="pt-3">
      <p className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">
        Ganador por elección
      </p>

      {procesos.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Sin resultados para esta sección. Suele ocurrir en secciones creadas por el
          reseccionamiento posterior a los procesos cargados.
        </p>
      ) : (
        <>
          <div className="divide-y divide-border/60 rounded-md border border-border/60">
            {procesos.map((p) => (
              <FilaGanador key={`${p.año}-${p.tipo}`} proceso={p} />
            ))}
          </div>
          <p className="mt-2 text-[10px] leading-snug text-muted-foreground">
            Fuerza más votada en esta sección, no quien ganó el municipio. Los votos de
            coalición se suman por bloque según las alianzas de cada año.
          </p>
        </>
      )}
    </div>
  );
}

function FilaGanador({ proceso }: { proceso: ResultadoSeccion }) {
  const ganador = proceso.bloques[0];

  if (!ganador) {
    return (
      <div className="flex items-center justify-between px-2.5 py-2 text-xs">
        <span className="text-muted-foreground">{proceso.etiqueta}</span>
        <span className="text-muted-foreground">Sin votos</span>
      </div>
    );
  }

  // Margen sobre el segundo lugar: distingue una sección disputada de una segura.
  const segundo = proceso.bloques[1];
  const margen = segundo ? ganador.porcentaje - segundo.porcentaje : ganador.porcentaje;

  return (
    <div className="px-2.5 py-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs text-muted-foreground">{proceso.etiqueta}</span>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {proceso.participacion !== null ? `${proceso.participacion}% part.` : "—"}
        </span>
      </div>
      <div className="mt-1 flex items-center gap-2">
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: COLOR_BLOQUE[ganador.bloque] ?? COLOR_BLOQUE.otros }}
        />
        <span className="flex-1 truncate text-sm font-medium">{ganador.etiqueta}</span>
        <span className="text-sm tabular-nums">{ganador.porcentaje}%</span>
      </div>
      <p className="mt-0.5 pl-[18px] text-[10px] text-muted-foreground">
        {ganador.votos.toLocaleString("es-MX")} votos
        {segundo && ` · ${margen.toFixed(1)} pts sobre ${segundo.etiqueta}`}
      </p>
    </div>
  );
}
