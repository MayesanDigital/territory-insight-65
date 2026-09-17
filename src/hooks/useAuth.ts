import { useSyncExternalStore } from "react";
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

interface Snapshot {
  user: User | null;
  profile: Profile | null;
  roles: AppRole[];
  loading: boolean;
}

/**
 * Estado de sesión compartido por toda la app.
 *
 * Cada componente que llamaba a useAuth() hacía su propio getUser() (que valida
 * el token contra el servidor) más dos consultas a profiles y user_roles. Con
 * una docena de componentes montados, abrir una vista disparaba más de 30
 * peticiones idénticas antes de pedir un solo dato. Ahora se resuelve una vez y
 * todos los componentes leen la misma instantánea.
 */
let snapshot: Snapshot = { user: null, profile: null, roles: [], loading: true };
const listeners = new Set<() => void>();
let started = false;
let loadedFor: string | null = null;

function emit(next: Partial<Snapshot>) {
  snapshot = { ...snapshot, ...next };
  for (const l of listeners) l();
}

async function loadFor(u: User | null) {
  if (!u) {
    loadedFor = null;
    emit({ user: null, profile: null, roles: [], loading: false });
    return;
  }
  // El refresco periódico del token vuelve a notificar al mismo usuario; su
  // perfil y roles no cambian por eso, así que no se vuelven a pedir.
  if (loadedFor === u.id) {
    emit({ user: u });
    return;
  }
  loadedFor = u.id;
  const [{ data: p }, { data: r }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", u.id).maybeSingle(),
    supabase.from("user_roles").select("role").eq("user_id", u.id),
  ]);
  if (loadedFor !== u.id) return; // Cambió la sesión mientras se cargaba.
  emit({ user: u, profile: p ?? null, roles: (r ?? []).map((x) => x.role), loading: false });
}

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  supabase.auth.getUser().then(({ data }) => loadFor(data.user ?? null));
  supabase.auth.onAuthStateChange((event, session) => {
    // INITIAL_SESSION llega a la vez que getUser(); lo resuelve esa llamada.
    if (event === "INITIAL_SESSION") return;
    void loadFor(session?.user ?? null);
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Arrancar fuera de la suscripción: Supabase puede notificar de forma síncrona
  // y React no admite actualizaciones mientras aún está montando componentes.
  if (!started) setTimeout(start, 0);
  return () => listeners.delete(listener);
}

const getSnapshot = () => snapshot;
const SERVER_SNAPSHOT: Snapshot = { user: null, profile: null, roles: [], loading: true };
const getServerSnapshot = () => SERVER_SNAPSHOT;

export function useAuth(): AuthState {
  const { user, profile, roles, loading } = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

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
