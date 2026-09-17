import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Download,
  Plus,
  ShieldCheck,
  Trash2,
  Pencil,
  AlertCircle,
  Users,
  Printer,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { ContactFormDialog } from "@/components/contact-form-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { contactsService, listaResponsables, maskPhone } from "@/services/contactsService";
import { territoryService } from "@/services/territoryService";
import { recordReport } from "@/services/reportService";
import { exportCSV, exportPrintablePDF, type ReportSection } from "@/lib/export";
import { CATEGORIA_ETIQUETA } from "@/lib/validation";
import { useAuth } from "@/hooks/useAuth";
import { GENDER_LABELS, type Contact } from "@/types";

/**
 * Filtros de responsable y sección en la URL.
 *
 * Así el mapa puede enlazar directamente al listado de una sección o de un
 * promotor, y un listado filtrado se puede compartir o recargar sin perderlo.
 */
interface ContactosSearch {
  promotor?: string;
  movilizador?: string;
  seccion?: string;
}

export const Route = createFileRoute("/_authenticated/contactos")({
  validateSearch: (search: Record<string, unknown>): ContactosSearch => {
    const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
    const promotor = texto(search["promotor"]);
    const movilizador = texto(search["movilizador"]);
    const seccion = texto(search["seccion"]);
    return {
      ...(promotor ? { promotor } : {}),
      ...(movilizador ? { movilizador } : {}),
      ...(seccion ? { seccion } : {}),
    };
  },
  head: () => ({
    meta: [
      { title: "Contactos | Territorio Intelligence" },
      {
        name: "description",
        content:
          "Registro administrativo de contactos con consentimiento explícito, historial de cambios y exportación.",
      },
      { property: "og:title", content: "Contactos | Territorio Intelligence" },
      {
        property: "og:description",
        content: "Gestión de contactos con consentimiento obligatorio y trazabilidad de cambios.",
      },
    ],
  }),
  component: ContactosPage,
});

/** Radix Select no admite el valor vacío, así que "todos" usa un centinela. */
const TODOS = "__todos__";

const categoriaDe = (c: Contact) =>
  c.category ? (CATEGORIA_ETIQUETA[c.category as keyof typeof CATEGORIA_ETIQUETA] ?? c.category) : "—";

