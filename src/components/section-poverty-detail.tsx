import {
  GRADO_COLOR,
  GRADO_ETIQUETA,
  INDICADOR_ETIQUETA,
  type PobrezaMunicipal,
  type PobrezaSeccion,
} from "@/services/povertyService";

/**
 * Nivel de pobreza de la sección en la ficha lateral del mapa: grado, lugar en
 * el estado, carencias que lo explican y la pobreza oficial del municipio.
 */
export function SectionPovertyDetail({
  pobreza,
  total,
  municipal,
}: {
  pobreza: PobrezaSeccion | undefined;
  /** Secciones con índice, para decir "lugar N de total". */
  total: number;
  municipal: PobrezaMunicipal | undefined;
}) {
  if (!pobreza && !municipal) return null;

  // Carencias en porcentaje, de la más extendida a la menos. Ocupantes por
  // cuarto no es porcentaje y se muestra aparte.
  const carencias = pobreza
    ? Object.entries(pobreza.indicadores)
        .filter(([k]) => k !== "ocupantes_cuarto")
        .sort((a, b) => b[1] - a[1])
    : [];

  return (
    <div className="rounded-md border border-border/60 bg-muted/40 p-3">
      <p className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">
        Nivel de pobreza
      </p>

      {pobreza ? (
        <>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 font-medium">
              <span
                className="h-3 w-3 rounded-sm border border-black/10"
                style={{ backgroundColor: GRADO_COLOR[pobreza.grado] }}
              />
              {GRADO_ETIQUETA[pobreza.grado]}
            </span>
            <span className="text-xs tabular-nums text-muted-foreground">
              Índice {pobreza.indice.toFixed(1)} / 100
            </span>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Lugar {pobreza.lugar.toLocaleString("es-MX")} de {total.toLocaleString("es-MX")} en el
            estado (1 = la más pobre)
          </p>

          <div className="mt-2 space-y-1">
            {carencias.map(([clave, valor]) => (
              <div key={clave} className="flex items-center gap-2">
                <span className="w-36 shrink-0 truncate text-[11px] text-muted-foreground">
                  {INDICADOR_ETIQUETA[clave] ?? clave}
                </span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-background">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(100, valor)}%`,
                      backgroundColor: GRADO_COLOR[pobreza.grado],
                    }}
                  />
                </div>
                <span className="w-10 shrink-0 text-right text-[11px] tabular-nums">
                  {Math.round(valor)}%
                </span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">Sin dato de pobreza para esta sección.</p>
      )}

      {municipal && (
        <div className="mt-3 border-t border-border/60 pt-2 text-xs">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Pobreza en el municipio</span>
            <span className="font-medium tabular-nums">{municipal.pobreza_pct.toFixed(1)}%</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Pobreza extrema</span>
            <span className="font-medium tabular-nums">{municipal.extrema_pct.toFixed(1)}%</span>
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">
            CONEVAL 2020 · {municipal.pobreza_personas.toLocaleString("es-MX")} personas
          </p>
        </div>
      )}
    </div>
  );
}
