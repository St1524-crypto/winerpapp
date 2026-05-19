import { Link, useRouterState } from "@tanstack/react-router";
import { Home, LayoutGrid, ShoppingCart, User } from "lucide-react";
import { useCart } from "@/hooks/use-cart";
import { Badge } from "@/components/ui/badge";

export function MobileBottomNav() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { count, setOpen } = useCart();

  const items = [
    { to: "/shop", icon: Home, label: "首頁" },
    { to: "/shop/products", icon: LayoutGrid, label: "分類" },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border/60 bg-background/95 backdrop-blur-xl">
      <div className="grid grid-cols-4 h-16">
        {items.map((it) => {
          const active = path === it.to || (it.to !== "/shop" && path.startsWith(it.to));
          return (
            <Link key={it.to} to={it.to} className={`flex flex-col items-center justify-center gap-1 text-[10px] ${active ? "text-primary" : "text-muted-foreground"}`}>
              <it.icon className="h-5 w-5" />
              {it.label}
            </Link>
          );
        })}
        <button onClick={() => setOpen(true)} className="flex flex-col items-center justify-center gap-1 text-[10px] text-muted-foreground relative">
          <ShoppingCart className="h-5 w-5" />
          購物車
          {count > 0 && <Badge className="absolute top-2 right-6 h-4 min-w-4 px-1 rounded-full text-[9px]">{count}</Badge>}
        </button>
        <Link to="/login" className="flex flex-col items-center justify-center gap-1 text-[10px] text-muted-foreground">
          <User className="h-5 w-5" />
          會員
        </Link>
      </div>
    </nav>
  );
}
