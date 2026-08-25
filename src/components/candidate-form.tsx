import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Upload, UserRound, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { campaignService, FOTO_TIPOS, type CandidateInput } from "@/services/campaignService";

const VACIO: CandidateInput = {
  full_name: "",
  photo_url: "",
  cargo: "",
  partido: "",
  municipio: "",
  distrito: "",
  eslogan: "",
  fecha_eleccion: "",
};

/** Ficha que aparece en la cabecera de todas las pantallas. */
export function CandidateForm() {
  const { canAdmin, orgId } = useAuth();
  const qc = useQueryClient();
  const [form, setForm] = useState<CandidateInput>(VACIO);

  const archivoRef = useRef<HTMLInputElement>(null);
  const [subiendo, setSubiendo] = useState(false);

  const q = useQuery({ queryKey: ["candidato"], queryFn: () => campaignService.getCandidate() });

  /**
   * Sube el archivo y deja la URL en el formulario. No guarda la ficha: el
   * usuario puede seguir editando el resto y pulsar Guardar una sola vez.
   */
  const subirFoto = async (file: File) => {
    if (!orgId) return toast.error("Sin organización asignada");
    setSubiendo(true);
    try {
      const url = await campaignService.uploadPhoto(orgId, file);
      setForm((f) => ({ ...f, photo_url: url }));
      toast.success("Fotografía subida. Recuerda guardar la ficha.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo subir la imagen");
    } finally {
      setSubiendo(false);
      // Permite volver a elegir el mismo archivo si hubo error.
      if (archivoRef.current) archivoRef.current.value = "";
    }
  };

  useEffect(() => {
    if (!q.data) return;
    setForm({
      full_name: q.data.full_name,
      photo_url: q.data.photo_url ?? "",
      cargo: q.data.cargo ?? "",
      partido: q.data.partido ?? "",
      municipio: q.data.municipio ?? "",
      distrito: q.data.distrito ?? "",
      eslogan: q.data.eslogan ?? "",
      fecha_eleccion: q.data.fecha_eleccion ?? "",
    });
  }, [q.data]);

  const guardar = useMutation({
    mutationFn: () => {
      if (!orgId) throw new Error("Sin organización asignada");
      if (!form.full_name.trim()) throw new Error("El nombre es obligatorio");
      return campaignService.saveCandidate(orgId, {
        ...form,
        full_name: form.full_name.trim(),
        // Las cadenas vacías se guardan como NULL para que la cabecera pueda
        // distinguir "sin capturar" de "capturado en blanco".
        photo_url: form.photo_url?.trim() || null,
        cargo: form.cargo?.trim() || null,
        partido: form.partido?.trim() || null,
        municipio: form.municipio?.trim() || null,
        distrito: form.distrito?.trim() || null,
        eslogan: form.eslogan?.trim() || null,
        fecha_eleccion: form.fecha_eleccion || null,
      });
    },
    onSuccess: () => {
      toast.success("Ficha de candidatura guardada");
      qc.invalidateQueries({ queryKey: ["candidato"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!canAdmin) return null;
  if (q.isLoading) return <Skeleton className="h-64 w-full" />;

  const set = (k: keyof CandidateInput) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle className="text-base">Candidatura</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-start gap-4">
          {form.photo_url ? (
            <img
              src={form.photo_url}
              alt=""
              className="h-20 w-20 shrink-0 rounded-full border border-border object-cover"
              onError={(e) => {
                e.currentTarget.style.visibility = "hidden";
              }}
            />
          ) : (
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border border-border bg-muted">
              <UserRound className="h-7 w-7 text-muted-foreground" />
            </div>
          )}

          <div className="min-w-0 flex-1 space-y-2">
            <input
              ref={archivoRef}
              type="file"
              accept={FOTO_TIPOS.join(",")}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void subirFoto(file);
              }}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={subiendo}
                onClick={() => archivoRef.current?.click()}
              >
                <Upload className="mr-2 h-4 w-4" />
                {subiendo ? "Subiendo…" : form.photo_url ? "Cambiar foto" : "Subir foto"}
              </Button>
              {form.photo_url && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={subiendo}
                  onClick={() => setForm((f) => ({ ...f, photo_url: "" }))}
                >
                  <X className="mr-2 h-4 w-4" />
                  Quitar
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              JPG, PNG, WEBP o AVIF, hasta 5 MB. La imagen aparece en la banda superior
              de todas las pantallas.
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Campo id="full_name" label="Nombre completo *" value={form.full_name} onChange={set("full_name")} />
          <Campo id="cargo" label="Cargo al que aspira" value={form.cargo ?? ""} onChange={set("cargo")} placeholder="Presidencia municipal" />
          <Campo id="partido" label="Partido o coalición" value={form.partido ?? ""} onChange={set("partido")} placeholder="Morena" />
          <Campo id="municipio" label="Municipio" value={form.municipio ?? ""} onChange={set("municipio")} placeholder="Jerez" />
          <Campo id="distrito" label="Distrito" value={form.distrito ?? ""} onChange={set("distrito")} placeholder="Distrito 2" />
          <Campo id="fecha_eleccion" label="Fecha de la jornada" type="date" value={form.fecha_eleccion ?? ""} onChange={set("fecha_eleccion")} />
        </div>

        <Campo id="eslogan" label="Lema de campaña" value={form.eslogan ?? ""} onChange={set("eslogan")} />

        <details className="rounded-md border border-border/60 px-3 py-2">
          <summary className="cursor-pointer text-xs text-muted-foreground">
            ¿La foto ya está publicada en otro sitio? Pega su enlace
          </summary>
          <div className="mt-2 space-y-1.5">
            <Label htmlFor="photo_url">Enlace a la fotografía</Label>
            <Input
              id="photo_url"
              value={form.photo_url ?? ""}
              onChange={set("photo_url")}
              placeholder="https://…/foto.jpg"
            />
            <p className="text-xs text-muted-foreground">
              Depende de que ese enlace siga vivo. Subir el archivo es más seguro.
            </p>
          </div>
        </details>

        <Button onClick={() => guardar.mutate()} disabled={guardar.isPending}>
          {guardar.isPending ? "Guardando…" : "Guardar ficha"}
        </Button>
      </CardContent>
    </Card>
  );
}

function Campo({
  id,
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  id: string;
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type={type} value={value} onChange={onChange} placeholder={placeholder} />
    </div>
  );
}
