import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ProductCard } from "@/components/shop/ProductCard";
import { useCart } from "@/hooks/use-cart";
import { useIsDealer, getEffectivePrice } from "@/hooks/use-dealer";
import { ShoppingCart, Heart, Share2, Truck, Shield, RotateCcw, Minus, Plus, ChevronRight } from "lucide-react";
import type { Product, ProductImage } from "@/types/product";

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
  const [activeImg, setActiveImg] = useState(0);
  const [qty, setQty] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: p } = await supabase.from("products").select("*").eq("id", id).single();
      setProduct(p as Product | null);
      const { data: imgs } = await supabase.from("product_images").select("*").eq("product_id", id).order("sort_order");
      setImages((imgs ?? []) as ProductImage[]);
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
  const effPrice = getEffectivePrice(product, isDealer);
  const showDealer = isDealer && product.wholesale_price > 0 && product.wholesale_price < product.price;

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
            {showDealer && (
              <>
                <span className="text-sm text-muted-foreground line-through tabular-nums">NT$ {product.price.toLocaleString()}</span>
                <Badge variant="outline" className="border-emerald-500 text-emerald-600">經銷價</Badge>
              </>
            )}
          </div>

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
              <Button size="lg" variant="outline" className="px-3"><Share2 className="h-4 w-4" /></Button>
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
