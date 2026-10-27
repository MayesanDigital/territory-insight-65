/**
 * Alta y administración de usuarios de la organización.
 *
 * Crear una cuenta exige la clave de servicio, que nunca puede viajar al
 * navegador: por eso vive aquí. La función no confía en quien la llama; con su
 * JWT comprueba contra la base que sea administrador de la organización y toma
 * de ahí el `org_id`. Nadie puede crear usuarios en una organización ajena ni
 * ascender a nadie a super administrador.
 *
 * Acciones: listar, crear, actualizar (rol y permisos), contrasena, eliminar.
 */

import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

/** Roles que un administrador puede repartir. SUPER_ADMIN no se delega. */
const ROLES = ["ADMIN", "ANALYST", "VIEWER"] as const;
type Rol = (typeof ROLES)[number];

const MIN_CONTRASENA = 8;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "No autenticado" }, 401);

  const url = Deno.env.get("SUPABASE_URL")!;
  // Cliente con el JWT de quien llama: sirve para saber quién es y qué puede,
  // aplicando RLS igual que en el navegador.
  const comoUsuario = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  // Cliente de servicio: solo para tocar cuentas, nunca para decidir permisos.
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

  const { data: quien } = await comoUsuario.auth.getUser();
  if (!quien?.user) return json({ error: "Sesión no válida" }, 401);

  const [{ data: puede }, { data: perfil }] = await Promise.all([
    comoUsuario.rpc("can_admin"),
    comoUsuario.from("profiles").select("org_id").eq("id", quien.user.id).maybeSingle(),
  ]);
  const orgId = perfil?.org_id as string | undefined;
  if (!puede || !orgId) {
    return json({ error: "Solo un administrador de la organización puede hacer esto" }, 403);
  }

  let cuerpo: Record<string, unknown>;
  try {
    cuerpo = await req.json();
  } catch {
    return json({ error: "Petición sin datos" }, 400);
  }
  const accion = String(cuerpo.accion ?? "");

  /** Quienes pertenecen a la organización de quien llama. */
  const miembros = async (): Promise<Set<string>> => {
    const { data } = await admin.from("profiles").select("id").eq("org_id", orgId);
    return new Set((data ?? []).map((p) => p.id as string));
  };

  const permisosDe = async (ids: string[]) => {
    const { data } = await admin
      .from("user_permissions")
      .select("user_id, permiso")
      .in("user_id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
    const mapa: Record<string, string[]> = {};
    for (const p of data ?? []) (mapa[p.user_id as string] ??= []).push(p.permiso as string);
    return mapa;
  };

  const guardaPermisos = async (userId: string, permisos: string[]) => {
    await admin.from("user_permissions").delete().eq("user_id", userId);
    if (permisos.length === 0) return;
    const { data: catalogo } = await admin.from("permission_catalog").select("permiso");
    const validos = new Set((catalogo ?? []).map((c) => c.permiso as string));
    const filas = permisos
      .filter((p) => validos.has(p))
      .map((permiso) => ({ org_id: orgId, user_id: userId, permiso, granted_by: quien.user!.id }));
    if (filas.length) await admin.from("user_permissions").insert(filas);
  };

  const fijaRol = async (userId: string, rol: Rol) => {
    await admin.from("user_roles").delete().eq("user_id", userId).eq("org_id", orgId);
    await admin.from("user_roles").insert({ user_id: userId, org_id: orgId, role: rol });
  };

  try {
    // ---------------------------------------------------------------- listar
    if (accion === "listar") {
      const { data: perfiles } = await admin
        .from("profiles")
        .select("id, full_name, created_at")
        .eq("org_id", orgId)
        .order("created_at");
      const ids = (perfiles ?? []).map((p) => p.id as string);
      const [{ data: roles }, permisos] = await Promise.all([
        admin.from("user_roles").select("user_id, role").eq("org_id", orgId),
        permisosDe(ids),
      ]);
      const rolDe: Record<string, string> = {};
      for (const r of roles ?? []) rolDe[r.user_id as string] = r.role as string;

      // El correo y el último acceso viven en auth, fuera del alcance de RLS.
      const cuentas: Record<string, { email: string; ultimo_acceso: string | null }> = {};
      for (let pagina = 1; ; pagina++) {
        const { data } = await admin.auth.admin.listUsers({ page: pagina, perPage: 200 });
        for (const u of data?.users ?? []) {
          cuentas[u.id] = { email: u.email ?? "", ultimo_acceso: u.last_sign_in_at ?? null };
        }
        if (!data || data.users.length < 200) break;
      }

      return json({
        usuarios: (perfiles ?? []).map((p) => ({
          id: p.id,
          nombre: p.full_name,
          email: cuentas[p.id as string]?.email ?? "",
          ultimo_acceso: cuentas[p.id as string]?.ultimo_acceso ?? null,
          rol: rolDe[p.id as string] ?? "VIEWER",
          permisos: permisos[p.id as string] ?? [],
          soy_yo: p.id === quien.user!.id,
        })),
      });
    }

    // ----------------------------------------------------------------- crear
    if (accion === "crear") {
      const email = String(cuerpo.email ?? "").trim().toLowerCase();
      const contrasena = String(cuerpo.contrasena ?? "");
      const nombre = String(cuerpo.nombre ?? "").trim();
      const rol = String(cuerpo.rol ?? "VIEWER") as Rol;
      const permisos = Array.isArray(cuerpo.permisos) ? (cuerpo.permisos as string[]) : [];

      if (!email.includes("@")) return json({ error: "El correo no es válido" }, 400);
      if (contrasena.length < MIN_CONTRASENA) {
        return json({ error: `La contraseña necesita al menos ${MIN_CONTRASENA} caracteres` }, 400);
      }
      if (!ROLES.includes(rol)) return json({ error: "Rol no permitido" }, 400);
      if (!nombre) return json({ error: "Falta el nombre" }, 400);

      const { data: creado, error } = await admin.auth.admin.createUser({
        email,
        password: contrasena,
        // Alta hecha por un administrador: no hay a quién pedirle que confirme
        // su correo, y sin confirmar no podría entrar.
        email_confirm: true,
        user_metadata: { full_name: nombre },
      });
      if (error || !creado?.user) {
        const ya = (error?.message ?? "").toLowerCase().includes("already");
        return json({ error: ya ? "Ya existe una cuenta con ese correo" : error?.message }, 400);
      }

      const nuevo = creado.user.id;
      await admin.from("profiles").update({ org_id: orgId, full_name: nombre }).eq("id", nuevo);
      await fijaRol(nuevo, rol);
      await guardaPermisos(nuevo, permisos);
      return json({ id: nuevo, email, nombre, rol, permisos });
    }

    // A partir de aquí todas las acciones son sobre alguien de la organización.
    const objetivo = String(cuerpo.usuario_id ?? "");
    if (!objetivo) return json({ error: "Falta el usuario" }, 400);
    if (!(await miembros()).has(objetivo)) {
      return json({ error: "Ese usuario no pertenece a tu organización" }, 403);
    }
    const { data: esSuper } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", objetivo)
      .eq("role", "SUPER_ADMIN")
      .maybeSingle();
    if (esSuper) return json({ error: "No se puede modificar a un super administrador" }, 403);

    // ------------------------------------------------------------ actualizar
    if (accion === "actualizar") {
      const rol = String(cuerpo.rol ?? "") as Rol;
      const permisos = Array.isArray(cuerpo.permisos) ? (cuerpo.permisos as string[]) : null;
      if (rol) {
        if (!ROLES.includes(rol)) return json({ error: "Rol no permitido" }, 400);
        // Quitarse a uno mismo la administración deja la organización sin quien
        // administre si es el último: se bloquea antes de hacerlo.
        if (objetivo === quien.user!.id && rol !== "ADMIN") {
          const { count } = await admin
            .from("user_roles")
            .select("*", { count: "exact", head: true })
            .eq("org_id", orgId)
            .eq("role", "ADMIN");
          if ((count ?? 0) <= 1) {
            return json({ error: "Eres el único administrador: nombra otro antes de cambiar tu rol" }, 400);
          }
        }
        await fijaRol(objetivo, rol);
      }
      if (cuerpo.nombre) {
        await admin.from("profiles").update({ full_name: String(cuerpo.nombre).trim() }).eq("id", objetivo);
      }
      if (permisos) await guardaPermisos(objetivo, permisos);
      return json({ ok: true });
    }

    // ------------------------------------------------------------ contrasena
    if (accion === "contrasena") {
      const contrasena = String(cuerpo.contrasena ?? "");
      if (contrasena.length < MIN_CONTRASENA) {
        return json({ error: `La contraseña necesita al menos ${MIN_CONTRASENA} caracteres` }, 400);
      }
      const { error } = await admin.auth.admin.updateUserById(objetivo, { password: contrasena });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    // -------------------------------------------------------------- eliminar
    if (accion === "eliminar") {
      if (objetivo === quien.user!.id) {
        return json({ error: "No puedes eliminar tu propia cuenta" }, 400);
      }
      const { error } = await admin.auth.admin.deleteUser(objetivo);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    return json({ error: "Acción desconocida" }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
