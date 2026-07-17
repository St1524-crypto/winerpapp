import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PRODUCT_PUBLIC_COLUMNS } from "@/hooks/use-products";
import { ProductCard } from "@/components/shop/ProductCard";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronRight } from "lucide-react";
import type { Product, Category } from "@/types/product";

export const Route = createFileRoute("/shop/category/$slug")({
  component: CategoryPage,
  head: () => ({
    meta: [
      { title: "商品分類 — 源晶商城" },
      { name: "description", content: "源晶商城分類商品瀏覽" },
    ],
  }),
});

function CategoryPage() {
  const { slug } = Route.useParams();
  const [cat, setCat] = useState<Category | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: c } = await supabase.from("categories").select("*").eq("id", slug).maybeSingle();
      setCat(c as Category | null);
      const { data: p } = await supabase.from("products").select(PRODUCT_PUBLIC_COLUMNS).eq("category_id", slug).eq("status", "active").eq("wholesale_only", false).order("display_priority", { ascending: false }).order("created_at", { ascending: false });
      setProducts((p ?? []) as Product[]);
      setLoading(false);
    })();
  }, [slug]);

  return (
    <div className="container mx-auto px-4 py-6 md:py-10">
      <nav className="text-xs text-muted-foreground flex items-center gap-1 mb-4">
        <Link to="/shop">首頁</Link><ChevronRight className="h-3 w-3" />
        <Link to="/shop/products" search={{ q: "", cat: "", sort: "new", section: "" }}>商品</Link><ChevronRight className="h-3 w-3" />
        <span className="text-foreground">{cat?.name ?? "分類"}</span>
      </nav>
      <h1 className="text-2xl md:text-3xl font-bold">{cat?.name ?? "分類商品"}</h1>
      <p className="text-sm text-muted-foreground mt-1 mb-6">共 {products.length} 件商品</p>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {loading ? Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="aspect-[3/4]" />) :
          products.length === 0 ? <p className="col-span-full text-center text-muted-foreground py-16">此分類暫無商品</p> :
          products.map((p) => <ProductCard key={p.id} product={p} />)}
      </div>
    </div>
  );
}
