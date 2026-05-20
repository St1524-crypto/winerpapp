import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, ShoppingCart, Package, Menu } from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";

export function AdminMobileNav() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { setOpenMobile } = useSidebar();

  const items = [
    { to: "/dashboard", icon: LayoutDashboard, label: "儀表板" },
    { to: "/orders", icon: ShoppingCart, label: "訂單" },
    { to: "/products", icon: Package, label: "商品" },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border/60 bg-background/95 backdrop-blur-xl">
      <div className="grid grid-cols-4 h-16">
        {items.map((it) => {
          const active = path === it.to || path.startsWith(it.to + "/");
          return (
            <Link
              key={it.to}
              to={it.to}
              className={`flex flex-col items-center justify-center gap-1 text-[10px] ${active ? "text-primary" : "text-muted-foreground"}`}
            >
              <it.icon className="h-5 w-5" />
              {it.label}
            </Link>
          );
        })}
        <button
          onClick={() => setOpenMobile(true)}
          className="flex flex-col items-center justify-center gap-1 text-[10px] text-muted-foreground"
        >
          <Menu className="h-5 w-5" />
          選單
        </button>
      </div>
    </nav>
  );
}
