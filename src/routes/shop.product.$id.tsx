import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ProductCard } from "@/components/shop/ProductCard";
import { ShareProductButtons } from "@/components/shop/ShareProductButtons";
import { useCart } from "@/hooks/use-cart";
import { useIsDealer, getEffectivePrice } from "@/hooks/use-dealer";
import { setReferralCode } from "@/lib/referral-tracking";
import { ShoppingCart, Heart, Truck, Shield, RotateCcw, Minus, Plus, ChevronRight, Sparkles } from "lucide-react";
import type { Product, ProductImage, WholesaleTier } from "@/types/product";
import { applyWholesalePricing, fetchTiersForProduct } from "@/lib/wholesale-pricing";

export const Route = createFileRoute("/shop/product/$id")({
  component: ProductDetail,
  head: () => ({
    meta: [
      { title: "商品詳情 — 源晶商城" },
      { name: "description", content: "源晶商城商品詳情頁" },
    ],
  }),
});

function ProductDetail() {
  const { id } = Route.useParams();
  const { addItem } = useCart();
  const isDealer = useIsDealer();
  const [product, setProduct] = useState<Product | null>(null);
  const [images, setImages] = useState<ProductImage[]>([]);
  const [related, setRelated] = useState<Product[]>([]);
  const [tiers, setTiers] = useState<WholesaleTier[]>([]);
  const [activeImg, setActiveImg] = useState(0);
  const [qty, setQty] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 捕捉分享連結中的 ?ref= 推薦碼（90 天 cookie）
    if (typeof window !== "undefined") {
      try {
        const ref = new URLSearchParams(window.location.search).get("ref");
        if (ref) setReferralCode(ref);
      } catch {}
    }
    (async () => {
      setLoading(true);
      const { data: p } = await supabase.from("products").select("*").eq("id", id).single();
      setProduct(p as Product | null);
      const { data: imgs } = await supabase.from("product_images").select("*").eq("product_id", id).order("sort_order");
      setImages((imgs ?? []) as ProductImage[]);
      const t = await fetchTiersForProduct(id);
      setTiers(t);
      if (p?.category_id) {
        const { data: rel } = await supabase.from("products").select("*").eq("category_id", p.category_id).neq("id", id).eq("status", "active").limit(4);
        setRelated((rel ?? []) as Product[]);
      }
      setActiveImg(0);
      setQty(1);
      setLoading(false);
    })();
  }, [id]);

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8 grid md:grid-cols-2 gap-8">
        <Skeleton className="aspect-square rounded-2xl" />
        <div className="space-y-4">
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-4 w-1/4" />
          <Skeleton className="h-12 w-1/2" />
          <Skeleton className="h-24" />
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <p className="text-muted-foreground">找不到商品</p>
        <Button variant="link" asChild className="mt-2"><Link to="/shop/products">回到商品列表</Link></Button>
      </div>
    );
  }

  const gallery = [...(product.image ? [{ id: "main", image_url: product.image, product_id: id, sort_order: -1, created_at: "" }] : []), ...images];
  const outOfStock = product.stock <= 0;
  const baseEff = getEffectivePrice(product, isDealer);
  const baseReward = Number((product as any).reward_points ?? 0);
  const pricing = applyWholesalePricing(baseEff, baseReward, tiers, qty);
  const effPrice = pricing.unitPrice;
  const showDealer = !pricing.tier && isDealer && product.wholesale_price > 0 && product.wholesale_price < product.price;
  const hasTiers = tiers.length > 0;

  return (
    <div className="container mx-auto px-4 py-6 md:py-10">
      {/* breadcrumb */}
      <nav className="text-xs text-muted-foreground flex items-center gap-1 mb-6">
        <Link to="/shop">首頁</Link><ChevronRight className="h-3 w-3" />
        <Link to="/shop/products">商品</Link><ChevronRight className="h-3 w-3" />
        <span className="text-foreground truncate">{product.name}</span>
      </nav>

      <div className="grid md:grid-cols-2 gap-8 lg:gap-12">
        {/* Gallery */}
        <div className="space-y-3">
          <div className="aspect-square rounded-2xl overflow-hidden bg-muted border border-border/60">
            {gallery[activeImg] ? (
              <img src={gallery[activeImg].image_url} alt={product.name} className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full flex items-center justify-center text-muted-foreground">無圖片</div>
            )}
          </div>
          {gallery.length > 1 && (
            <div className="grid grid-cols-5 gap-2">
              {gallery.map((g, i) => (
                <button key={g.id} onClick={() => setActiveImg(i)} className={`aspect-square rounded-lg overflow-hidden border-2 ${i === activeImg ? "border-primary" : "border-border/60"}`}>
                  <img src={g.image_url} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="space-y-5">
          <div className="flex items-center gap-2">
            {product.featured && <Badge className="bg-gradient-to-r from-primary to-primary/70 border-0">熱銷</Badge>}
            {product.category && <Badge variant="secondary">{product.category}</Badge>}
            {outOfStock ? <Badge variant="destructive">已售完</Badge> : product.stock < 10 ? <Badge variant="outline" className="border-amber-500 text-amber-500">僅剩 {product.stock} 件</Badge> : <Badge variant="outline" className="border-emerald-500 text-emerald-500">現貨</Badge>}
          </div>

          <div>
            <h1 className="text-2xl md:text-3xl font-bold leading-tight">{product.name}</h1>
            <p className="text-sm text-muted-foreground mt-2">SKU: {product.sku}</p>
          </div>

          {product.short_description && <p className="text-sm text-muted-foreground leading-relaxed">{product.short_description}</p>}

          <div className="flex items-baseline gap-3 py-2 border-y border-border/60">
            <span className="text-3xl md:text-4xl font-bold text-primary tabular-nums">NT$ {effPrice.toLocaleString()}</span>
            {pricing.tier && (
              <>
                <span className="text-sm text-muted-foreground line-through tabular-nums">NT$ {product.price.toLocaleString()}</span>
                <Badge variant="outline" className="border-primary text-primary"><Sparkles className="h-3 w-3 mr-1" />批發價</Badge>
              </>
            )}
            {showDealer && (
              <>
                <span className="text-sm text-muted-foreground line-through tabular-nums">NT$ {product.price.toLocaleString()}</span>
                <Badge variant="outline" className="border-emerald-500 text-emerald-600">經銷價</Badge>
              </>
            )}
          </div>

          {hasTiers && (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Sparkles className="h-4 w-4 text-primary" /> 批發階梯（買越多越省）
              </div>
              <div className="space-y-1">
                {tiers.map((t) => {
                  const active = pricing.tier?.id === t.id;
                  return (
                    <div key={t.id ?? `${t.min_qty}`} className={`flex items-center justify-between text-sm rounded-md px-2 py-1 ${active ? "bg-primary text-primary-foreground" : ""}`}>
                      <span>
                        {t.min_qty}{t.max_qty == null ? "+" : `–${t.max_qty}`} 件
                      </span>
                      <span className="tabular-nums">
                        NT$ {Number(t.unit_price).toLocaleString()} / 件
                        <span className={`ml-3 ${active ? "" : "text-amber-600"}`}>+{t.unit_reward_points} 點/件</span>
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                目前數量 {qty} 件 → 單件 NT$ {effPrice.toLocaleString()}，本次共得 {pricing.totalReward} 獎勵點。
              </p>
            </div>
          )}

          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground w-12">數量</span>
              <div className="flex items-center border rounded-lg">
                <Button variant="ghost" size="icon" onClick={() => setQty(Math.max(1, qty - 1))}><Minus className="h-4 w-4" /></Button>
                <span className="w-12 text-center tabular-nums">{qty}</span>
                <Button variant="ghost" size="icon" onClick={() => setQty(Math.min(product.stock, qty + 1))}><Plus className="h-4 w-4" /></Button>
              </div>
            </div>
            <div className="flex gap-3">
              <Button size="lg" className="flex-1" disabled={outOfStock} onClick={() => addItem(product.id, qty)}>
                <ShoppingCart className="h-4 w-4 mr-2" /> 加入購物車
              </Button>
              <Button size="lg" variant="outline" disabled={outOfStock} onClick={() => { addItem(product.id, qty); }}>
                立即購買
              </Button>
              <Button size="lg" variant="outline" className="px-3"><Heart className="h-4 w-4" /></Button>
              <ShareProductButtons productId={product.id} productName={product.name} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-2">
            <Feature icon={Truck} label="滿 2000 免運" />
            <Feature icon={Shield} label="品質保證" />
            <Feature icon={RotateCcw} label="14 天退換" />
          </div>

          {product.description && (
            <div className="pt-4 border-t border-border/60">
              <h3 className="text-sm font-semibold mb-2">商品描述</h3>
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{product.description}</p>
            </div>
          )}
        </div>
      </div>

      {/* Related */}
      {related.length > 0 && (
        <section className="mt-16">
          <h2 className="text-xl md:text-2xl font-bold mb-4">推薦商品</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {related.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        </section>
      )}
    </div>
  );
}

function Feature({ icon: Icon, label }: { icon: any; label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground p-2 rounded-lg bg-muted/40">
      <Icon className="h-4 w-4 text-primary shrink-0" />
      {label}
    </div>
  );
}
