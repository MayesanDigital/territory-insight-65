import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Pencil, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/query-state";
import {
  ROLES_ASIGNABLES,
  usersService,
  type PermisoCatalogo,
  type UsuarioOrg,
} from "@/services/usersService";
import type { AppRole } from "@/types";

/**
 * Administración de usuarios de la organización.
 *
 * Un administrador da de alta cuentas con su contraseña y marca qué pantallas
 * puede abrir cada quien. Las contraseñas se escriben aquí y viajan directas a
 * la función que crea la cuenta: no se guardan en ninguna tabla ni se muestran
 * después, así que una contraseña olvidada se reemplaza, no se consulta.
 *
 * Los permisos acotan al rol, nunca lo amplían: marcarle "Imprimir reportes" a
 * una cuenta de consulta no se lo concede, porque esa acción exige rol de
 * administrador o asesor y la base lo vuelve a comprobar.
 */

const ROL_ETIQUETA: Record<string, string> = {
  SUPER_ADMIN: "Super administrador",
  ADMIN: "Administrador",
  ANALYST: "Asesor",
  VIEWER: "Consulta",
};

const MIN_CONTRASENA = 8;

interface Borrador {
  nombre: string;
  email: string;
  contrasena: string;
  rol: AppRole;
  permisos: Set<string>;
}

const vacio = (catalogo: PermisoCatalogo[]): Borrador => ({
  nombre: "",
  email: "",
  contrasena: "",
  rol: "VIEWER",
  // Una cuenta nueva nace viendo lo básico; lo demás se marca a propósito.
  permisos: new Set(catalogo.filter((c) => ["dashboard", "mapa"].includes(c.permiso)).map((c) => c.permiso)),
});

