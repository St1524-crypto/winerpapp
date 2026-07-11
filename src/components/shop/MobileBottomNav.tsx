import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Home, Menu, ShoppingCart, User } from "lucide-react";
import { useCart } from "@/hooks/use-cart";
import { useAuth } from "@/hooks/use-auth";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

const MENU_ITEMS: { to: string; label: string; highlight?: boolean }[] = [
  { to: "/shop", label: "首頁" },
  { to: "/shop/products", label: "全部商品" },
  { to: "/shop/wholesale", label: "批發專區", highlight: true },
  { to: "/shop/patents", label: "專利檢驗區" },
  { to: "/shop/news", label: "最新消息" },
  { to: "/shop/health", label: "健康學術" },
  { to: "/shop/academy", label: "源晶 AI 商學院" },
];

export function MobileBottomNav() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { count, setOpen } = useCart();
  const { user } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  const base =
    "relative flex flex-col items-center justify-center gap-1 text-[13px] font-semibold transition-all duration-150 select-none " +
    "active:scale-90 active:bg-primary/30 active:text-primary tap-highlight-transparent touch-manipulation";
  const activeCls = "text-primary font-extrabold bg-primary/15";
  const inactiveCls = "text-muted-foreground hover:text-foreground";

  const homeActive = path === "/shop";
  const accountActive = path.startsWith("/shop/account");
  const cartActive = false;

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
    <>
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border/60 bg-background/95 backdrop-blur-xl pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-4 h-[68px]">
          <Link to="/shop" className={`${base} ${homeActive ? activeCls : inactiveCls}`}>
            {homeActive && <span className="absolute top-0 left-1/2 -translate-x-1/2 h-1 w-10 rounded-b-full bg-primary" />}
            {renderIcon(Home, homeActive)}
            <span>首頁</span>
          </Link>
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className={`${base} ${inactiveCls}`}
          >
            {renderIcon(Menu, false)}
            <span>選單</span>
          </button>
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

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[80vh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>選單</SheetTitle>
          </SheetHeader>
          <div className="mt-4 grid grid-cols-1 gap-1 pb-6">
            {MENU_ITEMS.map((item) => {
              const active =
                item.to === "/shop"
                  ? path === "/shop"
                  : path === item.to || path.startsWith(item.to + "/");
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setMenuOpen(false)}
                  className={
                    "px-4 py-3 rounded-lg font-semibold transition-all tap-highlight-transparent touch-manipulation " +
                    (active
                      ? "bg-primary text-primary-foreground"
                      : item.highlight
                        ? "text-primary hover:bg-primary/10"
                        : "text-foreground hover:bg-accent")
                  }
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
