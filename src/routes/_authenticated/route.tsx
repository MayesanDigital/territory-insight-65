import { createFileRoute, Outlet, redirect, useNavigate } from "@tanstack/react-router";
import { LogOut, Moon, Sun } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { AppSidebar } from "@/components/app-sidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });

    // Sin organización, current_org() es NULL y toda política RLS deniega: la app
    // cargaría vacía y sin explicación. Se desvía al onboarding.
    const { data: profile } = await supabase
      .from("profiles")
      .select("org_id")
      .eq("id", data.user.id)
      .maybeSingle();
    if (!profile?.org_id) throw redirect({ to: "/onboarding" });

    return { user: data.user, orgId: profile.org_id };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { theme, toggle } = useTheme();
  const { profile, roles } = useAuth();
  const navigate = useNavigate();

  const signOut = async () => {
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
          <main className="flex-1 p-4 md:p-6">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
