import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Plus, ShieldCheck, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import type { Contact } from "@/types";

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

const EMPTY = {
  full_name: "",
  phone: "",
  email: "",
  age: "",
  gender: "no_especificado",
  municipio: "",
  section_code: "",
  notes: "",
  consent_storage: false,
  consent_comms: false,
};

function ContactosPage() {
  const qc = useQueryClient();
  const { orgId, canWrite } = useAuth();
  const [search, setSearch] = useState("");
  const [municipio, setMunicipio] = useState("todos");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [form, setForm] = useState({ ...EMPTY });

  const contacts = useQuery({ queryKey: ["contacts", {}], queryFn: () => contactsService.list() });
  const units = useQuery({ queryKey: ["units"], queryFn: () => territoryService.list() });

  const municipios = useMemo(
    () => Array.from(new Set((units.data ?? []).map((u) => u.municipio))).sort(),
    [units.data],
  );

  const rows = useMemo(
    () =>
      (contacts.data ?? []).filter(
        (c) =>
          (municipio === "todos" || c.municipio === municipio) &&
          (!search || c.full_name.toLowerCase().includes(search.toLowerCase())),
      ),
    [contacts.data, municipio, search],
  );

  const save = useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error("Sin organización asignada");
      if (!form.consent_storage) throw new Error("El consentimiento de almacenamiento es obligatorio");
      const payload = {
        org_id: orgId,
        full_name: form.full_name.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        age: form.age ? Number(form.age) : null,
        gender: form.gender,
        municipio: form.municipio || null,
        section_code: form.section_code || null,
        notes: form.notes.trim() || null,
        consent_storage: form.consent_storage,
        consent_comms: form.consent_comms,
        consent_at: new Date().toISOString(),
      };
      if (editing) return contactsService.update(editing.id, payload, orgId);
      return contactsService.create(payload);
    },
    onSuccess: () => {
      toast.success(editing ? "Contacto actualizado" : "Contacto registrado");
      setOpen(false);
      setEditing(null);
      setForm({ ...EMPTY });
      qc.invalidateQueries({ queryKey: ["contacts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (c: Contact) => contactsService.remove(c.id, c.org_id),
    onSuccess: () => {
      toast.success("Contacto eliminado");
      qc.invalidateQueries({ queryKey: ["contacts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const startEdit = (c: Contact) => {
    setEditing(c);
    setForm({
      full_name: c.full_name,
      phone: c.phone ?? "",
      email: c.email ?? "",
      age: c.age ? String(c.age) : "",
      gender: c.gender ?? "no_especificado",
      municipio: c.municipio ?? "",
      section_code: c.section_code ?? "",
      notes: c.notes ?? "",
      consent_storage: c.consent_storage,
      consent_comms: c.consent_comms,
    });
    setOpen(true);
  };

  return (
    <>
      <PageHeader
        title="Contactos"
        description="Registro administrativo de personas que otorgaron consentimiento explícito. No se registran preferencias ni afinidades políticas."
        actions={
          <>
            <Button
              variant="outline"
              onClick={() =>
                exportCSV(
                  "contactos",
                  rows.map((c) => ({
                    nombre: c.full_name,
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
            {canWrite && (
              <Button
                onClick={() => {
                  setEditing(null);
                  setForm({ ...EMPTY });
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
              placeholder="Buscar por nombre…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-xs"
            />
            <Select value={municipio} onValueChange={setMunicipio}>
              <SelectTrigger className="w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
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
          ) : (
            <div className="max-h-[600px] overflow-auto rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
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
                      <TableCell className="tabular-nums text-muted-foreground">
                        {maskPhone(c.phone)}
                      </TableCell>
                      <TableCell>{c.municipio ?? "—"}</TableCell>
                      <TableCell>{c.section_code ?? "—"}</TableCell>
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
                        {canWrite && (
                          <div className="flex justify-end gap-1">
                            <Button size="icon" variant="ghost" onClick={() => startEdit(c)}>
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

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">
              {editing ? "Editar contacto" : "Nuevo contacto"}
            </DialogTitle>
            <DialogDescription>
              Solo datos administrativos. Prohibido registrar preferencias políticas.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label>Nombre completo *</Label>
              <Input
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                maxLength={120}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Teléfono</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  maxLength={20}
                />
              </div>
              <div className="space-y-2">
                <Label>Correo</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  maxLength={255}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Edad</Label>
                <Input
                  type="number"
                  min={18}
                  max={120}
                  value={form.age}
                  onChange={(e) => setForm({ ...form, age: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Género</Label>
                <Select
                  value={form.gender}
                  onValueChange={(v) => setForm({ ...form, gender: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="femenino">Femenino</SelectItem>
                    <SelectItem value="masculino">Masculino</SelectItem>
                    <SelectItem value="no_especificado">No especificado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Municipio</Label>
                <Select
                  value={form.municipio || "none"}
                  onValueChange={(v) => setForm({ ...form, municipio: v === "none" ? "" : v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin asignar</SelectItem>
                    {municipios.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Sección</Label>
                <Input
                  value={form.section_code}
                  onChange={(e) => setForm({ ...form, section_code: e.target.value })}
                  maxLength={10}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notas</Label>
              <Textarea
                value={form.notes}
                maxLength={500}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
            <div className="space-y-3 rounded-md border border-border bg-muted/40 p-3">
              <label className="flex items-start gap-3 text-sm">
                <Checkbox
                  checked={form.consent_storage}
                  onCheckedChange={(v) => setForm({ ...form, consent_storage: Boolean(v) })}
                />
                <span>
                  La persona otorgó consentimiento para el almacenamiento de sus datos personales
                  (obligatorio).
                </span>
              </label>
              <label className="flex items-start gap-3 text-sm">
                <Checkbox
                  checked={form.consent_comms}
                  onCheckedChange={(v) => setForm({ ...form, consent_comms: Boolean(v) })}
                />
                <span>Autoriza recibir comunicaciones informativas.</span>
              </label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => save.mutate()}
              disabled={save.isPending || !form.full_name.trim() || !form.consent_storage}
            >
              {save.isPending ? "Guardando…" : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
