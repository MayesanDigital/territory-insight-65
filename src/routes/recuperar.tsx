import { useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Restablecer la contraseña.
 *
 * Llega aquí quien abre un enlace de recuperación. El enlace trae `token_hash`,
 * que se canjea por una sesión temporal con `verifyOtp`; con ella se puede
 * cambiar la contraseña y nada más.
 *
 * Se usa `token_hash` y no el enlace de verificación de Supabase porque este
 * último rebota contra la URL configurada en el proyecto, que apunta a otra
 * parte. Así el enlace funciona sin depender de esa configuración.
 *
 * Nadie más ve la contraseña nueva: se escribe aquí y viaja directa a Supabase.
 */
interface RecuperarSearch {
  token_hash?: string;
}

export const Route = createFileRoute("/recuperar")({
  // Solo en el navegador: el token viaja en la dirección y la sesión que crea
  // pertenece a quien abre el enlace, no al servidor.
  ssr: false,
  validateSearch: (search: Record<string, unknown>): RecuperarSearch => {
    const bruto = search["token_hash"];
    const token = typeof bruto === "string" ? bruto.trim() : "";
    return token ? { token_hash: token } : {};
  },
  head: () => ({
    meta: [
      { title: "Restablecer contraseña | Territorio Intelligence" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: RecuperarPage,
});

type Estado = "verificando" | "listo" | "invalido";

function RecuperarPage() {
  const navigate = useNavigate();
  const { token_hash: tokenHash } = Route.useSearch();
  const [estado, setEstado] = useState<Estado>("verificando");
  const [password, setPassword] = useState("");
  const [repetida, setRepetida] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    let vigente = true;

    const abrir = async () => {
      if (tokenHash) {
        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: "recovery",
        });
        if (!vigente) return;
        setEstado(error ? "invalido" : "listo");
        if (error) toast.error("El enlace ya se usó o caducó. Pide uno nuevo.");
        return;
      }
      // Sin token: vale una sesión de recuperación ya abierta, que es lo que
      // deja el correo de Supabase cuando el enlace sí pudo redirigir aquí.
      const { data } = await supabase.auth.getSession();
      if (!vigente) return;
      setEstado(data.session ? "listo" : "invalido");
    };

    void abrir();
    return () => {
      vigente = false;
    };
  }, [tokenHash]);

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("La contraseña necesita al menos 8 caracteres.");
      return;
    }
    if (password !== repetida) {
      toast.error("Las dos contraseñas no coinciden.");
      return;
    }
    setGuardando(true);
    const { error } = await supabase.auth.updateUser({ password });
    setGuardando(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Contraseña actualizada. Ya puedes entrar con ella.");
    navigate({ to: "/dashboard" });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">
        <Link
          to="/"
          className="mb-6 block text-center text-xs uppercase tracking-[0.3em] text-muted-foreground"
        >
          Territorio Intelligence
        </Link>

        <Card>
          <CardHeader>
            <CardTitle>Restablecer contraseña</CardTitle>
            <CardDescription>
              {estado === "invalido"
                ? "El enlace no sirve para cambiar la contraseña."
                : "Escribe la contraseña nueva. Solo tú la conoces."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {estado === "verificando" && (
              <p className="text-sm text-muted-foreground">Comprobando el enlace…</p>
            )}

            {estado === "invalido" && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Los enlaces de recuperación se usan una sola vez y caducan. Pide uno nuevo desde
                  la pantalla de acceso.
                </p>
                <Button asChild variant="outline" className="w-full">
                  <Link to="/auth">Volver al acceso</Link>
                </Button>
              </div>
            )}

            {estado === "listo" && (
              <form onSubmit={guardar} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="nueva">Contraseña nueva</Label>
                  <Input
                    id="nueva"
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                  />
                  <p className="text-xs text-muted-foreground">Mínimo 8 caracteres.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="repetida">Repite la contraseña</Label>
                  <Input
                    id="repetida"
                    type="password"
                    autoComplete="new-password"
                    value={repetida}
                    onChange={(e) => setRepetida(e.target.value)}
                    required
                    minLength={8}
                  />
                </div>
                <Button type="submit" className="w-full" disabled={guardando}>
                  {guardando ? "Guardando…" : "Guardar contraseña"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
