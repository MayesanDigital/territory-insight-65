import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Target } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { campaignService, calculaAvance } from "@/services/campaignService";
import type { SectionContacts } from "@/components/territory-map";

/** Colores del reparto. Se mantienen en todo el producto. */
const COLOR = {
  fidelizado: "#7A4E23",
  seguro: "#4A5D6B",
  sinCategoria: "#B9AFA0",
  restante: "#E4DCCD",
};

/**
 * Cartera de la sección: cuántos contactos hay, cómo se reparten y cuánto falta
 * para la meta que la campaña se fijó ahí.
 *
 * Vive en su propio archivo y no dentro de la ruta: el divisor de código de
 * TanStack Start extrae el componente de la ruta a su propio fragmento y las
 * funciones auxiliares declaradas junto a él no siempre viajan con la extracción.
 */
export function SectionContactBreakdown({
  counts,
  sectionCode,
}: {
  counts: SectionContacts;
  sectionCode: string;
}) {
  const { canAdmin, orgId } = useAuth();
  const qc = useQueryClient();
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState("");

  const meta = useQuery({
    queryKey: ["meta-seccion", sectionCode],
    queryFn: () => campaignService.getGoal(sectionCode),
    enabled: Boolean(sectionCode),
  });

  // Al cambiar de sección se cierra la edición: dejarla abierta arrastraría el
  // valor tecleado para otra sección y se guardaría en la equivocada.
  useEffect(() => {
    setEditando(false);
  }, [sectionCode]);

  const guardar = useMutation({
    mutationFn: (valor: number) => {
      if (!orgId) throw new Error("Sin organización asignada");
      return campaignService.saveGoal(orgId, sectionCode, valor);
    },
    onSuccess: () => {
      toast.success("Meta actualizada");
      qc.invalidateQueries({ queryKey: ["meta-seccion", sectionCode] });
      qc.invalidateQueries({ queryKey: ["metas"] });
      setEditando(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const avance = calculaAvance(
    meta.data?.meta_contactos ?? 0,
    counts.fidelizado,
    counts.seguro,
    counts.total,
  );

  const abrirEdicion = () => {
    setBorrador(String(meta.data?.meta_contactos ?? ""));
    setEditando(true);
  };

  return (
    <div className="rounded-md border border-border/60 bg-muted/40 p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">
          Cartera de la sección
        </p>
        {canAdmin && !editando && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-1.5 text-[11px]"
            onClick={abrirEdicion}
          >
            <Target className="h-3 w-3" />
            {avance.meta > 0 ? "Editar meta" : "Fijar meta"}
          </Button>
        )}
      </div>

      {editando && (
        <div className="mb-3 flex items-center gap-2">
          <Input
            autoFocus
            inputMode="numeric"
            className="h-8"
            placeholder="Contactos objetivo"
            value={borrador}
            onChange={(e) => setBorrador(e.target.value.replace(/\D/g, ""))}
            onKeyDown={(e) => {
              if (e.key === "Enter") guardar.mutate(Number(borrador || 0));
              if (e.key === "Escape") setEditando(false);
            }}
          />
          <Button
            size="sm"
            className="h-8"
            disabled={guardar.isPending}
            onClick={() => guardar.mutate(Number(borrador || 0))}
          >
            {guardar.isPending ? "…" : "Guardar"}
          </Button>
          <Button size="sm" variant="ghost" className="h-8" onClick={() => setEditando(false)}>
            Cancelar
          </Button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Cifra valor={counts.fidelizado} etiqueta="Fidelizados" color={COLOR.fidelizado} />
        <Cifra valor={counts.seguro} etiqueta="Seguros" color={COLOR.seguro} />
      </div>

      {avance.meta > 0 ? (
        <div className="mt-3">
          <div className="mb-1.5 flex items-baseline justify-between">
            <span className="text-[11px] text-muted-foreground">
              Meta: {avance.meta.toLocaleString("es-MX")} contactos
            </span>
            <span
              className={`text-xs font-semibold tabular-nums ${
                avance.cumplida ? "text-emerald-700" : ""
              }`}
            >
              {avance.pctAvance}%
            </span>
          </div>

          {/* Barra apilada: el 100 % es la meta, repartida entre lo logrado y lo
              que falta. Comparar segmentos entre sí se lee mejor que cuatro
              barras sueltas. */}
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-background">
            <Segmento pct={avance.pctFidelizados} color={COLOR.fidelizado} titulo="Fidelizados" />
            <Segmento pct={avance.pctSeguros} color={COLOR.seguro} titulo="Seguros" />
            <Segmento
              pct={avance.pctSinCategoria}
              color={COLOR.sinCategoria}
              titulo="Sin categorizar"
            />
            <Segmento pct={avance.pctRestantes} color={COLOR.restante} titulo="Restantes" />
          </div>

          <div className="mt-2 space-y-0.5">
            <Linea
              color={COLOR.fidelizado}
              etiqueta="Fidelizados"
              valor={avance.fidelizados}
              pct={avance.pctFidelizados}
            />
            <Linea
              color={COLOR.seguro}
              etiqueta="Seguros"
              valor={avance.seguros}
              pct={avance.pctSeguros}
            />
            {avance.sinCategoria > 0 && (
              <Linea
                color={COLOR.sinCategoria}
                etiqueta="Sin categorizar"
                valor={avance.sinCategoria}
                pct={avance.pctSinCategoria}
              />
            )}
            <Linea
              color={COLOR.restante}
              etiqueta="Restantes"
              valor={avance.restantes}
              pct={avance.pctRestantes}
            />
          </div>

          {avance.cumplida && (
            <p className="mt-1.5 text-[11px] font-medium text-emerald-700">
              Meta cumplida
              {avance.registrados > avance.meta &&
                ` · ${(avance.registrados - avance.meta).toLocaleString("es-MX")} por encima`}
            </p>
          )}
        </div>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">
          {counts.total > 0
            ? `${counts.total.toLocaleString("es-MX")} contactos registrados.`
            : "Sin contactos registrados."}{" "}
          {canAdmin
            ? "Fija una meta para medir el avance."
            : "Sin meta fijada para esta sección."}
        </p>
      )}

      {avance.sinCategoria > 0 && avance.meta === 0 && (
        <p className="mt-1 text-xs text-muted-foreground">
          {avance.sinCategoria.toLocaleString("es-MX")} sin categorizar (alta anterior al campo)
        </p>
      )}
    </div>
  );
}

function Cifra({ valor, etiqueta, color }: { valor: number; etiqueta: string; color: string }) {
  return (
    <div className="rounded-md bg-background p-2 text-center">
      <p className="text-xl font-semibold tabular-nums" style={{ color }}>
        {valor.toLocaleString("es-MX")}
      </p>
      <p className="text-xs text-muted-foreground">{etiqueta}</p>
    </div>
  );
}

function Segmento({ pct, color, titulo }: { pct: number; color: string; titulo: string }) {
  if (pct <= 0) return null;
  // Se recorta al 100 % para que superar la meta no desborde la barra.
  return (
    <div style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: color }} title={`${titulo}: ${pct}%`} />
  );
}

function Linea({
  color,
  etiqueta,
  valor,
  pct,
}: {
  color: string;
  etiqueta: string;
  valor: number;
  pct: number;
}) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <span className="flex-1 truncate text-muted-foreground">{etiqueta}</span>
      <span className="tabular-nums">{valor.toLocaleString("es-MX")}</span>
      <span className="w-12 text-right tabular-nums text-muted-foreground">{pct}%</span>
    </div>
  );
}
