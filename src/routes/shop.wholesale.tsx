import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Package, Sparkles } from "lucide-react";
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
  const navigate = useNavigate();
  const [list, setList] = useState<WholesaleProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate({ to: "/login" });
    }
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const { data: tiers } = await supabase
        .from("product_wholesale_tiers" as any)
        .select("*")
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
        .select("*")
        .in("id", ids)
        .eq("status", "active");
      const result: WholesaleProduct[] = ((products ?? []) as Product[]).map((p) => ({
        ...p,
        tiers: tiersByProduct[p.id] ?? [],
      }));
      setList(result);
      setLoading(false);
    })();
  }, [user]);

  if (authLoading || !user) {
    return <div className="container mx-auto px-4 py-16 text-center text-muted-foreground">驗證會員身分…</div>;
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
