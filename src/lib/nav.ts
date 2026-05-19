import {
  LayoutDashboard, Package, Boxes, ShoppingCart, Truck,
  Users, Wallet, UserCircle, Settings,
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
  { title: "商品管理", url: "/products", icon: Package, roles: ["super_admin", "sales", "warehouse"] },
  { title: "庫存管理", url: "/inventory", icon: Boxes, roles: ["super_admin", "warehouse"] },
  { title: "訂單管理", url: "/orders", icon: ShoppingCart, roles: ["super_admin", "sales", "finance"] },
  { title: "採購管理", url: "/purchases", icon: Truck, roles: ["super_admin", "warehouse", "vendor"] },
  { title: "客戶管理", url: "/customers", icon: Users, roles: ["super_admin", "sales"] },
  { title: "財務管理", url: "/finance", icon: Wallet, roles: ["super_admin", "finance"] },
  { title: "會員管理", url: "/members", icon: UserCircle, roles: ["super_admin"] },
  { title: "系統設定", url: "/settings", icon: Settings, roles: ["super_admin"] },
];

export const ROLE_LABELS: Record<AppRole, string> = {
  super_admin: "超級管理員",
  finance: "財務人員",
  warehouse: "倉庫人員",
  sales: "業務人員",
  vendor: "廠商",
  member: "一般會員",
};

export function filterNav(roles: AppRole[]): NavItem[] {
  return NAV_ITEMS.filter((i) => i.roles.length === 0 || i.roles.some((r) => roles.includes(r)) || roles.includes("super_admin"));
}
