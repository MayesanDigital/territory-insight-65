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

const territorio = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { title: "Mapa Territorial", url: "/mapa", icon: Map },
  { title: "Secciones", url: "/secciones", icon: Layers },
  { title: "Contactos", url: "/contactos", icon: Users },
  { title: "Analytics", url: "/analytics", icon: BarChart3 },
  { title: "Análisis estratégico", url: "/analisis-estrategico", icon: Crosshair },
];

const monitoreo = [
  { title: "Monitor Público", url: "/monitor", icon: Radar },
  { title: "Menciones", url: "/menciones", icon: MessageSquareQuote },
  { title: "Comparativo", url: "/comparativo", icon: GitCompare },
];

const gestion = [
  { title: "Reportes", url: "/reportes", icon: FileText },
  { title: "Importar datos", url: "/importar", icon: Upload },
  { title: "Configuración", url: "/configuracion", icon: Settings },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (r) => r.location.pathname });

  const group = (label: string, items: typeof territorio) => (
    <SidebarGroup>
      {!collapsed && <SidebarGroupLabel>{label}</SidebarGroupLabel>}
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
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
