import { Link, useRouterState } from "@tanstack/react-router";
import { Home, LayoutGrid, ShoppingCart, User } from "lucide-react";
import { useCart } from "@/hooks/use-cart";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";

export function MobileBottomNav() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { count, setOpen } = useCart();
  const { user } = useAuth();

  const items = [
    { to: "/shop", icon: Home, label: "首頁" },
    { to: "/shop/products", icon: LayoutGrid, label: "分類" },
  ];

  // 點擊時要有明顯視覺回饋：底色 + 縮放 + 加粗
  const base =
    "relative flex flex-col items-center justify-center gap-1 text-[10px] transition-all duration-150 select-none " +
    "active:scale-95 active:bg-primary/15 active:text-primary tap-highlight-transparent touch-manipulation";
  const activeCls = "text-primary font-semibold bg-primary/10";
  const inactiveCls = "text-muted-foreground";

  const accountActive = path.startsWith("/shop/account");

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border/60 bg-background/95 backdrop-blur-xl pb-[env(safe-area-inset-bottom)]">
      <div className="grid grid-cols-4 h-16">
        {items.map((it) => {
          const active = path === it.to || (it.to !== "/shop" && path.startsWith(it.to));
          return (
            <Link key={it.to} to={it.to} className={`${base} ${active ? activeCls : inactiveCls}`}>
              {active && <span className="absolute top-0 left-1/2 -translate-x-1/2 h-0.5 w-8 rounded-full bg-primary" />}
              <it.icon className="h-5 w-5" />
              {it.label}
            </Link>
          );
        })}
        <button type="button" onClick={() => setOpen(true)} className={`${base} ${inactiveCls}`}>
          <ShoppingCart className="h-5 w-5" />
          購物車
          {count > 0 && <Badge className="absolute top-2 right-6 h-4 min-w-4 px-1 rounded-full text-[9px]">{count}</Badge>}
        </button>
        <Link
          to={user ? "/shop/account" : "/login"}
          className={`${base} ${accountActive ? activeCls : inactiveCls}`}
        >
          {accountActive && <span className="absolute top-0 left-1/2 -translate-x-1/2 h-0.5 w-8 rounded-full bg-primary" />}
          <User className="h-5 w-5" />
          會員
        </Link>
      </div>
    </nav>
  );
}
