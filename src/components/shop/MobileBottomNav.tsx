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

  // 點擊要有明顯視覺回饋：底色 + 主色文字 + 縮放 + 上方指示條 + 圖示背景
  const base =
    "relative flex flex-col items-center justify-center gap-1 text-[13px] font-semibold transition-all duration-150 select-none " +
    "active:scale-90 active:bg-primary/30 active:text-primary tap-highlight-transparent touch-manipulation";
  const activeCls = "text-primary font-extrabold bg-primary/15";
  const inactiveCls = "text-muted-foreground hover:text-foreground";

  const accountActive = path.startsWith("/shop/account");
  const cartActive = false; // 購物車以彈窗方式呈現，不參與 path 判斷

  const renderIcon = (Icon: typeof Home, active: boolean) => (
    <span
      className={
        "flex items-center justify-center rounded-full transition-all duration-200 " +
        (active ? "bg-primary text-primary-foreground h-9 w-9 shadow-md shadow-primary/40 scale-110" : "h-7 w-7")
      }
    >
      <Icon className={active ? "h-5 w-5" : "h-6 w-6"} />
    </span>
  );

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border/60 bg-background/95 backdrop-blur-xl pb-[env(safe-area-inset-bottom)]">
      <div className="grid grid-cols-4 h-16">
        {items.map((it) => {
          const active = path === it.to || (it.to !== "/shop" && path.startsWith(it.to));
          return (
            <Link key={it.to} to={it.to} className={`${base} ${active ? activeCls : inactiveCls}`}>
              {active && <span className="absolute top-0 left-1/2 -translate-x-1/2 h-1 w-10 rounded-b-full bg-primary" />}
              {renderIcon(it.icon, active)}
              <span>{it.label}</span>
            </Link>
          );
        })}
        <button type="button" onClick={() => setOpen(true)} className={`${base} ${inactiveCls}`}>
          {renderIcon(ShoppingCart, cartActive)}
          <span>購物車</span>
          {count > 0 && (
            <Badge className="absolute top-1 right-4 h-4 min-w-4 px-1 rounded-full text-[9px]">{count}</Badge>
          )}
        </button>
        <Link
          to={user ? "/shop/account" : "/login"}
          className={`${base} ${accountActive ? activeCls : inactiveCls}`}
        >
          {accountActive && <span className="absolute top-0 left-1/2 -translate-x-1/2 h-1 w-10 rounded-b-full bg-primary" />}
          {renderIcon(User, accountActive)}
          <span>會員</span>
        </Link>
      </div>
    </nav>
  );
}
