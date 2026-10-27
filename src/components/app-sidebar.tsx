import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Map,
  Layers,
  Users,
  BarChart3,
  Crosshair,
  Radar,
  MessageSquareQuote,
  GitCompare,
  FileText,
  Settings,
  Upload,
} from "lucide-react";

import { useAuth } from "@/hooks/useAuth";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

// `permiso` es la clave del catálogo que da acceso a esa pantalla.
const territorio = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, permiso: "dashboard" },
  { title: "Mapa Territorial", url: "/mapa", icon: Map, permiso: "mapa" },
  { title: "Secciones", url: "/secciones", icon: Layers, permiso: "secciones" },
  { title: "Contactos", url: "/contactos", icon: Users, permiso: "contactos" },
  { title: "Analytics", url: "/analytics", icon: BarChart3, permiso: "analytics" },
  {
    title: "Análisis estratégico",
    url: "/analisis-estrategico",
    icon: Crosshair,
    permiso: "analisis-estrategico",
  },
];

const monitoreo = [
  { title: "Monitor Público", url: "/monitor", icon: Radar, permiso: "monitor" },
  { title: "Menciones", url: "/menciones", icon: MessageSquareQuote, permiso: "menciones" },
  { title: "Comparativo", url: "/comparativo", icon: GitCompare, permiso: "comparativo" },
];

const gestion = [
  { title: "Reportes", url: "/reportes", icon: FileText, permiso: "reportes" },
  { title: "Importar datos", url: "/importar", icon: Upload, permiso: "importar" },
  { title: "Configuración", url: "/configuracion", icon: Settings, permiso: "configuracion" },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { puede, loading } = useAuth();

  // Mientras carga la sesión se muestra el menú completo: parpadear quitando
  // entradas y devolviéndolas se ve peor que esperar medio segundo, y la
  // pantalla a la que se llegue sin permiso avisa igualmente.
  const visibles = (items: typeof territorio) =>
    loading ? items : items.filter((i) => puede(i.permiso));

  const group = (label: string, items: typeof territorio) => {
    const lista = visibles(items);
    // Un grupo sin entradas no se dibuja: un encabezado solo, sin nada debajo,
    // parece un error de carga.
    if (lista.length === 0) return null;
    return (
    <SidebarGroup>
      {!collapsed && <SidebarGroupLabel>{label}</SidebarGroupLabel>}
      <SidebarGroupContent>
        <SidebarMenu>
          {lista.map((item) => (
            <SidebarMenuItem key={item.url}>
              <SidebarMenuButton asChild isActive={pathname === item.url} tooltip={item.title}>
                <Link to={item.url} className="flex items-center gap-2">
                  <item.icon className="h-4 w-4" />
                  {!collapsed && <span>{item.title}</span>}
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
    );
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border px-4 py-4">
        <Link to="/dashboard" className="flex items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary font-display text-lg font-semibold text-primary-foreground">
            T
          </span>
          {!collapsed && (
            <span className="flex flex-col leading-tight">
              <span className="font-display text-base font-semibold">Territorio</span>
              <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                Intelligence
              </span>
            </span>
          )}
        </Link>
      </SidebarHeader>
      <SidebarContent>
        {group("Territorio", territorio)}
        {group("Monitoreo", monitoreo)}
        {group("Gestión", gestion)}
      </SidebarContent>
    </Sidebar>
  );
}
