import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ProductCard } from "@/components/shop/ProductCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles, Flame, Tag } from "lucide-react";
import type { Product, Category } from "@/types/product";

export const Route = createFileRoute("/shop/")({
  component: ShopHome,
  head: () => ({
    meta: [
      { title: "源晶商城 — 首頁" },
      { name: "description", content: "精選熱銷、新品上市、限時優惠 — 源晶商城高端購物體驗。" },
    ],
  }),
});

function ShopHome() {
  const [featured, setFeatured] = useState<Product[]>([]);
  const [latest, setLatest] = useState<Product[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [f, l, c] = await Promise.all([
        supabase.from("products").select("*").eq("status", "active").eq("featured", true).limit(8),
        supabase.from("products").select("*").eq("status", "active").order("created_at", { ascending: false }).limit(8),
        supabase.from("categories").select("*").eq("status", "active").order("sort_order").limit(8),
      ]);
      setFeatured((f.data ?? []) as Product[]);
      setLatest((l.data ?? []) as Product[]);
      setCats((c.data ?? []) as Category[]);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="container mx-auto px-3 md:px-4 py-4 md:py-10 space-y-8 md:space-y-12">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-2xl md:rounded-3xl bg-gradient-to-br from-primary/20 via-primary/5 to-background border border-primary/20 p-5 md:p-16">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_var(--primary)_/_10%,_transparent_60%)] opacity-50" />
        <div className="relative max-w-2xl space-y-3 md:space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs font-medium text-primary">
            <Sparkles className="h-3 w-3" /> 2026 春季新品上市
          </div>
          <h1 className="text-2xl md:text-5xl font-bold leading-tight bg-gradient-to-r from-foreground to-foreground/60 bg-clip-text text-transparent">
            高端品質<br />從源頭嚴選
          </h1>
          <p className="text-muted-foreground text-xs md:text-base">企業級供應鏈直送 · 滿 NT$2,000 免運 · 14 天退換</p>
          <div className="flex gap-2 md:gap-3 pt-1 md:pt-2">
            <Button size="sm" className="md:h-11 md:px-8 md:text-base" asChild>
              <Link to="/shop/products">立即選購 <ArrowRight className="h-4 w-4 ml-1" /></Link>
            </Button>
            <Button size="sm" variant="outline" className="md:h-11 md:px-8 md:text-base" asChild>
              <Link to="/shop/products">查看熱銷</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Categories */}
      {cats.length > 0 && (
        <section>
          <SectionHeader icon={Tag} title="商品分類" desc="找到你想要的類別" />
          <div className="grid grid-cols-4 md:grid-cols-4 lg:grid-cols-6 gap-2 md:gap-3 mt-4">
            {cats.map((c) => (
              <Link
                key={c.id}
                to="/shop/category/$slug"
                params={{ slug: c.id }}
                className="aspect-square rounded-xl md:rounded-2xl border border-border/60 bg-gradient-to-br from-card to-muted/30 hover:from-primary/10 hover:to-primary/5 hover:border-primary/40 flex flex-col items-center justify-center gap-1.5 md:gap-2 p-2 md:p-3 transition-all group"
              >
                <div className="h-8 w-8 md:h-10 md:w-10 rounded-full bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                  <Tag className="h-4 w-4 md:h-5 md:w-5 text-primary" />
                </div>
                <span className="text-[11px] md:text-sm font-medium text-center line-clamp-1">{c.name}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Featured */}
      <section>
        <SectionHeader icon={Flame} title="熱銷商品" desc="人氣商品 · 限量供應" action={<Link to="/shop/products" className="text-sm text-primary hover:underline">查看全部 →</Link>} />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mt-4">
          {loading ? Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="aspect-[3/4]" />) :
            featured.length === 0 ? <p className="col-span-full text-sm text-muted-foreground py-8 text-center">尚未設定熱銷商品</p> :
            featured.map((p) => <ProductCard key={p.id} product={p} />)}
        </div>
      </section>

      {/* Latest */}
      <section>
        <SectionHeader icon={Sparkles} title="最新上架" desc="搶先入手新鮮貨" action={<Link to="/shop/products" className="text-sm text-primary hover:underline">查看全部 →</Link>} />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mt-4">
          {loading ? Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="aspect-[3/4]" />) :
            latest.map((p) => <ProductCard key={p.id} product={p} />)}
        </div>
      </section>

      {/* Promo banner */}
      <section className="rounded-3xl bg-gradient-to-r from-emerald-500/10 via-primary/10 to-purple-500/10 border border-border/60 p-6 md:p-10 grid md:grid-cols-3 gap-4 text-center">
        <PromoBlock title="WELCOME100" desc="新會員首購折抵 100 元" />
        <PromoBlock title="SAVE10" desc="全站九折優惠中" />
        <PromoBlock title="FREESHIP" desc="滿 2000 加碼折 150" />
      </section>
    </div>
  );
}

function SectionHeader({ icon: Icon, title, desc, action }: { icon: any; title: string; desc?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-2">
      <div>
        <h2 className="text-xl md:text-2xl font-bold flex items-center gap-2"><Icon className="h-5 w-5 text-primary" />{title}</h2>
        {desc && <p className="text-xs md:text-sm text-muted-foreground mt-1">{desc}</p>}
      </div>
      {action}
    </div>
  );
}

function PromoBlock({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="space-y-1">
      <div className="text-lg md:text-2xl font-bold tracking-tight text-primary">{title}</div>
      <div className="text-xs md:text-sm text-muted-foreground">{desc}</div>
    </div>
  );
}
