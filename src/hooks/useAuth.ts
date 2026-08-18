import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole, Profile } from "@/types";

export interface AuthState {
  user: User | null;
  profile: Profile | null;
  roles: AppRole[];
  orgId: string | null;
  /** Administra datos personales y territoriales: contactos, secciones, usuarios. */
  canAdmin: boolean;
  /** Ejecuta análisis: monitores, fuentes y reportes. No toca datos personales. */
  canAnalyze: boolean;
  isSuperAdmin: boolean;
  /** El usuario existe pero todavía no pertenece a ninguna organización. */
  needsOnboarding: boolean;
  loading: boolean;
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const load = async (u: User | null) => {
      if (!u) {
        if (active) {
          setProfile(null);
          setRoles([]);
        }
        return;
      }
      const [{ data: p }, { data: r }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", u.id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", u.id),
      ]);
      if (!active) return;
      setProfile(p ?? null);
      setRoles((r ?? []).map((x) => x.role));
    };

    supabase.auth.getUser().then(({ data }) => {
      if (!active) return;
      setUser(data.user ?? null);
      void load(data.user ?? null).finally(() => active && setLoading(false));
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      void load(session?.user ?? null);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const isSuperAdmin = roles.includes("SUPER_ADMIN");
  const orgId = profile?.org_id ?? null;

  // Espejo de can_admin() y can_analyze() en la base de datos. Aquí solo sirven
  // para decidir qué se dibuja; la autorización real la impone RLS, así que un
  // desajuste degrada la interfaz pero nunca abre acceso a los datos.
  const canAdmin = isSuperAdmin || roles.includes("ADMIN");
  const canAnalyze = canAdmin || roles.includes("ANALYST");

  return {
    user,
    profile,
    roles,
    orgId,
    canAdmin,
    canAnalyze,
    isSuperAdmin,
    needsOnboarding: !loading && !!user && !orgId,
    loading,
  };
}
