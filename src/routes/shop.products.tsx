import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PRODUCT_PUBLIC_COLUMNS } from "@/hooks/use-products";
import { ProductCard } from "@/components/shop/ProductCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search } from "lucide-react";
import type { Product, Category } from "@/types/product";

export const Route = createFileRoute("/shop/products")({
  component: ProductsList,
  validateSearch: (s: Record<string, unknown>) => ({ q: (s.q as string) ?? "", cat: (s.cat as string) ?? "", sort: (s.sort as string) ?? "new" }),
  head: () => ({
    meta: [
      { title: "全部商品 — 源晶商城" },
      { name: "description", content: "瀏覽源晶商城所有商品，依分類、價格與熱門程度排序。" },
    ],
  }),
});

function ProductsList() {
  const search = Route.useSearch();
  const nav = Route.useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [cats, setCats] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState(search.q);

  useEffect(() => {
    supabase.from("categories").select("*").eq("status", "active").order("sort_order").then(({ data }) => setCats((data ?? []) as Category[]));
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      let qb = supabase.from("products").select(PRODUCT_PUBLIC_COLUMNS).eq("status", "active");
      if (search.q) qb = qb.or(`name.ilike.%${search.q}%,sku.ilike.%${search.q}%`);
      if (search.cat) qb = qb.eq("category_id", search.cat);
      if (search.sort === "price_asc") qb = qb.order("price", { ascending: true });
      else if (search.sort === "price_desc") qb = qb.order("price", { ascending: false });
      else qb = qb.order("display_priority", { ascending: false }).order("created_at", { ascending: false });
      const { data } = await qb.limit(60);
      setProducts((data ?? []) as Product[]);
      setLoading(false);
    })();
  }, [search.q, search.cat, search.sort]);

  return (
    <div className="container mx-auto px-3 sm:px-4 py-4 sm:py-6 md:py-10">
      <div className="flex flex-col md:flex-row md:items-end gap-3 mb-4 sm:mb-6">
        <div>
          <h1 className="text-xl sm:text-2xl md:text-3xl font-bold">全部商品</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-0.5 sm:mt-1">共 {products.length} 件商品</p>
        </div>
        <div className="md:ml-auto flex flex-col gap-2 w-full md:w-auto">
          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") nav({ search: (p: any) => ({ ...p, q }) }); }}
              placeholder="搜尋商品..."
              className="pl-9 h-10"
            />
          </div>
          <div className="grid grid-cols-2 gap-2 md:flex md:gap-2">
            <Select value={search.cat || "all"} onValueChange={(v) => nav({ search: (p: any) => ({ ...p, cat: v === "all" ? "" : v }) })}>
              <SelectTrigger className="w-full md:w-40 h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部分類</SelectItem>
                {cats.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={search.sort} onValueChange={(v) => nav({ search: (p: any) => ({ ...p, sort: v }) })}>
              <SelectTrigger className="w-full md:w-36 h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="new">最新上架</SelectItem>
                <SelectItem value="price_asc">價格低到高</SelectItem>
                <SelectItem value="price_desc">價格高到低</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-4">
        {loading ? Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="aspect-[3/4] rounded-xl sm:rounded-2xl" />) :
          products.length === 0 ? <p className="col-span-full text-center text-muted-foreground py-16">沒有符合條件的商品</p> :
          products.map((p) => <ProductCard key={p.id} product={p} />)}
      </div>
    </div>
  );
}

