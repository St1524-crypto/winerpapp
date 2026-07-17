import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { listPublicHomepageSections } from "@/lib/homepage-sections.functions";
import { ProductCard } from "@/components/shop/ProductCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles, Flame, Tag, Gift, Truck, Crown, Coins } from "lucide-react";
import type { Product, Category } from "@/types/product";

const SHOP_HOME_PRODUCT_COLUMNS =
  "id, sku, name, category, price, stock, image, created_at, short_description, description, category_id, safe_stock, status, featured, updated_at, company_id, reward_points, discount_points_max, specs, wholesale_only";

const SECTION_META: Record<string, { title: string; desc: string; icon: any }> = {
  limited_offer: { title: "限時特惠區", desc: "期間限定優惠與多件活動", icon: Flame },
  bundle: { title: "優惠套組區", desc: "精選商品組合與套組推薦", icon: Gift },
  featured: { title: "主力產品區", desc: "管理員精選主力商品", icon: Crown },
  best_seller: { title: "熱賣產品區", desc: "人氣熱銷商品推薦", icon: Sparkles },
  new_arrival: { title: "新上架區", desc: "最新上架商品", icon: Tag },
};

type HomepageSectionProduct = {
  id: string;
  product: Partial<Product> & { id: string };
};

type HomepageSection = {
  id: string;
  section_type: string;
  title: string;
  subtitle: string | null;
  products: HomepageSectionProduct[];
};

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
  const fetchHomepageSections = useServerFn(listPublicHomepageSections);
  const { data: homepageData, isLoading: sectionsLoading } = useQuery({
    queryKey: ["shop-homepage-sections"],
    queryFn: () => fetchHomepageSections(),
  });

  useEffect(() => {
    (async () => {
      const [f, l, c] = await Promise.all([
        supabase.from("products").select(SHOP_HOME_PRODUCT_COLUMNS).eq("status", "active").eq("wholesale_only", false).eq("featured", true).limit(8),
        supabase.from("products").select(SHOP_HOME_PRODUCT_COLUMNS).eq("status", "active").eq("wholesale_only", false).order("display_priority", { ascending: false }).order("created_at", { ascending: false }).limit(8),
        supabase.from("categories").select("*").eq("status", "active").order("sort_order").limit(8),
      ]);
      setFeatured(toProducts(f.data ?? []));
      setLatest(toProducts(l.data ?? []));
      setCats((c.data ?? []) as Category[]);
      setLoading(false);
    })();
  }, []);

  const homepageSections = ((homepageData?.sections ?? []) as HomepageSection[]).filter((section) => section.products?.length);
  const useDynamicSections = homepageSections.length > 0;

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

        <div className="relative container mx-auto px-4 py-8 md:py-24">
          {/* Top badge */}
          <div className="flex justify-center mb-3 md:mb-6">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 md:px-4 md:py-1.5 rounded-full bg-white/10 border border-white/20 text-[11px] md:text-sm font-medium text-white/90 backdrop-blur-sm">
              <Sparkles className="h-3 w-3 md:h-4 md:w-4 text-primary" /> VIP 拼購主 享 30% 推廣獎勵
            </div>
          </div>

          {/* Main headline */}
          <div className="text-center max-w-3xl mx-auto space-y-2 md:space-y-4">
            <h1 className="text-2xl md:text-5xl lg:text-6xl font-bold leading-tight text-white text-pretty">
              <span className="whitespace-nowrap">熱情選購</span>
              <span className="mx-1 md:mx-2">·</span>
              <span className="whitespace-nowrap">品質保障</span>
              <span className="mx-1 md:mx-2">·</span>
              <span className="whitespace-nowrap">樂享回饋</span>
            </h1>
            <p className="text-white/70 text-xs md:text-lg max-w-2xl mx-auto leading-relaxed px-2 text-pretty">
              保健食品 · 保養品 · 保健器材 · 生活用品。每一筆消費都能累積購物金，VIP 拼購主更享分潤獎勵。
            </p>
          </div>

          {/* CTA Buttons */}
          <div className="grid grid-cols-2 md:flex md:flex-wrap md:justify-center gap-2 md:gap-4 mt-5 md:mt-8 max-w-md md:max-w-none mx-auto">
            <Button
              size="lg"
              className="rounded-full px-2 md:px-8 h-10 md:h-12 text-xs md:text-base bg-gradient-to-r from-[oklch(0.62_0.22_255)] to-[oklch(0.70_0.18_240)] hover:opacity-90 text-white shadow-lg shadow-[oklch(0.55_0.22_260_/_0.45)] border-0"
              asChild
            >
              <Link to="/shop/products" search={{ q: "", cat: "", sort: "new", section: "" }}>立即購物 <ArrowRight className="h-3 w-3 md:h-4 md:w-4 ml-0.5 md:ml-1" /></Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="rounded-full px-2 md:px-8 h-10 md:h-12 text-xs md:text-base bg-white/10 border-white/30 text-white hover:bg-white/20 hover:text-white"
              asChild
            >
              <Link to="/login">免費加入</Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="rounded-full px-2 md:px-8 h-10 md:h-12 text-xs md:text-base bg-white/10 border-white/30 text-white hover:bg-white/20 hover:text-white"
              asChild
            >
              <Link to="/shop/vip">升級 VIP</Link>
            </Button>
            <Button
              size="lg"
              className="rounded-full px-2 md:px-8 h-10 md:h-12 text-xs md:text-base bg-gradient-to-r from-amber-400 to-orange-500 hover:opacity-90 text-white shadow-lg border-0"
              asChild
            >
              <Link to="/cooperation/apply">合作申請</Link>
            </Button>
          </div>

          {/* Feature cards */}
          <div className="grid grid-cols-5 gap-1.5 md:gap-4 mt-6 md:mt-16 max-w-5xl mx-auto">
            <FeatureCard icon={Gift} title="註冊送點" desc="新會員贈金" />
            <FeatureCard icon={Sparkles} title="首購好禮" desc="首單優惠" />
            <FeatureCard icon={Flame} title="6人拼團" desc="享10%分潤" />
            <FeatureCard icon={Crown} title="VIP 制" desc="多重特權" />
            <FeatureCard icon={Coins} title="點數折抵" desc="立即可用" />
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

        {sectionsLoading ? (
          <section>
            <SectionHeader icon={Sparkles} title="首頁展示區塊" desc="正在載入管理員設定的首頁商品區塊" />
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 md:gap-4 mt-4">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="aspect-[3/4]" />)}
            </div>
          </section>
        ) : useDynamicSections ? (
          homepageSections.map((section) => <HomepageProductSection key={section.id} section={section} />)
        ) : null}

        {!sectionsLoading && !useDynamicSections && (
          <>
        {/* Featured */}
        <section>
          <SectionHeader icon={Flame} title="熱銷商品" desc="人氣商品 · 限量供應" action={<Link to="/shop/products" search={{ q: "", cat: "", sort: "new", section: "" }} className="text-sm text-primary hover:underline">查看全部 →</Link>} />
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 md:gap-4 mt-4">
            {loading ? Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="aspect-[3/4]" />) :
              featured.length === 0 ? <p className="col-span-full text-sm text-muted-foreground py-8 text-center">尚未設定熱銷商品</p> :
              featured.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        </section>

        {/* Latest */}
        <section>
          <SectionHeader icon={Sparkles} title="最新上架" desc="搶先入手新鮮貨" action={<Link to="/shop/products" search={{ q: "", cat: "", sort: "new", section: "" }} className="text-sm text-primary hover:underline">查看全部 →</Link>} />
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 md:gap-4 mt-4">
            {loading ? Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="aspect-[3/4]" />) :
              latest.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        </section>

          </>
        )}

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

