import { Link, useRouterState } from "@tanstack/react-router";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import { useBranding } from "@/hooks/use-branding";
import { useCurrentCompany } from "@/hooks/use-current-company";
import { useAuth } from "@/hooks/use-auth";
import { ROLE_LABELS } from "@/lib/nav";
import {
  Crown, LayoutDashboard, Users, ShieldCheck, Shield, Settings, Bell, FileClock,
  Package, Tag, Boxes, ShoppingCart, Truck, UserCircle, Wallet, ArrowLeft, Database, KeyRound, Building2, Store,
  Share2, TrendingUp, Coins, LayoutTemplate, Briefcase, ClipboardList, Clock, Sparkles, FileText,
} from "lucide-react";

interface AdminNavItem { title: string; url: string; icon: any; roles?: string[]; }
interface AdminNavGroup { label: string; items: AdminNavItem[]; }

const GROUPS: AdminNavGroup[] = [
  {
    label: "控制中心",
    items: [
      { title: "管理首頁", url: "/admin", icon: LayoutDashboard },
      { title: "公司管理", url: "/admin/companies", icon: Building2 },
      { title: "營運儀表板", url: "/dashboard", icon: Database },
    ],
  },
  {
    label: "身份與安全",
    items: [
      { title: "會員管理", url: "/members", icon: Users },
      { title: "角色批次管理", url: "/admin/role-manager", icon: KeyRound },
      { title: "角色權限", url: "/rls-test", icon: ShieldCheck },
      { title: "安全中心", url: "/admin/security", icon: Shield },
      { title: "個人資料", url: "/settings", icon: UserCircle },
    ],
  },
  {
    label: "商品與營運",
    items: [
      { title: "商品管理", url: "/products", icon: Package },
      { title: "商品分類", url: "/categories", icon: Tag },
      { title: "庫存管理", url: "/inventory", icon: Boxes },
      { title: "訂單管理", url: "/orders", icon: ShoppingCart },
      { title: "採購管理", url: "/purchases", icon: Truck },
      { title: "客戶管理", url: "/customers", icon: Users },
      { title: "財務管理", url: "/finance", icon: Wallet },
    ],
  },
  {
    label: "VIP 行銷推薦",
    items: [
      { title: "VIP 方案管理", url: "/vip-plans", icon: Crown },
      { title: "VIP 階級設定", url: "/admin/vip-tiers", icon: Crown },
      { title: "VIP 升級套組", url: "/admin/vip-upgrade-packages", icon: Crown },
      { title: "VIP 升級分紅上限", url: "/admin/vip-upgrade-bonus-cap", icon: Crown },
      { title: "VIP 營業分紅上限", url: "/admin/vip-business-bonus-cap", icon: Crown },
      { title: "VIP 星級分紅池", url: "/admin/vip-bonus-pools", icon: Crown },
      { title: "升級分紅總收益上限", url: "/admin/vip-upgrade-bonus-total-earnings", icon: Crown },
      { title: "推廣總覽 / 結算", url: "/admin/referrals", icon: TrendingUp, roles: ["super_admin", "admin", "finance", "sales"] },
      { title: "獎金營運中心", url: "/admin/bonuses", icon: Coins, roles: ["super_admin", "admin"] },
      { title: "獎金管理中心", url: "/admin/bonus-center", icon: Coins, roles: ["super_admin", "admin", "finance"] },
      { title: "我的推廣收益", url: "/my-referrals", icon: Share2 },
    ],
  },
  {
    label: "會員品牌頁",
    items: [
      { title: "品牌頁版模管理", url: "/admin/storefront-templates", icon: LayoutTemplate },
    ],
  },
  {
    label: "營運協作 / AI 助理",
    items: [
      { title: "營運中心總覽", url: "/admin/operations", icon: Briefcase },
      { title: "協作成員", url: "/admin/operations/members", icon: Users },
      { title: "任務管理", url: "/admin/operations/tasks", icon: ClipboardList },
      { title: "打卡紀錄", url: "/admin/operations/attendance", icon: Clock },
      { title: "AI 行政助理", url: "/admin/operations/assistant", icon: Sparkles },
    ],
  },
  {
    label: "系統與工具",
    items: [
      { title: "系統設定", url: "/settings", icon: Settings },
      { title: "通知中心", url: "/admin", icon: Bell },
      { title: "稽核紀錄", url: "/admin/audit-logs", icon: FileClock },
    ],
  },
];

export function AdminSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const { user, roles } = useAuth();
  const { logoUrl } = useBranding();
  const { current } = useCurrentCompany();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const brandName = current?.company_name ?? "ERP 管理系統";
  const brandLogo = current?.logo_url || logoUrl;

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="border-b border-sidebar-border bg-gradient-to-br from-primary/10 via-transparent to-transparent">
        <div className="flex items-center gap-3 px-2 py-3">
          <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white shadow-glow overflow-hidden ring-1 ring-primary/40">
            <img src={brandLogo} alt={brandName} className="h-full w-full object-contain" />
            <span className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-gradient-primary ring-1 ring-background">
              <Crown className="h-2 w-2 text-primary-foreground" />
            </span>
          </div>
          {!collapsed && (
            <div className="flex-1 overflow-hidden">
              <div className="font-bold text-sm leading-tight flex items-center gap-1.5">
                <span className="truncate" title={brandName}>{brandName}</span>
                <span className="rounded-sm bg-primary/20 text-primary text-[9px] px-1 py-0.5 font-bold tracking-wider shrink-0">ADMIN</span>
              </div>
              <div className="text-[10px] text-muted-foreground tracking-wider uppercase">Super Admin Console</div>
            </div>
          )}
        </div>
      </SidebarHeader>

      <SidebarContent>
        {GROUPS.map((group) => (
          <SidebarGroup key={group.label}>
            {!collapsed && <SidebarGroupLabel>{group.label}</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  if (item.roles && !item.roles.some((r) => roles.includes(r as any))) return null;
                  const active = pathname === item.url;
                  return (
                    <SidebarMenuItem key={`${group.label}-${item.title}`}>
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
        ))}

        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="回首頁">
                  <Link to="/shop" className="flex items-center gap-3 text-muted-foreground hover:text-foreground">
                    <Store className="h-4 w-4 shrink-0" />
                    <span>回首頁</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {!collapsed && (
        <SidebarFooter className="border-t border-sidebar-border">
          <div className="px-2 py-3 text-xs space-y-0.5">
            <div className="flex items-center gap-1.5">
              <Crown className="h-3 w-3 text-primary" />
              <span className="font-medium truncate">{user?.email}</span>
            </div>
            <div className="text-muted-foreground pl-4.5">
              {roles[0] ? ROLE_LABELS[roles[0]] : "未指派角色"}
            </div>
          </div>
        </SidebarFooter>
      )}
    </Sidebar>
  );
}
