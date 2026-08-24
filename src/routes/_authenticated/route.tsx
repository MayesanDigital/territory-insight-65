import { createFileRoute, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { LogOut, Moon, Sun } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { AppSidebar } from "@/components/app-sidebar";
import { CandidateHeader } from "@/components/candidate-header";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/hooks/useAuth";

/**
 * Organización del usuario, recordada entre navegaciones.
 *
 * `beforeLoad` corre en CADA cambio de vista. Consultar `profiles` cada vez
 * añadía un viaje de red por clic y, si fallaba, tumbaba la navegación entera
 * mostrando el botón de reintentar. La organización de un usuario no cambia
 * mientras dura la sesión, así que basta con resolverla una vez.
 */
let orgCache: { userId: string; orgId: string } | null = null;

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    // getSession() lee el token del almacenamiento local; getUser() lo valida
    // contra el servidor en cada llamada. Para decidir si se pinta la interfaz
    // basta lo primero: la autorización real la impone RLS en cada consulta, de
    // modo que un token caducado devuelve datos vacíos, nunca datos ajenos.
    const { data: sesion } = await supabase.auth.getSession();
    const user = sesion.session?.user;
    if (!user) throw redirect({ to: "/auth" });

    if (orgCache?.userId === user.id) {
      return { user, orgId: orgCache.orgId };
    }

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("org_id")
      .eq("id", user.id)
      .maybeSingle();

    // Un fallo de red al leer el perfil no significa que el usuario no tenga
    // organización. Mandarlo al onboarding por un corte pasajero le haría perder
    // el contexto, así que se deja pasar y la vista se encarga de su propio error.
    if (error) return { user, orgId: null };

    // Sin organización, current_org() es NULL y toda política RLS deniega: la app
    // cargaría vacía y sin explicación. Se desvía al onboarding.
    if (!profile?.org_id) throw redirect({ to: "/onboarding" });

    orgCache = { userId: user.id, orgId: profile.org_id };
    return { user, orgId: profile.org_id };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { theme, toggle } = useTheme();
  const { profile, roles } = useAuth();
  const navigate = useNavigate();

  const signOut = async () => {
    orgCache = null;
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-background/85 px-4 backdrop-blur">
            <SidebarTrigger />
            <div className="h-4 w-px bg-border" />
            <span className="hidden text-xs uppercase tracking-[0.24em] text-muted-foreground sm:inline">
              Inteligencia territorial
            </span>
            <div className="ml-auto flex items-center gap-2">
              <div className="hidden text-right leading-tight sm:block">
                <p className="text-xs font-medium">{profile?.full_name ?? "Usuario"}</p>
                <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  {roles[0] ?? "VIEWER"}
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={toggle} aria-label="Cambiar tema">
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
              <Button variant="ghost" size="icon" onClick={signOut} aria-label="Cerrar sesión">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </header>
          <CandidateHeader />
          <main className="flex-1 p-4 md:p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
