import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PRODUCT_PUBLIC_COLUMNS } from "@/hooks/use-products";
import { useAuth } from "@/hooks/use-auth";
import { useVipStatus } from "@/hooks/use-wallet";
import { useDealerStatus } from "@/hooks/use-dealer";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Package, Sparkles, Lock } from "lucide-react";
import { toast } from "sonner";
import type { Product, WholesaleTier } from "@/types/product";

export const Route = createFileRoute("/shop/wholesale")({
  component: WholesaleArea,
  head: () => ({
    meta: [
      { title: "VIP 批發專區 — 源晶商城" },
      { name: "description", content: "依數量階梯享有批發價與額外獎勵點。" },
      { property: "og:title", content: "VIP 批發專區" },
      { property: "og:description", content: "依數量階梯享有批發價與額外獎勵點。" },
    ],
  }),
});

interface WholesaleProduct extends Product {
  tiers: WholesaleTier[];
}

function WholesaleArea() {
  const { user, loading: authLoading } = useAuth();
  const { is_vip, loading: vipLoading } = useVipStatus();
  const { isDealer, loaded: dealerLoaded } = useDealerStatus();
  const navigate = useNavigate();
  const [list, setList] = useState<WholesaleProduct[]>([]);
  const [loading, setLoading] = useState(true);

  const canAccess = is_vip || isDealer;
  const gatesReady = !authLoading && (!user || (!vipLoading && dealerLoaded));

  useEffect(() => {
    if (!authLoading && !user) {
      navigate({ to: "/login" });
    }
  }, [authLoading, user, navigate]);

  // 非 VIP / 非經銷商不再自動跳轉，改為顯示藝術提示頁


  useEffect(() => {
    if (!user || !gatesReady || !canAccess) return;
    (async () => {
      setLoading(true);
      // RLS 已限制只回傳 visibility='all' 或會員可見的 vip / dealer 階梯
      const { data: tiers } = await supabase
        .from("product_wholesale_tiers" as any)
        .select("*")
        .in("visibility", ["vip", "dealer"])
        .order("min_qty", { ascending: true });
      const tiersByProduct: Record<string, WholesaleTier[]> = {};
      for (const t of ((tiers ?? []) as any as WholesaleTier[])) {
        const pid = (t as any).product_id as string;
        (tiersByProduct[pid] = tiersByProduct[pid] ?? []).push(t);
      }
      const ids = Object.keys(tiersByProduct);
      if (ids.length === 0) {
        setList([]);
        setLoading(false);
        return;
      }
      const { data: products } = await supabase
        .from("products")
        .select(PRODUCT_PUBLIC_COLUMNS)
        .in("id", ids)
        .eq("status", "active");
      const result: WholesaleProduct[] = ((products ?? []) as Product[]).map((p) => ({
        ...p,
        tiers: tiersByProduct[p.id] ?? [],
      }));
      setList(result);
      setLoading(false);
    })();
  }, [user, gatesReady, canAccess]);

  if (authLoading || !user || !gatesReady) {
    return <div className="container mx-auto px-4 py-16 text-center text-muted-foreground">驗證會員身分…</div>;
  }

  if (!canAccess) {
    return (
      <div className="relative min-h-[80vh] overflow-hidden flex items-center justify-center px-4 py-16">
        {/* 藝術背景 */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-background to-primary/10" />
        <div className="absolute -top-32 -left-32 h-96 w-96 rounded-full bg-primary/30 blur-3xl animate-pulse" />
        <div className="absolute -bottom-40 -right-32 h-[28rem] w-[28rem] rounded-full bg-amber-400/20 blur-3xl animate-pulse" />
        <div className="absolute top-1/3 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-fuchsia-400/10 blur-3xl" />

        <div className="relative z-10 max-w-3xl w-full text-center space-y-8">
          <div className="mx-auto h-20 w-20 rounded-2xl bg-gradient-to-br from-primary to-amber-500 grid place-items-center text-primary-foreground shadow-2xl shadow-primary/40">
            <Lock className="h-10 w-10" />
          </div>

          <div className="space-y-4">
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-black tracking-tight leading-tight bg-gradient-to-br from-primary via-foreground to-primary/70 bg-clip-text text-transparent">
              批發專區
              <br />
              專屬合作夥伴
            </h1>
            <p className="text-lg md:text-2xl font-semibold text-foreground/80">
              請先申請成為 <span className="text-primary">VIP 會員</span> 或 <span className="text-primary">經銷商</span>
              <br className="hidden md:block" />
              才可進入批發專區
            </p>
          </div>

          <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button asChild size="lg" className="text-base px-8 h-12 shadow-xl shadow-primary/30">
              <a href="https://winerp.app/cooperation/apply">立即申請合作</a>
            </Button>
            <Button asChild size="lg" variant="ghost" className="text-base h-12">
              <Link to="/shop">返回商城</Link>
            </Button>
          </div>

          <p className="text-xs md:text-sm text-muted-foreground pt-6">
            申請網址：<span className="font-mono text-foreground/70">https://winerp.app/cooperation/apply</span>
          </p>
        </div>
      </div>
    );
  }


  return (
    <div className="container mx-auto px-4 py-6 md:py-10 space-y-6">
      <div className="rounded-2xl p-6 md:p-8 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent border border-primary/20">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary to-primary/60 grid place-items-center text-primary-foreground">
            <Sparkles className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">VIP 批發專區</h1>
            <p className="text-sm text-muted-foreground mt-1">買越多越便宜，獎勵點同步加碼</p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-64" />)}
        </div>
      ) : list.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <Package className="h-10 w-10 mx-auto mb-3 opacity-40" />
          目前尚無批發商品
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {list.map((p) => <WholesaleCard key={p.id} product={p} />)}
        </div>
      )}
    </div>
  );
}

function WholesaleCard({ product }: { product: WholesaleProduct }) {
  const lowest = product.tiers.reduce(
    (min, t) => (Number(t.unit_price) < min ? Number(t.unit_price) : min),
    Number.POSITIVE_INFINITY,
  );
  return (
    <Link
      to="/shop/product/$id"
      params={{ id: product.id }}
      className="group rounded-2xl border border-border/60 bg-card overflow-hidden hover:border-primary/40 hover:shadow-xl hover:shadow-primary/10 transition-all"
    >
      <div className="aspect-square bg-muted overflow-hidden">
        {product.image ? (
          <img src={product.image} alt={product.name} className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-500" />
        ) : (
          <div className="h-full w-full grid place-items-center text-xs text-muted-foreground">無圖</div>
        )}
      </div>
      <div className="p-4 space-y-3">
        <div className="space-y-1">
          <div className="font-medium line-clamp-2 group-hover:text-primary transition-colors">{product.name}</div>
          <div className="text-[11px] text-muted-foreground">{product.sku}</div>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-xs text-muted-foreground">最低</span>
          <span className="text-xl font-bold text-primary tabular-nums">NT$ {lowest.toLocaleString()}</span>
          <Badge variant="outline" className="ml-auto border-primary/40 text-primary text-[10px]">批發價</Badge>
        </div>
        <div className="space-y-1 pt-2 border-t border-border/40">
          {product.tiers.map((t) => (
            <div key={t.id ?? `${t.min_qty}`} className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">
                {t.min_qty}{t.max_qty == null ? "+" : `–${t.max_qty}`} 件
              </span>
              <span className="tabular-nums">
                NT$ {Number(t.unit_price).toLocaleString()} <span className="text-muted-foreground">/件</span>
                <span className="ml-2 text-amber-600">+{t.unit_reward_points} 點</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </Link>
  );
}
