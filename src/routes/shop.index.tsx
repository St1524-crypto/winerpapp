import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PRODUCT_PUBLIC_COLUMNS } from "@/hooks/use-products";
import { ProductCard } from "@/components/shop/ProductCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles, Flame, Tag, Gift, Truck, Crown, Coins } from "lucide-react";
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
        supabase.from("products").select(PRODUCT_PUBLIC_COLUMNS).eq("status", "active").eq("featured", true).limit(8),
        supabase.from("products").select(PRODUCT_PUBLIC_COLUMNS).eq("status", "active").order("created_at", { ascending: false }).limit(8),
        supabase.from("categories").select("*").eq("status", "active").order("sort_order").limit(8),
      ]);
      setFeatured((f.data ?? []) as Product[]);
      setLatest((l.data ?? []) as Product[]);
      setCats((c.data ?? []) as Category[]);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="flex flex-col">
      {/* Hero — Modern tech-inspired blue gradient with glow */}
      <section
        className="relative overflow-hidden"
        style={{
          background: `
            radial-gradient(ellipse 80% 60% at 50% 0%, oklch(0.62 0.20 255 / 0.55), transparent 70%),
            radial-gradient(ellipse 60% 50% at 100% 30%, oklch(0.70 0.18 230 / 0.45), transparent 65%),
            radial-gradient(ellipse 70% 50% at 0% 60%, oklch(0.55 0.22 270 / 0.45), transparent 70%),
            radial-gradient(ellipse 90% 60% at 50% 100%, oklch(0.60 0.20 240 / 0.45), transparent 70%),
            linear-gradient(180deg, oklch(0.22 0.10 260) 0%, oklch(0.18 0.09 255) 50%, oklch(0.14 0.07 255) 100%)
          `,
        }}
      >
        {/* Subtle grid overlay for tech feel */}
        <div
          className="absolute inset-0 opacity-[0.12] pointer-events-none"
          style={{
            backgroundImage:
              'linear-gradient(oklch(0.85 0.05 240 / 0.5) 1px, transparent 1px), linear-gradient(90deg, oklch(0.85 0.05 240 / 0.5) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
            maskImage: 'radial-gradient(ellipse 70% 60% at 50% 40%, black, transparent 80%)',
            WebkitMaskImage: 'radial-gradient(ellipse 70% 60% at 50% 40%, black, transparent 80%)',
          }}
        />

        {/* Floating light orbs */}
        <div className="absolute top-10 left-[10%] w-40 h-40 rounded-full bg-[oklch(0.65_0.22_255_/_0.35)] blur-3xl animate-pulse" />
        <div className="absolute top-20 right-[15%] w-32 h-32 rounded-full bg-[oklch(0.70_0.18_230_/_0.30)] blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute bottom-10 left-[30%] w-24 h-24 rounded-full bg-[oklch(0.60_0.22_275_/_0.28)] blur-2xl animate-pulse" style={{ animationDelay: '2s' }} />

        <div className="relative container mx-auto px-4 py-16 md:py-24">
          {/* Top badge */}
          <div className="flex justify-center mb-6">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 border border-white/20 text-sm font-medium text-white/90 backdrop-blur-sm">
              <Sparkles className="h-4 w-4 text-primary" /> VIP 拼購主 享 30% 推廣獎勵
            </div>
          </div>

          {/* Main headline */}
          <div className="text-center max-w-3xl mx-auto space-y-4">
            <h1 className="text-3xl md:text-5xl lg:text-6xl font-bold leading-tight text-white">
              熱情選購&nbsp;&nbsp;品質保障&nbsp;&nbsp;樂享回饋
            </h1>
            <p className="text-white/70 text-sm md:text-lg max-w-2xl mx-auto leading-relaxed">
              保健食品 · 保養品 · 保健器材 · 生活用品。每一筆消費都能累積購物金，VIP 拼購主更享分潤獎勵。
            </p>
          </div>

          {/* CTA Buttons */}
          <div className="flex flex-wrap justify-center gap-3 md:gap-4 mt-8">
            <Button
              size="lg"
              className="rounded-full px-8 h-12 text-base bg-gradient-to-r from-[oklch(0.62_0.22_255)] to-[oklch(0.70_0.18_240)] hover:opacity-90 text-white shadow-lg shadow-[oklch(0.55_0.22_260_/_0.45)] border-0"
              asChild
            >
              <Link to="/shop/products">立即購物 <ArrowRight className="h-4 w-4 ml-1" /></Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="rounded-full px-8 h-12 text-base bg-white/10 border-white/30 text-white hover:bg-white/20 hover:text-white"
              asChild
            >
              <Link to="/login">免費加入會員</Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="rounded-full px-8 h-12 text-base bg-white/10 border-white/30 text-white hover:bg-white/20 hover:text-white"
              asChild
            >
              <Link to="/shop/vip">升級為 VIP</Link>
            </Button>
          </div>

          {/* Feature cards */}
          <div className="flex md:grid md:grid-cols-5 gap-3 md:gap-4 mt-12 md:mt-16 max-w-5xl mx-auto overflow-x-auto md:overflow-visible pb-2 md:pb-0 px-1 scrollbar-hide">
            <FeatureCard icon={Gift} title="註冊送點數" desc="新會員即贈購物金" />
            <FeatureCard icon={Sparkles} title="新會員首購好禮" desc="首單專屬優惠" />
            <FeatureCard icon={Flame} title="6 人拼團" desc="團購主享 10% 分潤" />
            <FeatureCard icon={Crown} title="VIP 升級制" desc="銀/金/紫多重特權" />
            <FeatureCard icon={Coins} title="獎勵點折抵" desc="立刻折抵下一筆" />
          </div>
        </div>
      </section>

      {/* Content sections on light warm background */}
      <div className="container mx-auto px-3 md:px-4 py-8 md:py-12 space-y-8 md:space-y-12">
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
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 md:gap-4 mt-4">
            {loading ? Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="aspect-[3/4]" />) :
              featured.length === 0 ? <p className="col-span-full text-sm text-muted-foreground py-8 text-center">尚未設定熱銷商品</p> :
              featured.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        </section>

        {/* Latest */}
        <section>
          <SectionHeader icon={Sparkles} title="最新上架" desc="搶先入手新鮮貨" action={<Link to="/shop/products" className="text-sm text-primary hover:underline">查看全部 →</Link>} />
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 md:gap-4 mt-4">
            {loading ? Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="aspect-[3/4]" />) :
              latest.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        </section>

        {/* Promo banner */}
        <section
          className="rounded-3xl border border-border/60 p-6 md:p-10 grid md:grid-cols-3 gap-4 text-center"
          style={{
            background: 'linear-gradient(135deg, oklch(0.95 0.04 55 / 0.6) 0%, oklch(0.94 0.05 40 / 0.5) 50%, oklch(0.93 0.04 70 / 0.4) 100%)',
          }}
        >
          <PromoBlock title="WELCOME100" desc="新會員首購折抵 100 元" />
          <PromoBlock title="SAVE10" desc="全站九折優惠中" />
          <PromoBlock title="FREESHIP" desc="滿 2000 加碼折 150" />
        </section>
      </div>
    </div>
  );
}

function FeatureCard({ icon: Icon, title, desc }: { icon: any; title: string; desc: string }) {
  return (
    <div className="flex flex-col items-center text-center p-3 md:p-4 rounded-2xl bg-white/10 border border-white/15 backdrop-blur-sm hover:bg-white/15 transition-colors">
      <div className="h-10 w-10 md:h-12 md:w-12 rounded-full bg-primary/20 flex items-center justify-center mb-2">
        <Icon className="h-5 w-5 md:h-6 md:w-6 text-primary" />
      </div>
      <div className="text-sm md:text-base font-semibold text-white">{title}</div>
      <div className="text-[11px] md:text-xs text-white/60 mt-0.5">{desc}</div>
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
