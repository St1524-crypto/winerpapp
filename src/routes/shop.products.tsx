import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { listPublicHomepageSections } from "@/lib/homepage-sections.functions";
import { ProductCard } from "@/components/shop/ProductCard";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search } from "lucide-react";
import type { Product, Category } from "@/types/product";

const SHOP_PRODUCTS_COLUMNS =
  "id, sku, name, category, price, stock, image, created_at, short_description, description, category_id, safe_stock, status, featured, updated_at, company_id, reward_points, discount_points_max, specs, wholesale_only";

const SECTION_LABELS: Record<string, string> = {
  limited_offer: "限時特惠區",
  bundle: "優惠套組區",
  featured: "主力產品區",
  best_seller: "熱賣產品區",
  new_arrival: "新上架區",
};

type HomepageSection = {
  id: string;
  section_type: string;
  title: string;
  products: Array<{ product_id: string; product?: Partial<Product> & { id: string } }>;
};

export const Route = createFileRoute("/shop/products")({
  component: ProductsList,
  validateSearch: (s: Record<string, unknown>) => ({
    q: (s.q as string) ?? "",
    cat: (s.cat as string) ?? "",
    sort: (s.sort as string) ?? "new",
    section: (s.section as string) ?? "",
  }),
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
  const fetchHomepageSections = useServerFn(listPublicHomepageSections);
  const { data: homepageData, isLoading: sectionsLoading } = useQuery({
    queryKey: ["shop-products-homepage-sections"],
    queryFn: () => fetchHomepageSections(),
  });
  const homepageSections = ((homepageData?.sections ?? []) as HomepageSection[]).filter((section) => section.products?.length);
  const selectedSection = homepageSections.find((section) => section.section_type === search.section);

  useEffect(() => {
    supabase.from("categories").select("*").eq("status", "active").order("sort_order").then(({ data }) => setCats((data ?? []) as Category[]));
  }, []);

  useEffect(() => {
    (async () => {
      if (search.section && sectionsLoading) return;

      setLoading(true);
      const sectionProductIds = search.section
        ? (selectedSection?.products ?? []).map((item) => item.product_id).filter(Boolean)
        : [];

      if (search.section && sectionProductIds.length === 0) {
        setProducts([]);
        setLoading(false);
        return;
      }

      let qb = supabase.from("products").select(SHOP_PRODUCTS_COLUMNS).eq("status", "active").eq("wholesale_only", false);
      if (sectionProductIds.length) qb = qb.in("id", sectionProductIds);
      if (search.q) qb = qb.or(`name.ilike.%${search.q}%,sku.ilike.%${search.q}%`);
      if (search.cat) qb = qb.eq("category_id", search.cat);
      if (search.sort === "price_asc") qb = qb.order("price", { ascending: true });
      else if (search.sort === "price_desc") qb = qb.order("price", { ascending: false });
      else qb = qb.order("display_priority", { ascending: false }).order("created_at", { ascending: false });
      const { data } = await qb.limit(60);
      setProducts(toProducts(data ?? []));
      setLoading(false);
    })();
  }, [search.q, search.cat, search.sort, search.section, sectionsLoading, selectedSection?.id]);

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

      <div className="mb-6 flex gap-2 overflow-x-auto pb-1">
        <SectionFilterButton
          active={!search.section}
          label="全部商品"
          onClick={() => nav({ search: (p: any) => ({ ...p, section: "", cat: "" }) })}
        />
        {homepageSections.map((section) => (
          <SectionFilterButton
            key={section.id}
            active={search.section === section.section_type}
            label={section.title || SECTION_LABELS[section.section_type] || "首頁區塊"}
            onClick={() => nav({ search: (p: any) => ({ ...p, section: section.section_type, cat: "" }) })}
          />
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-4">
        {loading ? Array.from({ length: 12 }).map((_, i) => <Skeleton key={i} className="aspect-[3/4] rounded-xl sm:rounded-2xl" />) :
          products.length === 0 ? <p className="col-span-full text-center text-muted-foreground py-16">沒有符合條件的商品</p> :
          products.map((p) => <ProductCard key={p.id} product={p} />)}
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

function SectionFilterButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground shadow-sm"
          : "border-border bg-card text-foreground hover:border-primary/50 hover:bg-primary/5",
      ].join(" ")}
    >
      {label}
    </button>
  );
}