function ContactosPage() {
  const qc = useQueryClient();
  const navigate = useNavigate({ from: Route.fullPath });
  const { canAdmin, orgId } = useAuth();
  const filtros = Route.useSearch();

  const [search, setSearch] = useState("");
  const [municipio, setMunicipio] = useState(TODOS);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);

  const contacts = useQuery({ queryKey: ["contacts", {}], queryFn: () => contactsService.list() });
  const units = useQuery({ queryKey: ["municipios"], queryFn: () => territoryService.municipios() });
  const municipios = useMemo(() => units.data ?? [], [units.data]);
  const todos = useMemo(() => contacts.data ?? [], [contacts.data]);

  // --- Opciones en cascada ---------------------------------------------------
  // Cada filtro solo ofrece valores que existen dentro de lo ya elegido arriba:
  // tras escoger un promotor, el selector de movilizador muestra solo a quienes
  // trabajan con él, y el de sección solo las secciones de esa pareja. Así nunca
  // se llega a una combinación vacía por elegir a ciegas.
  const promotores = useMemo(() => listaResponsables(todos, "promotor"), [todos]);

  const delPromotor = useMemo(
    () => (filtros.promotor ? todos.filter((c) => c.promotor === filtros.promotor) : todos),
    [todos, filtros.promotor],
  );
  const movilizadores = useMemo(() => listaResponsables(delPromotor, "movilizador"), [delPromotor]);

  const delMovilizador = useMemo(
    () =>
      filtros.movilizador
        ? delPromotor.filter((c) => c.movilizador === filtros.movilizador)
        : delPromotor,
    [delPromotor, filtros.movilizador],
  );
  const secciones = useMemo(
    () =>
      [...new Set(delMovilizador.map((c) => c.section_code).filter((s): s is string => !!s))].sort(),
    [delMovilizador],
  );

  const rows = useMemo(
    () =>
      delMovilizador.filter(
        (c) =>
          (!filtros.seccion || c.section_code === filtros.seccion) &&
          (municipio === TODOS || c.municipio === municipio) &&
          (!search ||
            c.full_name.toLowerCase().includes(search.toLowerCase()) ||
            (c.section_code ?? "").includes(search)),
      ),
    [delMovilizador, filtros.seccion, municipio, search],
  );

  /**
   * Cambia un filtro de la cascada y limpia los que dependen de él.
   * Mantener un movilizador elegido tras cambiar de promotor podría dejar una
   * combinación que ya no existe y el listado quedaría vacío sin motivo aparente.
   */
  const aplicaFiltro = (campo: keyof ContactosSearch, valor: string) => {
    const limpio = valor === TODOS ? undefined : valor;
    const siguiente: ContactosSearch = { ...filtros };
    if (limpio) siguiente[campo] = limpio;
    else delete siguiente[campo];
    if (campo === "promotor") {
      delete siguiente.movilizador;
      delete siguiente.seccion;
    }
    if (campo === "movilizador") delete siguiente.seccion;
    void navigate({ search: siguiente, replace: true });
  };

  const hayFiltros = Boolean(filtros.promotor || filtros.movilizador || filtros.seccion);

  const remove = useMutation({
    mutationFn: async (c: Contact) => contactsService.remove(c.id, c.org_id),
    onSuccess: () => {
      toast.success("Contacto eliminado");
      qc.invalidateQueries({ queryKey: ["contacts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // --- Impresión -------------------------------------------------------------
  const imprimir = async () => {
    if (rows.length === 0) return;

    const descripcionFiltros = [
      filtros.promotor && `Promotor: ${filtros.promotor}`,
      filtros.movilizador && `Movilizador: ${filtros.movilizador}`,
      filtros.seccion && `Sección: ${filtros.seccion}`,
      municipio !== TODOS && `Municipio: ${municipio}`,
      search && `Búsqueda: "${search}"`,
    ].filter(Boolean) as string[];

    // Una tabla por sección: en campo el listado se reparte por sección, y así
    // cada hoja impresa corresponde a un recorrido.
    const porSeccion = new Map<string, Contact[]>();
    for (const c of rows) {
      const clave = c.section_code ?? "Sin sección";
      porSeccion.set(clave, [...(porSeccion.get(clave) ?? []), c]);
    }

    // Las columnas fijadas por un filtro se omiten: repetirían el mismo valor en
    // cada fila y le quitarían ancho a la dirección.
    const sections: ReportSection[] = [...porSeccion.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([seccion, lista]) => ({
        heading: `Sección ${seccion} · ${lista.length} ${lista.length === 1 ? "contacto" : "contactos"}`,
        rows: [...lista]
          .sort((a, b) => a.full_name.localeCompare(b.full_name, "es"))
          .map((c) => ({
            Nombre: c.full_name,
            Teléfono: maskPhone(c.phone),
            Dirección: c.address ?? "—",
            Categoría: categoriaDe(c),
            ...(filtros.promotor ? {} : { Promotor: c.promotor ?? "—" }),
            ...(filtros.movilizador ? {} : { Movilizador: c.movilizador ?? "—" }),
          })),
      }));

    const fidelizados = rows.filter((c) => c.category === "fidelizado").length;
    const seguros = rows.filter((c) => c.category === "seguro").length;

    try {
      exportPrintablePDF(
        {
          title: "Listado de contactos",
          subtitle: descripcionFiltros.length ? descripcionFiltros.join(" · ") : "Todos los contactos",
          kpis: [
            { label: "Contactos", value: rows.length.toLocaleString("es-MX") },
            { label: "Fidelizados", value: fidelizados.toLocaleString("es-MX") },
            { label: "Seguros", value: seguros.toLocaleString("es-MX") },
            { label: "Secciones", value: String(porSeccion.size) },
          ],
        },
        sections,
      );
    } catch (e) {
      toast.error((e as Error).message);
      return;
    }

    // Imprimir un padrón es una exportación de datos personales: queda en la
    // auditoría con los filtros usados (PRD §20), sin copiar los datos.
    if (orgId) {
      try {
        await recordReport(orgId, "contactos", "pdf", {
          origen: "impresion_listado",
          filtros: { ...filtros, municipio: municipio === TODOS ? null : municipio, busqueda: search || null },
          contactos: rows.length,
        });
      } catch {
        // La impresión ya se abrió; no se bloquea al usuario si falla el registro.
      }
    }
  };

  return (
    <>
      <PageHeader
        title="Contactos"
        description="Registro administrativo de personas que otorgaron consentimiento. No se registran preferencias ni afinidades políticas."
        actions={
          <>
            <Button variant="outline" disabled={rows.length === 0} onClick={() => void imprimir()}>
              <Printer className="mr-2 h-4 w-4" /> Imprimir
            </Button>
            <Button
              variant="outline"
              disabled={rows.length === 0}
              onClick={() =>
                exportCSV(
                  "contactos",
                  rows.map((c) => ({
                    nombre: c.full_name,
                    edad: c.age ?? "",
                    genero: GENDER_LABELS[c.gender ?? "no_especificado"] ?? "",
                    telefono: maskPhone(c.phone),
                    direccion: c.address ?? "",
                    categoria: categoriaDe(c),
                    municipio: c.municipio ?? "",
                    seccion: c.section_code ?? "",
                    promotor: c.promotor ?? "",
                    movilizador: c.movilizador ?? "",
                    estado: c.status,
                    alta: c.registered_at,
                  })),
                )
              }
            >
              <Download className="mr-2 h-4 w-4" /> Exportar
            </Button>
            {canAdmin && (
              <Button
                onClick={() => {
                  setEditing(null);
                  setOpen(true);
                }}
              >
                <Plus className="mr-2 h-4 w-4" /> Nuevo contacto
              </Button>
            )}
          </>
        }
      />

      <Card>
        <CardContent className="p-4">
          {/* Filtros de equipo, en el orden en que se acotan. */}
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <FiltroSelect
              etiqueta="Promotor"
              valor={filtros.promotor}
              opciones={promotores}
              todos="Todos los promotores"
              onChange={(v) => aplicaFiltro("promotor", v)}
            />
            <FiltroSelect
              etiqueta="Movilizador"
              valor={filtros.movilizador}
              opciones={movilizadores}
              todos={filtros.promotor ? "Todos los de este promotor" : "Todos los movilizadores"}
              onChange={(v) => aplicaFiltro("movilizador", v)}
            />
            <FiltroSelect
              etiqueta="Sección"
              valor={filtros.seccion}
              opciones={secciones}
              todos="Todas las secciones"
              onChange={(v) => aplicaFiltro("seccion", v)}
            />
            {hayFiltros && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void navigate({ search: {}, replace: true })}
              >
                <X className="mr-1 h-3 w-3" /> Limpiar filtros
              </Button>
            )}
          </div>

          <div className="mb-4 flex flex-wrap gap-3">
            <Input
              placeholder="Buscar por nombre o sección…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-xs"
            />
            <Select value={municipio} onValueChange={setMunicipio}>
              <SelectTrigger className="w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-64">
                <SelectItem value={TODOS}>Todos los municipios</SelectItem>
                {municipios.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Badge variant="secondary" className="ml-auto self-center">
              {rows.length} registros
            </Badge>
          </div>

          {contacts.isLoading ? (
            <Skeleton className="h-80 w-full" />
          ) : contacts.isError ? (
            <div className="flex flex-col items-center gap-3 rounded-md border border-destructive/40 bg-destructive/5 py-16 text-center">
              <AlertCircle className="h-8 w-8 text-destructive" />
              <div>
                <p className="font-medium">No se pudieron cargar los contactos</p>
                <p className="text-sm text-muted-foreground">
                  {(contacts.error as Error).message}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => contacts.refetch()}>
                Reintentar
              </Button>
            </div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-border py-16 text-center">
              <Users className="h-8 w-8 text-muted-foreground" />
              <div>
                <p className="font-medium">
                  {todos.length ? "Ningún contacto coincide" : "Todavía no hay contactos"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {todos.length
                    ? "Prueba con otros filtros o limpia la búsqueda."
                    : "Regístralos desde aquí o directamente sobre una sección del mapa."}
                </p>
              </div>
              {canAdmin && !todos.length && (
                <Button
                  size="sm"
                  onClick={() => {
                    setEditing(null);
                    setOpen(true);
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" /> Nuevo contacto
                </Button>
              )}
            </div>
          ) : (
            <div className="max-h-[600px] overflow-auto rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Teléfono</TableHead>
                    <TableHead>Sección</TableHead>
                    <TableHead>Categoría</TableHead>
                    <TableHead>Promotor</TableHead>
                    <TableHead>Movilizador</TableHead>
                    <TableHead>Municipio</TableHead>
                    <TableHead>Consentimiento</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.full_name}</TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">
                        {maskPhone(c.phone)}
                      </TableCell>
                      <TableCell className="tabular-nums">{c.section_code ?? "—"}</TableCell>
                      <TableCell>{categoriaDe(c)}</TableCell>
                      <TableCell>{c.promotor ?? <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell>
                        {c.movilizador ?? <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>{c.municipio ?? "—"}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {c.consent_storage && (
                            <Badge variant="outline" className="gap-1">
                              <ShieldCheck className="h-3 w-3" /> Datos
                            </Badge>
                          )}
                          {c.consent_comms && <Badge variant="secondary">Comunicación</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {canAdmin && (
                          <div className="flex justify-end gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              aria-label="Editar"
                              onClick={() => {
                                setEditing(c);
                                setOpen(true);
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => remove.mutate(c)}
                              aria-label="Eliminar"
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <ContactFormDialog
        open={open}
        onOpenChange={setOpen}
        contact={editing}
        municipios={municipios}
        // Al dar de alta con filtros activos, el contacto hereda equipo y
        // sección: casi siempre se captura para la cartera que se está viendo.
        defaults={{
          ...(filtros.promotor ? { promotor: filtros.promotor } : {}),
          ...(filtros.movilizador ? { movilizador: filtros.movilizador } : {}),
          ...(filtros.seccion ? { section_code: filtros.seccion } : {}),
        }}
      />
    </>
  );
}

function FiltroSelect({
  etiqueta,
  valor,
  opciones,
  todos,
  onChange,
}: {
  etiqueta: string;
  valor: string | undefined;
  opciones: string[];
  todos: string;
  onChange: (valor: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {etiqueta}
      </span>
      <Select value={valor ?? TODOS} onValueChange={onChange}>
        <SelectTrigger className="w-[220px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="max-h-64">
          <SelectItem value={TODOS}>{todos}</SelectItem>
          {opciones.map((o) => (
            <SelectItem key={o} value={o}>
              {o}
            </SelectItem>
          ))}
          {/* Un valor llegado por URL que ya no existe se muestra igualmente,
              para que el selector no aparezca vacío con un filtro activo. */}
          {valor && !opciones.includes(valor) && <SelectItem value={valor}>{valor}</SelectItem>}
        </SelectContent>
      </Select>
    </div>
  );
}
