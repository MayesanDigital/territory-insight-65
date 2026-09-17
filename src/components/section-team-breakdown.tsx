import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Megaphone, Users } from "lucide-react";

import type { Contact } from "@/types";

interface Reparto {
  nombre: string;
  total: number;
}

/** Agrupa los contactos por responsable, de mayor a menor cartera. */
function reparte(contactos: Contact[], campo: "promotor" | "movilizador"): {
  filas: Reparto[];
  sinAsignar: number;
} {
  const conteo = new Map<string, number>();
  let sinAsignar = 0;
  for (const c of contactos) {
    const nombre = c[campo];
    if (!nombre) sinAsignar++;
    else conteo.set(nombre, (conteo.get(nombre) ?? 0) + 1);
  }
  const filas = [...conteo.entries()]
    .map(([nombre, total]) => ({ nombre, total }))
    .sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre, "es"));
  return { filas, sinAsignar };
}

/**
 * Equipo responsable de la sección: qué promotores y movilizadores tienen
 * contactos aquí y cuántos cada uno.
 *
 * Vive en su propio archivo por la misma razón que SectionContactBreakdown: el
 * divisor de código de TanStack Start extrae el componente de la ruta y las
 * funciones auxiliares declaradas junto a él no siempre viajan con él.
 */
export function SectionTeamBreakdown({
  contactos,
  sectionCode,
}: {
  contactos: Contact[];
  sectionCode: string;
}) {
  const promotores = useMemo(() => reparte(contactos, "promotor"), [contactos]);
  const movilizadores = useMemo(() => reparte(contactos, "movilizador"), [contactos]);

  if (contactos.length === 0) return null;

  return (
    <div className="rounded-md border border-border/60 bg-muted/40 p-3">
      <p className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">
        Equipo en la sección
      </p>

      <div className="space-y-3">
        <Lista
          icono={<Megaphone className="h-3 w-3" />}
          titulo="Promotores"
          filas={promotores.filas}
          sinAsignar={promotores.sinAsignar}
          sectionCode={sectionCode}
          campo="promotor"
        />
        <Lista
          icono={<Users className="h-3 w-3" />}
          titulo="Movilizadores"
          filas={movilizadores.filas}
          sinAsignar={movilizadores.sinAsignar}
          sectionCode={sectionCode}
          campo="movilizador"
        />
      </div>

      <Link
        to="/contactos"
        search={{ seccion: sectionCode }}
        className="mt-3 flex items-center justify-end gap-1 text-xs font-medium text-primary hover:underline"
      >
        Ver los {contactos.length} contactos de la sección <ArrowRight className="h-3 w-3" />
      </Link>
    </div>
  );
}

function Lista({
  icono,
  titulo,
  filas,
  sinAsignar,
  sectionCode,
  campo,
}: {
  icono: React.ReactNode;
  titulo: string;
  filas: Reparto[];
  sinAsignar: number;
  sectionCode: string;
  campo: "promotor" | "movilizador";
}) {
  return (
    <div>
      <p className="mb-1 flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
        {icono} {titulo}
      </p>
      {filas.length === 0 ? (
        <p className="text-xs text-muted-foreground">Ninguno asignado.</p>
      ) : (
        <div className="space-y-0.5">
          {filas.map((f) => (
            <Link
              key={f.nombre}
              to="/contactos"
              // Llevar al listado ya filtrado por responsable y sección ahorra
              // repetir en la otra pantalla la selección que se hizo aquí.
              search={{ seccion: sectionCode, [campo]: f.nombre }}
              className="flex items-center gap-2 rounded px-1 py-0.5 text-xs hover:bg-background"
            >
              <span className="flex-1 truncate">{f.nombre}</span>
              <span className="tabular-nums text-muted-foreground">{f.total}</span>
            </Link>
          ))}
        </div>
      )}
      {sinAsignar > 0 && filas.length > 0 && (
        <p className="mt-0.5 px-1 text-[11px] text-muted-foreground">
          {sinAsignar} sin {campo} asignado
        </p>
      )}
    </div>
  );
}
