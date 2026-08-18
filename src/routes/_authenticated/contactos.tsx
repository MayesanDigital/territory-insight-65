import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Plus, ShieldCheck, Trash2, Pencil, AlertCircle, Users } from "lucide-react";
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
import { contactsService, maskPhone } from "@/services/contactsService";
import { territoryService } from "@/services/territoryService";
import { exportCSV } from "@/lib/export";
import { useAuth } from "@/hooks/useAuth";
import { GENDER_LABELS, type Contact } from "@/types";

export const Route = createFileRoute("/_authenticated/contactos")({
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

function ContactosPage() {
  const qc = useQueryClient();
  const { canAdmin } = useAuth();
  const [search, setSearch] = useState("");
  const [municipio, setMunicipio] = useState("todos");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);

  const contacts = useQuery({ queryKey: ["contacts", {}], queryFn: () => contactsService.list() });
  const units = useQuery({ queryKey: ["municipios"], queryFn: () => territoryService.municipios() });

  const municipios = useMemo(() => units.data ?? [], [units.data]);

  const rows = useMemo(
    () =>
      (contacts.data ?? []).filter(
        (c) =>
          (municipio === "todos" || c.municipio === municipio) &&
          (!search ||
            c.full_name.toLowerCase().includes(search.toLowerCase()) ||
            (c.section_code ?? "").includes(search)),
      ),
    [contacts.data, municipio, search],
  );

  const remove = useMutation({
    mutationFn: async (c: Contact) => contactsService.remove(c.id, c.org_id),
    onSuccess: () => {
      toast.success("Contacto eliminado");
      qc.invalidateQueries({ queryKey: ["contacts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader
        title="Contactos"
        description="Registro administrativo de personas que otorgaron consentimiento. No se registran preferencias ni afinidades políticas."
        actions={
          <>
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
                    municipio: c.municipio ?? "",
                    seccion: c.section_code ?? "",
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
                <SelectItem value="todos">Todos los municipios</SelectItem>
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
                  {contacts.data?.length ? "Ningún contacto coincide" : "Todavía no hay contactos"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {contacts.data?.length
                    ? "Prueba con otro municipio o limpia la búsqueda."
                    : "Regístralos desde aquí o directamente sobre una sección del mapa."}
                </p>
              </div>
              {canAdmin && !contacts.data?.length && (
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
                    <TableHead>Edad</TableHead>
                    <TableHead>Género</TableHead>
                    <TableHead>Teléfono</TableHead>
                    <TableHead>Municipio</TableHead>
                    <TableHead>Sección</TableHead>
                    <TableHead>Consentimiento</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">{c.full_name}</TableCell>
                      <TableCell className="tabular-nums">{c.age ?? "—"}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {GENDER_LABELS[c.gender ?? "no_especificado"] ?? "—"}
                      </TableCell>
                      <TableCell className="tabular-nums text-muted-foreground">
                        {maskPhone(c.phone)}
                      </TableCell>
                      <TableCell>{c.municipio ?? "—"}</TableCell>
                      <TableCell className="tabular-nums">{c.section_code ?? "—"}</TableCell>
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
      />
    </>
  );
}
