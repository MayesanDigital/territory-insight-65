import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  GRADO_COLOR,
  GRADO_ETIQUETA,
  GRADOS_POBREZA,
  type PobrezaSeccion,
} from "@/services/povertyService";

/**
 * Selector de secciones ordenadas de la más pobre a la menos pobre.
 *
 * Es un combobox con búsqueda y no un Select: son 1,772 secciones y hace falta
 * poder escribir la clave o el municipio en lugar de desplazarse. Respeta el
 * filtro de municipio de la página para que la lista sea la de ese municipio.
 */
export function PovertySectionFilter({
  secciones,
  municipioDe,
  municipio,
  value,
  onChange,
  loading,
}: {
  secciones: PobrezaSeccion[];
  /** Municipio de cada clave de sección. */
  municipioDe: Record<string, string>;
  /** "todos" o el municipio elegido en el filtro de la página. */
  municipio: string;
  value: string | null;
  onChange: (sectionCode: string | null) => void;
  loading?: boolean;
}) {
  const [open, setOpen] = useState(false);

  const grupos = useMemo(() => {
    const visibles = secciones.filter(
      (s) => municipio === "todos" || municipioDe[s.section_code] === municipio,
    );
    return GRADOS_POBREZA.map((grado) => ({
      grado,
      items: visibles.filter((s) => s.grado === grado),
    })).filter((g) => g.items.length > 0);
  }, [secciones, municipioDe, municipio]);

  const elegida = value ? secciones.find((s) => s.section_code === value) : undefined;

  return (
    <div className="flex items-center gap-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-label="Secciones por nivel de pobreza"
            className="w-[240px] justify-between font-normal"
            disabled={loading || secciones.length === 0}
          >
            {elegida ? (
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-sm border border-black/10"
                  style={{ backgroundColor: GRADO_COLOR[elegida.grado] }}
                />
                <span className="truncate">
                  #{elegida.lugar} · Sección {elegida.section_code}
                </span>
              </span>
            ) : (
              <span className="text-muted-foreground">
                {loading ? "Cargando pobreza…" : "Nivel de pobreza"}
              </span>
            )}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[340px] p-0"
          align="start"
          // Leaflet toma el foco al terminar de cargar el mapa; sin esto la lista
          // se cerraba sola si se abría mientras el mapa aún cargaba. Un clic
          // fuera la sigue cerrando.
          onFocusOutside={(e) => e.preventDefault()}
        >
          <Command>
            <CommandInput placeholder="Buscar sección o municipio…" />
            <p className="border-b px-3 py-1.5 text-[11px] text-muted-foreground">
              De la más pobre a la menos pobre
              {municipio !== "todos" ? ` · ${municipio}` : " · todo el estado"}
            </p>
            <CommandList className="max-h-[360px]">
              <CommandEmpty>Ninguna sección coincide.</CommandEmpty>
              {grupos.map(({ grado, items }) => (
                <CommandGroup
                  key={grado}
                  heading={`${GRADO_ETIQUETA[grado]} (${items.length.toLocaleString("es-MX")})`}
                >
                  {items.map((s) => (
                    <CommandItem
                      key={s.section_code}
                      value={`${s.section_code} ${municipioDe[s.section_code] ?? ""}`}
                      onSelect={() => {
                        onChange(s.section_code);
                        setOpen(false);
                      }}
                    >
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-sm border border-black/10"
                        style={{ backgroundColor: GRADO_COLOR[s.grado] }}
                      />
                      <span className="w-12 shrink-0 tabular-nums text-muted-foreground">
                        #{s.lugar.toLocaleString("es-MX")}
                      </span>
                      <span className="font-medium tabular-nums">{s.section_code}</span>
                      <span className="flex-1 truncate text-xs text-muted-foreground">
                        {municipioDe[s.section_code] ?? ""}
                      </span>
                      <span className="text-xs tabular-nums">{s.indice.toFixed(1)}</span>
                      <Check
                        className={cn(
                          "h-4 w-4",
                          value === s.section_code ? "opacity-100" : "opacity-0",
                        )}
                      />
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {value && (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label="Quitar sección elegida"
          onClick={() => onChange(null)}
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
