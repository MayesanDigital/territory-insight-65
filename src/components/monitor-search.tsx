import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { monitoringService } from "@/services/monitoringService";

const SUBJECT_TYPES = [
  { value: "person", label: "Persona pública" },
  { value: "organization", label: "Organización" },
  { value: "brand", label: "Marca" },
  { value: "topic", label: "Tema" },
];

interface Props {
  onMonitorReady?: (monitorId: string) => void;
  disabled?: boolean;
}

export function MonitorSearch({ onMonitorReady, disabled }: Props) {
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [subjectType, setSubjectType] = useState("person");

  const search = useMutation({
    mutationFn: async (term: string) => {
      const monitorId = await monitoringService.createOrGetMonitor(term, term, subjectType);
      const result = await monitoringService.runMonitor(monitorId);
      return { monitorId, result };
    },
    onSuccess: ({ monitorId, result }) => {
      qc.invalidateQueries({ queryKey: ["monitors"] });
      qc.invalidateQueries({ queryKey: ["mentions"] });

      if (result.status === "error") {
        toast.error("No se pudo consultar ninguna fuente");
      } else if (result.items_new === 0 && result.total_mentions > 0) {
        toast.info(`Sin novedades. El monitor acumula ${result.total_mentions} menciones.`);
      } else if (result.items_new === 0) {
        // Distinguir "no hay cobertura" de "hay cobertura pero de otra persona"
        // evita que el usuario repita la misma búsqueda esperando otro resultado.
        toast.warning(
          result.items_fetched === 0
            ? "Las fuentes no devolvieron ningún resultado para ese término."
            : `Se revisaron ${result.items_fetched} resultados, pero ninguno menciona a esa persona. Prueba con el nombre tal como aparece en prensa.`,
          { duration: 8000 },
        );
      } else {
        toast.success(
          `${result.items_new} menciones nuevas de ${result.sources_checked} ${
            result.sources_checked === 1 ? "fuente" : "fuentes"
          }.`,
        );
      }
      setQuery("");
      onMonitorReady?.(monitorId);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const term = query.trim();
  const canSearch = term.length >= 2 && !search.isPending && !disabled;

  return (
    <Card>
      <CardContent className="p-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (canSearch) search.mutate(term);
          }}
          className="flex flex-wrap items-center gap-3"
        >
          <div className="relative min-w-[260px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Nombre del candidato, organización o tema…"
              className="pl-9"
              maxLength={120}
              disabled={search.isPending || disabled}
            />
          </div>

          <Select value={subjectType} onValueChange={setSubjectType} disabled={search.isPending}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SUBJECT_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button type="submit" disabled={!canSearch}>
            {search.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Buscando…
              </>
            ) : (
              <>
                <Search className="mr-2 h-4 w-4" /> Buscar menciones
              </>
            )}
          </Button>
        </form>

        <p className="mt-3 text-xs text-muted-foreground">
          {search.isPending
            ? "Consultando fuentes públicas y analizando resultados. Puede tardar unos segundos."
            : "Rastrea noticias, blogs y sitios públicos vía RSS. Solo contenido abierto: no accede a perfiles privados ni a contenido tras registro."}
        </p>
      </CardContent>
    </Card>
  );
}