export function UserAdmin() {
  const qc = useQueryClient();
  const [abierto, setAbierto] = useState(false);
  const [editando, setEditando] = useState<UsuarioOrg | null>(null);
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [clave, setClave] = useState<UsuarioOrg | null>(null);
  const [nuevaClave, setNuevaClave] = useState("");

  const catalogo = useQuery({ queryKey: ["catalogo-permisos"], queryFn: () => usersService.catalogo() });
  const usuarios = useQuery({ queryKey: ["usuarios-org"], queryFn: () => usersService.listar() });

  const grupos = useMemo(() => {
    const mapa = new Map<string, PermisoCatalogo[]>();
    for (const p of catalogo.data ?? []) {
      const lista = mapa.get(p.grupo) ?? [];
      lista.push(p);
      mapa.set(p.grupo, lista);
    }
    return [...mapa.entries()];
  }, [catalogo.data]);

  const refrescar = () => {
    void qc.invalidateQueries({ queryKey: ["usuarios-org"] });
  };

  const crear = useMutation({
    mutationFn: (b: Borrador) =>
      usersService.crear({
        nombre: b.nombre.trim(),
        email: b.email.trim(),
        contrasena: b.contrasena,
        rol: b.rol,
        permisos: [...b.permisos],
      }),
    onSuccess: (_, b) => {
      toast.success(`Cuenta creada para ${b.email.trim()}`, {
        description: "Entrégale la contraseña por un medio seguro; aquí ya no se puede consultar.",
        duration: 10000,
      });
      cerrar();
      refrescar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const actualizar = useMutation({
    mutationFn: ({ id, b }: { id: string; b: Borrador }) =>
      usersService.actualizar(id, { nombre: b.nombre.trim(), rol: b.rol, permisos: [...b.permisos] }),
    onSuccess: () => {
      toast.success("Permisos actualizados");
      cerrar();
      refrescar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cambiarClave = useMutation({
    mutationFn: ({ id, contrasena }: { id: string; contrasena: string }) =>
      usersService.cambiarContrasena(id, contrasena),
    onSuccess: () => {
      toast.success("Contraseña cambiada", {
        description: "La anterior deja de servir en cuanto cierre sesión.",
      });
      setClave(null);
      setNuevaClave("");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const eliminar = useMutation({
    mutationFn: (id: string) => usersService.eliminar(id),
    onSuccess: () => {
      toast.success("Cuenta eliminada");
      refrescar();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cerrar = () => {
    setAbierto(false);
    setEditando(null);
    setBorrador(null);
  };

  const abrirNuevo = () => {
    setEditando(null);
    setBorrador(vacio(catalogo.data ?? []));
    setAbierto(true);
  };

  const abrirEdicion = (u: UsuarioOrg) => {
    setEditando(u);
    setBorrador({
      nombre: u.nombre ?? "",
      email: u.email,
      contrasena: "",
      rol: u.rol,
      // Sin permisos explícitos el usuario los tiene todos por su rol; se
      // muestran marcados para que editar no se sienta como empezar de cero.
      permisos: new Set(
        u.permisos.length ? u.permisos : (catalogo.data ?? []).map((c) => c.permiso),
      ),
    });
    setAbierto(true);
  };

  const alterna = (permiso: string, marcado: boolean) => {
    setBorrador((b) => {
      if (!b) return b;
      const permisos = new Set(b.permisos);
      if (marcado) permisos.add(permiso);
      else permisos.delete(permiso);
      return { ...b, permisos };
    });
  };

  const guardar = () => {
    if (!borrador) return;
    if (!borrador.nombre.trim()) return toast.error("Falta el nombre");
    if (editando) return actualizar.mutate({ id: editando.id, b: borrador });
    if (!borrador.email.includes("@")) return toast.error("El correo no es válido");
    if (borrador.contrasena.length < MIN_CONTRASENA) {
      return toast.error(`La contraseña necesita al menos ${MIN_CONTRASENA} caracteres`);
    }
    crear.mutate(borrador);
  };

  /** El permiso exige un rol que el borrador no tiene: se muestra apagado. */
  const bloqueado = (p: PermisoCatalogo) =>
    !!p.requiere_rol && !!borrador && !p.requiere_rol.includes(borrador.rol);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="text-base">Usuarios</CardTitle>
          <CardDescription>
            Quién entra a la plataforma y qué puede ver. Imprimir y exportar queda reservado a
            administradores y asesores.
          </CardDescription>
        </div>
        <Button size="sm" onClick={abrirNuevo} disabled={catalogo.isLoading}>
          <UserPlus className="mr-2 h-4 w-4" /> Nuevo usuario
        </Button>
      </CardHeader>

      <CardContent className="p-0">
        {usuarios.isLoading && <Skeleton className="m-4 h-40" />}
        {usuarios.isError && (
          <div className="p-4">
            <ErrorState
              error={usuarios.error}
              what="los usuarios"
              onRetry={() => void usuarios.refetch()}
              compact
            />
          </div>
        )}

        {usuarios.data && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-2">Nombre</th>
                  <th className="px-4 py-2">Correo</th>
                  <th className="px-4 py-2">Rol</th>
                  <th className="px-4 py-2">Acceso a</th>
                  <th className="px-4 py-2">Último acceso</th>
                  <th className="px-4 py-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {usuarios.data.map((u) => (
                  <tr key={u.id} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-2 font-medium">
                      {u.nombre || "—"}
                      {u.soy_yo && <span className="ml-2 text-xs text-muted-foreground">(tú)</span>}
                    </td>
                    <td className="px-4 py-2 text-xs">{u.email}</td>
                    <td className="px-4 py-2">
                      <Badge variant={u.rol === "ADMIN" ? "default" : "secondary"}>
                        {ROL_ETIQUETA[u.rol] ?? u.rol}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {u.permisos.length === 0
                        ? "Todo lo de su rol"
                        : `${u.permisos.filter((p) => !p.includes(".")).length} pantallas`}
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {u.ultimo_acceso
                        ? new Date(u.ultimo_acceso).toLocaleDateString("es-MX")
                        : "Nunca"}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          aria-label={`Editar ${u.email}`}
                          onClick={() => abrirEdicion(u)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          aria-label={`Cambiar contraseña de ${u.email}`}
                          onClick={() => {
                            setClave(u);
                            setNuevaClave("");
                          }}
                        >
                          <KeyRound className="h-4 w-4" />
                        </Button>
                        {!u.soy_yo && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            aria-label={`Eliminar ${u.email}`}
                            onClick={() => {
                              if (
                                window.confirm(
                                  `¿Eliminar la cuenta de ${u.email}? Pierde el acceso de inmediato y no se puede deshacer.`,
                                )
                              ) {
                                eliminar.mutate(u.id);
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      {/* Alta y edición */}
      <Dialog open={abierto} onOpenChange={(v) => (v ? setAbierto(true) : cerrar())}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-[640px]">
          <DialogHeader>
            <DialogTitle>{editando ? `Editar ${editando.email}` : "Nuevo usuario"}</DialogTitle>
            <DialogDescription>
              {editando
                ? "Cambia su rol y qué pantallas puede abrir."
                : "La cuenta queda lista para entrar de inmediato con el correo y la contraseña que pongas."}
            </DialogDescription>
          </DialogHeader>

          {borrador && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="usuario-nombre">Nombre</Label>
                  <Input
                    id="usuario-nombre"
                    value={borrador.nombre}
                    onChange={(e) => setBorrador({ ...borrador, nombre: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="usuario-email">Correo</Label>
                  <Input
                    id="usuario-email"
                    type="email"
                    autoComplete="off"
                    value={borrador.email}
                    disabled={!!editando}
                    onChange={(e) => setBorrador({ ...borrador, email: e.target.value })}
                  />
                </div>
              </div>

              {!editando && (
                <div className="space-y-2">
                  <Label htmlFor="usuario-clave">Contraseña</Label>
                  <Input
                    id="usuario-clave"
                    type="password"
                    autoComplete="new-password"
                    value={borrador.contrasena}
                    onChange={(e) => setBorrador({ ...borrador, contrasena: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Mínimo {MIN_CONTRASENA} caracteres. Anótala antes de guardar: después solo se
                    puede reemplazar, no consultar.
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label>Rol</Label>
                <Select
                  value={borrador.rol}
                  onValueChange={(v) => setBorrador({ ...borrador, rol: v as AppRole })}
                >
                  <SelectTrigger aria-label="Rol del usuario">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLES_ASIGNABLES.map((r) => (
                      <SelectItem key={r.valor} value={r.valor}>
                        {r.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {ROLES_ASIGNABLES.find((r) => r.valor === borrador.rol)?.descripcion}
                </p>
              </div>

              <div className="space-y-3">
                <Label>Puede ver y usar</Label>
                {grupos.map(([grupo, permisos]) => (
                  <div key={grupo} className="rounded-md border border-border/60 p-3">
                    <p className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">
                      {grupo}
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {permisos.map((p) => {
                        const apagado = bloqueado(p);
                        return (
                          <label
                            key={p.permiso}
                            className={`flex items-start gap-2 text-sm ${apagado ? "opacity-50" : ""}`}
                          >
                            <Checkbox
                              checked={borrador.permisos.has(p.permiso) && !apagado}
                              disabled={apagado}
                              onCheckedChange={(v) => alterna(p.permiso, v === true)}
                              aria-label={p.etiqueta}
                            />
                            <span>
                              <span className="font-medium">{p.etiqueta}</span>
                              {p.descripcion && (
                                <span className="block text-xs text-muted-foreground">
                                  {apagado
                                    ? `Solo para ${p.requiere_rol
                                        ?.map((r) => ROL_ETIQUETA[r] ?? r)
                                        .join(" o ")}`
                                    : p.descripcion}
                                </span>
                              )}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={cerrar}>
              Cancelar
            </Button>
            <Button onClick={guardar} disabled={crear.isPending || actualizar.isPending}>
              {crear.isPending || actualizar.isPending
                ? "Guardando…"
                : editando
                  ? "Guardar cambios"
                  : "Crear usuario"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Contraseña nueva */}
      <Dialog open={!!clave} onOpenChange={(v) => !v && setClave(null)}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Contraseña nueva</DialogTitle>
            <DialogDescription>
              Para {clave?.email}. La anterior deja de servir y no se puede recuperar.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="clave-nueva">Contraseña</Label>
            <Input
              id="clave-nueva"
              type="password"
              autoComplete="new-password"
              value={nuevaClave}
              onChange={(e) => setNuevaClave(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Mínimo {MIN_CONTRASENA} caracteres.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClave(null)}>
              Cancelar
            </Button>
            <Button
              disabled={nuevaClave.length < MIN_CONTRASENA || cambiarClave.isPending}
              onClick={() => clave && cambiarClave.mutate({ id: clave.id, contrasena: nuevaClave })}
            >
              {cambiarClave.isPending ? "Guardando…" : "Cambiar contraseña"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
