import type { SectionContacts } from "@/components/territory-map";

/**
 * Desglose de la cartera de una sección entre fidelizados y seguros.
 *
 * Vive en su propio archivo y no dentro de la ruta: el divisor de código de
 * TanStack Start extrae el componente de la ruta a su propio fragmento y las
 * funciones auxiliares declaradas junto a él no siempre viajan con la extracción.
 */
export function SectionContactBreakdown({ counts }: { counts: SectionContacts }) {
  const sinCategoria = counts.total - counts.fidelizado - counts.seguro;

  return (
    <div className="rounded-md border border-border/60 bg-muted/40 p-3">
      <p className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">
        Cartera de la sección
      </p>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-md bg-background p-2 text-center">
          <p className="text-xl font-semibold tabular-nums" style={{ color: "#7A4E23" }}>
            {counts.fidelizado.toLocaleString("es-MX")}
          </p>
          <p className="text-xs text-muted-foreground">Fidelizados</p>
        </div>
        <div className="rounded-md bg-background p-2 text-center">
          <p className="text-xl font-semibold tabular-nums" style={{ color: "#4A5D6B" }}>
            {counts.seguro.toLocaleString("es-MX")}
          </p>
          <p className="text-xs text-muted-foreground">Seguros</p>
        </div>
      </div>
      {sinCategoria > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          {sinCategoria.toLocaleString("es-MX")} sin categorizar (alta anterior al campo)
        </p>
      )}
    </div>
  );
}
