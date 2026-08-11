import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { AppRole, Profile } from "@/types";

export function useAuth() {
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

  const canWrite = roles.some((r) => r === "SUPER_ADMIN" || r === "ADMIN" || r === "ANALYST");

  return { user, profile, roles, orgId: profile?.org_id ?? null, canWrite, loading };
}
