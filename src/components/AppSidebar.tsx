import { Link, useRouterState } from "@tanstack/react-router";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import { useBranding } from "@/hooks/use-branding";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentCompany } from "@/hooks/use-current-company";
import { filterNav, ROLE_LABELS } from "@/lib/nav";

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { roles, user } = useAuth();
  const { logoUrl } = useBranding();
  const { current } = useCurrentCompany();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const items = filterNav(roles);
  const primaryRole = roles[0];
  const brandName = current?.company_name ?? "ERP 管理系統";

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-3 px-2 py-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white shadow-glow overflow-hidden ring-1 ring-primary/30">
          <img src={logoUrl} alt={brandName} className="h-full w-full object-contain" />
          </div>
          {!collapsed && (
            <div className="flex-1 overflow-hidden">
              <div className="font-bold text-sm leading-tight truncate" title={brandName}>{brandName}</div>
              <div className="text-[10px] text-muted-foreground tracking-wider uppercase">Enterprise Platform</div>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          {!collapsed && <SidebarGroupLabel>主選單</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => {
                const active = pathname === item.url || pathname.startsWith(item.url + "/");
                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild isActive={active} tooltip={item.title}>
                      <Link to={item.url} className="flex items-center gap-3">
                        <item.icon className="h-4 w-4 shrink-0" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {!collapsed && (
        <SidebarFooter className="border-t border-sidebar-border">
          <div className="px-2 py-3 text-xs">
            <div className="font-medium truncate">{user?.email}</div>
            <div className="text-muted-foreground mt-0.5">
              {primaryRole ? ROLE_LABELS[primaryRole] : "未指派角色"}
            </div>
          </div>
        </SidebarFooter>
      )}
    </Sidebar>
  );
}
