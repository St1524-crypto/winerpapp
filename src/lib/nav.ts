import {
  LayoutDashboard, Package, Boxes, ShoppingCart, Truck,
  Users, Wallet, UserCircle, Settings, Settings2, ShieldCheck, Tag, Crown,
  Store, Factory, Warehouse as WarehouseIcon, PackageCheck, ArrowRightLeft,
  Building2, UserCog, Briefcase, ShoppingBag, Megaphone, Coins, TrendingUp, Search, Network,
} from "lucide-react";
import type { AppRole } from "@/hooks/use-auth";

export interface NavItem {
  title: string;
  url: string;
  icon: any;
  roles: AppRole[]; // empty = all
}

export const NAV_ITEMS: NavItem[] = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, roles: [] },
  { title: "B2C 商城前台", url: "/shop", icon: ShoppingBag, roles: [] },
  { title: "管理員控制台", url: "/admin", icon: Crown, roles: ["super_admin"] },
  { title: "商品管理", url: "/products", icon: Package, roles: ["super_admin", "sales", "warehouse"] },
  { title: "商品分類", url: "/categories", icon: Tag, roles: ["super_admin", "sales", "warehouse"] },
  { title: "庫存管理", url: "/inventory", icon: Boxes, roles: ["super_admin", "warehouse"] },
  { title: "訂單管理", url: "/orders", icon: ShoppingCart, roles: ["super_admin", "sales", "finance"] },
  { title: "供應商管理", url: "/suppliers", icon: Building2, roles: ["super_admin", "warehouse", "finance"] },
  { title: "B2B 廠商會員", url: "/b2b/accounts", icon: Briefcase, roles: ["super_admin", "sales", "finance"] },
  { title: "採購管理", url: "/purchases", icon: Truck, roles: ["super_admin", "warehouse", "vendor"] },
  { title: "進貨管理", url: "/receiving", icon: PackageCheck, roles: ["super_admin", "warehouse"] },
  { title: "倉庫管理", url: "/warehouses", icon: WarehouseIcon, roles: ["super_admin", "warehouse"] },
  { title: "庫存異動", url: "/inventory-tx", icon: ArrowRightLeft, roles: ["super_admin", "warehouse"] },
  { title: "客戶管理", url: "/customers", icon: Users, roles: ["super_admin", "sales"] },
  { title: "經銷商管理", url: "/dealers", icon: Store, roles: ["super_admin", "sales", "finance"] },
  { title: "廠商管理", url: "/vendors", icon: Factory, roles: ["super_admin", "warehouse", "finance"] },
  { title: "財務管理", url: "/finance", icon: Wallet, roles: ["super_admin", "finance"] },
  { title: "會員管理", url: "/members", icon: UserCircle, roles: ["super_admin"] },
  { title: "進階會員查詢", url: "/admin/member-search", icon: Search, roles: ["super_admin", "admin"] },
  { title: "推薦組織圖", url: "/admin/referral-tree", icon: Network, roles: ["super_admin", "admin", "finance", "sales"] },
  { title: "使用者角色管理", url: "/user-roles", icon: UserCog, roles: ["super_admin"] },
  { title: "點數管理", url: "/points-admin", icon: Coins, roles: ["super_admin", "finance", "sales"] },
  { title: "現金錢包審核", url: "/cash-admin", icon: Wallet, roles: ["super_admin", "finance", "admin"] },
  { title: "VIP 方案管理", url: "/vip-plans", icon: Crown, roles: ["super_admin", "sales"] },
  { title: "經銷商階級管理", url: "/dealer-tiers", icon: TrendingUp, roles: ["super_admin", "admin", "finance"] },
  { title: "經銷商制度設定", url: "/dealer-program", icon: Settings2, roles: ["super_admin", "admin", "finance"] },
  { title: "客服重要通知", url: "/support-announcements", icon: Megaphone, roles: ["super_admin", "admin", "sales"] },
  { title: "拼團管理", url: "/group-buy-admin", icon: Users, roles: ["super_admin", "admin", "sales"] },
  { title: "拼團與獎勵設定", url: "/group-buy-settings", icon: Settings2, roles: ["super_admin", "admin"] },
  { title: "Webhook 管理", url: "/webhooks-admin", icon: Network, roles: ["super_admin", "admin"] },
  { title: "系統設定", url: "/settings", icon: Settings, roles: ["super_admin", "admin"] },
  { title: "RLS 存取測試", url: "/rls-test", icon: ShieldCheck, roles: ["super_admin"] },
];

export const ROLE_LABELS: Record<AppRole, string> = {
  super_admin: "超級管理員",
  admin: "管理員",
  finance: "財務人員",
  warehouse: "倉庫人員",
  sales: "業務人員",
  vendor: "廠商",
  member: "一般會員",
};

export function filterNav(roles: AppRole[]): NavItem[] {
  return NAV_ITEMS.filter((i) => i.roles.length === 0 || i.roles.some((r) => roles.includes(r)) || roles.includes("super_admin"));
}
