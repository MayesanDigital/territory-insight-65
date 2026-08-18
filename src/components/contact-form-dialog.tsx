import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { contactsService } from "@/services/contactsService";
import { useAuth } from "@/hooks/useAuth";
import {
  CATEGORIAS,
  CATEGORIA_ETIQUETA,
  contactSchema,
  emptyContact,
  normalizePhone,
  type ContactFormValues,
} from "@/lib/validation";
import type { Contact } from "@/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Contacto a editar. Si se omite, el formulario da de alta uno nuevo. */
  contact?: Contact | null;
  /** Valores preseleccionados, p. ej. la sección desde la que se abrió el mapa. */
  defaults?: Partial<ContactFormValues>;
  municipios?: string[];
  onSaved?: (contact: Contact) => void;
}

export function ContactFormDialog({
  open,
  onOpenChange,
  contact,
  defaults,
  municipios = [],
  onSaved,
}: Props) {
  const qc = useQueryClient();
  const { orgId } = useAuth();

  const form = useForm<ContactFormValues>({
    resolver: zodResolver(contactSchema),
    defaultValues: { ...emptyContact, ...defaults },
    mode: "onBlur",
  });

  // El diálogo se monta una vez y se reutiliza, así que hay que resembrar los
  // valores cada vez que se abre; si no, arrastraría los del contacto anterior.
  useEffect(() => {
    if (!open) return;
    form.reset(
      contact
        ? {
            full_name: contact.full_name,
            age: contact.age ? String(contact.age) : "",
            // Los contactos anteriores a estos campos vienen sin valor; el
            // formulario los deja vacíos y obliga a completarlos al editar.
            gender: contact.gender ?? "",
            category: contact.category ?? "",
            phone: contact.phone ?? "",
            address: contact.address ?? "",
            municipio: contact.municipio ?? "",
            section_code: contact.section_code ?? "",
            notes: contact.notes ?? "",
            consent_storage: contact.consent_storage,
            consent_comms: contact.consent_comms,
          }
        : { ...emptyContact, ...defaults },
    );
    // `defaults` se reconstruye en cada render del padre; se compara por
    // contenido para no reiniciar el formulario mientras se escribe.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, contact?.id, JSON.stringify(defaults)]);

  const save = useMutation({
    mutationFn: async (values: ContactFormValues) => {
      if (!orgId) throw new Error("Sin organización asignada");
      const payload = {
        org_id: orgId,
        full_name: values.full_name.trim(),
        phone: normalizePhone(values.phone),
        address: values.address.trim(),
        category: values.category,
        age: values.age ? Number(values.age) : null,
        gender: values.gender,
        municipio: values.municipio || null,
        // Las secciones del INE van a cuatro dígitos. Sin rellenar, un "1"
        // tecleado a mano no cruzaría con la "0001" del mapa y el contacto
        // quedaría fuera del conteo de su propia sección.
        section_code: values.section_code ? values.section_code.padStart(4, "0") : null,
        notes: values.notes.trim() || null,
        consent_storage: values.consent_storage,
        consent_comms: values.consent_comms,
        consent_at: new Date().toISOString(),
      };
      return contact
        ? contactsService.update(contact.id, payload, orgId)
        : contactsService.create(payload);
    },
    onSuccess: (saved) => {
      toast.success(contact ? "Contacto actualizado" : "Contacto registrado");
      // Invalidar contactos actualiza el conteo y la cobertura en el mapa.
      qc.invalidateQueries({ queryKey: ["contacts"] });
      onOpenChange(false);
      onSaved?.(saved as Contact);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">
            {contact ? "Editar contacto" : "Nuevo contacto"}
          </DialogTitle>
          <DialogDescription>
            Solo datos administrativos. No se registran preferencias, afiliación ni intención de
            voto.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit((v) => save.mutate(v))} className="space-y-4">
            <FormField
              control={form.control}
              name="full_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre completo *</FormLabel>
                  <FormControl>
                    <Input {...field} maxLength={120} autoComplete="off" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Teléfono *</FormLabel>
                    <FormControl>
                      <Input {...field} inputMode="tel" placeholder="492 123 4567" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Categoría *</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {CATEGORIAS.map((c) => (
                          <SelectItem key={c} value={c}>
                            {CATEGORIA_ETIQUETA[c]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Dirección *</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      maxLength={200}
                      autoComplete="off"
                      placeholder="Calle, número, colonia"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="age"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Edad</FormLabel>
                    <FormControl>
                      <Input {...field} inputMode="numeric" placeholder="18" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="gender"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Género *</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="femenino">Femenino</SelectItem>
                        <SelectItem value="masculino">Masculino</SelectItem>
                        <SelectItem value="no_especificado">No especificado</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <FormField
                control={form.control}
                name="municipio"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Municipio *</FormLabel>
                    {municipios.length > 0 ? (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecciona" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent className="max-h-64">
                          {municipios.map((m) => (
                            <SelectItem key={m} value={m}>
                              {m}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <FormControl>
                        <Input {...field} maxLength={120} />
                      </FormControl>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="section_code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sección territorial *</FormLabel>
                    <FormControl>
                      <Input {...field} inputMode="numeric" maxLength={5} placeholder="0482" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notas</FormLabel>
                  <FormControl>
                    <Textarea {...field} maxLength={500} rows={2} />
                  </FormControl>
                  <FormDescription>
                    Solo información administrativa. No registres opiniones ni preferencias.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-3 rounded-md border border-border bg-muted/40 p-3">
              <FormField
                control={form.control}
                name="consent_storage"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-start gap-3">
                      <FormControl>
                        <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                      <FormLabel className="text-sm font-normal leading-snug">
                        La persona otorgó consentimiento para el almacenamiento de sus datos
                        personales <span className="text-destructive">(obligatorio)</span>.
                      </FormLabel>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="consent_comms"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-start gap-3">
                      <FormControl>
                        <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                      <FormLabel className="text-sm font-normal leading-snug">
                        Autoriza recibir comunicaciones informativas.
                      </FormLabel>
                    </div>
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? "Guardando…" : "Guardar"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
