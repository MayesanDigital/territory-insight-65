import { useState } from "react";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { Building2, LogOut } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/onboarding")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });

    const { data: profile } = await supabase
      .from("profiles")
      .select("org_id")
      .eq("id", data.user.id)
      .maybeSingle();

    // Quien ya tiene organización no tiene nada que hacer aquí.
    if (profile?.org_id) throw redirect({ to: "/dashboard" });
  },
  head: () => ({
    meta: [
      { title: "Crear organización | Territorio Intelligence" },
      {
        name: "description",
        content: "Da de alta tu organización para empezar a trabajar en Territorio Intelligence.",
      },
    ],
  }),
  component: OnboardingPage,
});

/** "Gobierno de Zacatecas" -> "gobierno-de-zacatecas" */
function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function OnboardingPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [busy, setBusy] = useState(false);

  const effectiveSlug = slugTouched ? slug : slugify(name);
  const slugValid = /^[a-z0-9]([a-z0-9-]{1,46}[a-z0-9])$/.test(effectiveSlug);
  const nameValid = name.trim().length >= 2;

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    // create_organization es una función SECURITY DEFINER: el usuario todavía no
    // tiene permiso para insertar en organizations por sí mismo.
    const { error } = await supabase.rpc("create_organization", {
      _name: name.trim(),
      _slug: effectiveSlug,
    });
    setBusy(false);

    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Organización creada");
    // Recarga completa: el perfil cacheado en memoria todavía no tiene org_id.
    window.location.assign("/dashboard");
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader>
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Building2 className="h-5 w-5" />
            </div>
            <CardTitle className="font-display text-2xl">Crea tu organización</CardTitle>
            <CardDescription>
              Tu cuenta todavía no pertenece a ninguna organización. Crea una para empezar, o pide a
              un administrador que te invite con este mismo correo.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={create} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="org-name">Nombre de la organización</Label>
                <Input
                  id="org-name"
                  required
                  maxLength={80}
                  placeholder="Gobierno de Zacatecas"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="org-slug">Identificador</Label>
                <Input
                  id="org-slug"
                  required
                  maxLength={48}
                  placeholder="gobierno-de-zacatecas"
                  value={effectiveSlug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    setSlug(e.target.value);
                  }}
                />
                <p className="text-xs text-muted-foreground">
                  Minúsculas, números y guiones. Entre 3 y 48 caracteres.
                </p>
                {effectiveSlug.length > 0 && !slugValid && (
                  <p className="text-xs text-destructive">
                    Ese identificador no cumple el formato.
                  </p>
                )}
              </div>
              <Button type="submit" className="w-full" disabled={busy || !nameValid || !slugValid}>
                {busy ? "Creando…" : "Crear organización"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <button
          type="button"
          onClick={signOut}
          className="mt-6 flex w-full items-center justify-center gap-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <LogOut className="h-3 w-3" /> Cerrar sesión
        </button>
      </div>
    </div>
  );
}