function toProducts(rows: any[]): Product[] {
  return rows.map((row) => ({
    ...row,
    wholesale_price: Number(row.wholesale_price ?? 0),
    price: Number(row.price ?? 0),
    stock: Number(row.stock ?? 0),
    safe_stock: Number(row.safe_stock ?? 0),
    reward_points: Number(row.reward_points ?? 0),
    discount_points_max: Number(row.discount_points_max ?? 0),
  })) as Product[];
}

function productFromSectionItem(item: HomepageSectionProduct): Product {
  return toProducts([item.product])[0];
}

function HomepageProductSection({ section }: { section: HomepageSection }) {
  const meta = SECTION_META[section.section_type] ?? { title: section.title, desc: "", icon: Sparkles };
  const products = (section.products ?? [])
    .map(productFromSectionItem)
    .filter((product) => product.id);

  return (
    <section>
      <SectionHeader
        icon={meta.icon}
        title={section.title || meta.title}
        desc={section.subtitle || meta.desc}
        action={<Link to="/shop/products" search={{ q: "", cat: "", sort: "new", section: "" }} className="text-sm text-primary hover:underline">查看全部</Link>}
      />
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 md:gap-4 mt-4">
        {products.length === 0 ? (
          <p className="col-span-full text-sm text-muted-foreground py-8 text-center">此區塊尚未加入商品</p>
        ) : (
          products.map((product) => <ProductCard key={`${section.id}-${product.id}`} product={product} />)
        )}
      </div>
    </section>
  );
}

function FeatureCard({ icon: Icon, title, desc }: { icon: any; title: string; desc: string }) {
  return (
    <div className="flex flex-col items-center text-center p-1.5 md:p-4 rounded-xl md:rounded-2xl bg-white/10 border border-white/15 backdrop-blur-sm hover:bg-white/15 transition-colors">
      <div className="h-7 w-7 md:h-12 md:w-12 rounded-full bg-primary/20 flex items-center justify-center mb-1 md:mb-2">
        <Icon className="h-3.5 w-3.5 md:h-6 md:w-6 text-primary" />
      </div>
      <div className="text-[11px] md:text-base font-semibold text-white leading-tight">{title}</div>
      <div className="text-[9px] md:text-xs text-white/60 mt-0.5 leading-tight hidden sm:block">{desc}</div>
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
