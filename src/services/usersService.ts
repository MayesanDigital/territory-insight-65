import { supabase } from "@/integrations/supabase/client";
import type { AppRole } from "@/types";

/**
 * Usuarios de la organización y sus permisos.
 *
 * Las altas y los cambios de contraseña pasan por la Edge Function
 * `admin-usuarios`, porque exigen la clave de servicio y esa nunca puede estar
 * en el navegador. La función vuelve a comprobar que quien llama es
 * administrador: aquí no se decide nada, solo se pide.
 */

export interface UsuarioOrg {
  id: string;
  nombre: string | null;
  email: string;
  ultimo_acceso: string | null;
  rol: AppRole;
  permisos: string[];
  soy_yo: boolean;
}

/** Permiso del catálogo, tal como se ofrece en la pantalla de administración. */
export interface PermisoCatalogo {
  permiso: string;
  grupo: string;
  etiqueta: string;
  descripcion: string | null;
  requiere_rol: AppRole[] | null;
  orden: number;
}

export const ROLES_ASIGNABLES: Array<{ valor: AppRole; nombre: string; descripcion: string }> = [
  {
    valor: "ADMIN",
    nombre: "Administrador",
    descripcion: "Da de alta contactos y usuarios, importa datos e imprime reportes.",
  },
  {
    valor: "ANALYST",
    nombre: "Asesor",
    descripcion: "Consulta todo lo que se le permita, corre el monitoreo e imprime reportes.",
  },
  {
    valor: "VIEWER",
    nombre: "Consulta",
    descripcion: "Solo mira las pantallas que se le marquen. No imprime ni exporta.",
  },
];

async function llama<T>(cuerpo: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T & { error?: string }>("admin-usuarios", {
    body: cuerpo,
  });
  // La función devuelve el motivo en el cuerpo; sin esto solo llegaría un
  // "Edge Function returned a non-2xx status code", que no dice qué pasó.
  if (error) {
    const detalle = await (error as { context?: Response }).context
      ?.clone()
      .json()
      .catch(() => null);
    throw new Error(detalle?.error ?? error.message);
  }
  if (data && typeof data === "object" && "error" in data && data.error) {
    throw new Error(String(data.error));
  }
  return data as T;
}

export const usersService = {
  async listar(): Promise<UsuarioOrg[]> {
    const { usuarios } = await llama<{ usuarios: UsuarioOrg[] }>({ accion: "listar" });
    return usuarios ?? [];
  },

  async catalogo(): Promise<PermisoCatalogo[]> {
    const { data, error } = await supabase
      .from("permission_catalog")
      .select("*")
      .order("orden");
    if (error) throw error;
    return (data ?? []) as PermisoCatalogo[];
  },

  /** Permisos efectivos de quien está en sesión, ya resueltos contra su rol. */
  async mios(): Promise<string[]> {
    const { data, error } = await supabase.rpc("mis_permisos");
    if (error) throw error;
    return ((data ?? []) as Array<{ permiso: string }>).map((p) => p.permiso);
  },

  async crear(datos: {
    nombre: string;
    email: string;
    contrasena: string;
    rol: AppRole;
    permisos: string[];
  }) {
    return llama<{ id: string }>({ accion: "crear", ...datos });
  },

  async actualizar(usuarioId: string, datos: { rol?: AppRole; permisos?: string[]; nombre?: string }) {
    return llama<{ ok: true }>({ accion: "actualizar", usuario_id: usuarioId, ...datos });
  },

  async cambiarContrasena(usuarioId: string, contrasena: string) {
    return llama<{ ok: true }>({ accion: "contrasena", usuario_id: usuarioId, contrasena });
  },

  async eliminar(usuarioId: string) {
    return llama<{ ok: true }>({ accion: "eliminar", usuario_id: usuarioId });
  },
};
