import { createFileRoute } from "@tanstack/react-router";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/_authenticated/configuracion")({
  head: () => ({
    meta: [
      { title: "Configuración | Territorio Intelligence" },
      {
        name: "description",
        content: "Perfil de la cuenta, roles asignados y políticas de uso de datos de la plataforma.",
      },
      { property: "og:title", content: "Configuración | Territorio Intelligence" },
      {
        property: "og:description",
        content: "Consulta tu perfil, permisos y las restricciones éticas de la plataforma.",
      },
    ],
  }),
  component: ConfiguracionPage,
});

function ConfiguracionPage() {
  const { profile, roles, user } = useAuth();

  return (
    <>
      <PageHeader title="Configuración" description="Perfil, permisos y políticas de datos." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cuenta</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p><span className="text-muted-foreground">Nombre: </span>{profile?.full_name ?? "—"}</p>
            <p><span className="text-muted-foreground">Correo: </span>{user?.email ?? "—"}</p>
            <div className="flex flex-wrap items-center gap-2 pt-2">
              <span className="text-muted-foreground">Roles:</span>
              {roles.length === 0 && <Badge variant="secondary">VIEWER</Badge>}
              {roles.map((r) => (
                <Badge key={r}>{r}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Políticas de uso de datos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>· Los datos demográficos se presentan únicamente de forma agregada por sección.</p>
            <p>· No se infieren ni almacenan preferencias políticas, afiliación o intención de voto.</p>
            <p>· El registro de contactos requiere consentimiento explícito y es auditable.</p>
            <p>· El monitoreo se limita a contenidos públicos de figuras y temas públicos.</p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
