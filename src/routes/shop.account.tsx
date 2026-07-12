import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { UserCircle, MapPin, ShoppingBag, LogOut, LayoutDashboard, Coins, Crown, Wallet, Store } from "lucide-react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/shop/account")({
  component: AccountLayout,
  head: () => ({ meta: [{ title: "會員中心 — 源晶商城" }] }),
});

const NAV = [
  { to: "/shop/account", label: "總覽", icon: LayoutDashboard, exact: true },
  { to: "/shop/account/profile", label: "個人資料", icon: UserCircle },
  { to: "/shop/account/storefront", label: "個人品牌頁管理", icon: Store },
  { to: "/shop/account/addresses", label: "收件地址", icon: MapPin },
  { to: "/shop/account/orders", label: "我的訂單", icon: ShoppingBag },
  { to: "/shop/account/points", label: "我的點數 / 推薦", icon: Coins },
  { to: "/shop/account/wallet", label: "現金錢包", icon: Wallet },
  { to: "/shop/vip", label: "VIP 升級", icon: Crown },
];

function AccountLayout() {
  const { user, loading, signOut } = useAuth();
  const nav = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [vipTier, setVipTier] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) nav({ to: "/login" });
  }, [user, loading, nav]);

  useEffect(() => {
    if (!user) { setVipTier(null); return; }
    (async () => {
      const [{ data: tierStatus }, { data: profile }] = await Promise.all([
        supabase.from("dealer_tier_status").select("current_tier").eq("user_id", user.id).maybeSingle(),
        supabase.from("profiles").select("vip_tier,is_vip,legacy_rank").eq("id", user.id).maybeSingle(),
      ]);
      const tier =
        (tierStatus?.current_tier as string | null) ||
        (profile?.vip_tier as string | null) ||
        (profile?.legacy_rank as string | null) ||
        (profile?.is_vip ? "VIP" : "一般會員");
      setVipTier(tier);
    })();
  }, [user?.id]);


  if (loading || !user) {
    return (
      <div className="container mx-auto px-4 py-20 flex justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3 flex-wrap">
          會員中心
          <Badge variant="secondary" className="text-sm font-medium inline-flex items-center gap-1">
            <Crown className="h-3.5 w-3.5" />
            {vipTier ?? "載入中…"}
          </Badge>
        </h1>
        <p className="text-sm text-muted-foreground mt-1">{user.email}</p>
      </div>
      <div className="grid lg:grid-cols-[240px_1fr] gap-6">
        <aside className="space-y-1">
          {NAV.map((n) => {
            const active = n.exact ? path === n.to : path === n.to || path.startsWith(n.to + "/");
            return (
              <Link
                key={n.to}
                to={n.to}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition ${
                  active
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                <n.icon className="h-4 w-4" />
                {n.label}
              </Link>
            );
          })}
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 text-muted-foreground hover:text-destructive mt-4"
            onClick={async () => {
              await signOut();
              nav({ to: "/shop" });
            }}
          >
            <LogOut className="h-4 w-4" />
            登出
          </Button>
        </aside>
        <div className="min-w-0">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
