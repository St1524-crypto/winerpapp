import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompany } from "@/hooks/use-current-company";
import type { Category, Product } from "@/types/product";

// cost_price 與 wholesale_price 兩欄已透過 column-level REVOKE 鎖定，
// 僅能透過 SECURITY DEFINER RPC（get_product_costs / get_product_wholesale_prices）讀取；
// 不要在任何 client-side select 中直接列出這兩個欄位。
export const PRODUCT_PUBLIC_COLUMNS =
  "id, sku, name, category, price, stock, image, created_at, short_description, description, category_id, safe_stock, status, featured, updated_at, company_id, reward_points, discount_points_max, specs, display_priority, wholesale_only";

export async function mergeProductCosts<T extends { id: string }>(rows: T[]): Promise<(T & { cost_price: number })[]> {
  if (!rows.length) return rows.map((r) => ({ ...r, cost_price: 0 }));
  const ids = rows.map((r) => r.id);
  const { data } = await supabase.rpc("get_product_costs", { _ids: ids });
  const map = new Map<string, number>();
  (data ?? []).forEach((r: any) => map.set(r.id, Number(r.cost_price) || 0));
  return rows.map((r) => ({ ...r, cost_price: map.get(r.id) ?? 0 }));
}

export async function mergeProductWholesalePrices<T extends { id: string }>(rows: T[]): Promise<(T & { wholesale_price: number })[]> {
  if (!rows.length) return rows.map((r) => ({ ...r, wholesale_price: 0 }));
  const ids = rows.map((r) => r.id);
  const { data } = await supabase.rpc("get_product_wholesale_prices", { _ids: ids });
  const map = new Map<string, number>();
  (data ?? []).forEach((r: any) => map.set(r.id, Number(r.wholesale_price) || 0));
  return rows.map((r) => ({ ...r, wholesale_price: map.get(r.id) ?? 0 }));
}


export function useCategories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("categories")
      .select("*")
      .order("sort_order", { ascending: true });
    setCategories((data ?? []) as Category[]);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { categories, loading, refresh };
}

interface ProductFilters {
  search?: string;
  categoryId?: string | null;
  status?: string | null;
  sort?: { col: keyof Product; dir: "asc" | "desc" };
  page?: number;
  pageSize?: number;
}

export function useProducts(filters: ProductFilters) {
  const { currentCompanyId } = useCurrentCompany();
  const [data, setData] = useState<Product[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { page = 1, pageSize = 10, sort = { col: "created_at", dir: "desc" } } = filters;
    let q = supabase.from("products").select(PRODUCT_PUBLIC_COLUMNS, { count: "exact" });
    if (currentCompanyId) q = q.eq("company_id", currentCompanyId);
    if (filters.search) {
      const s = `%${filters.search}%`;
      q = q.or(`name.ilike.${s},sku.ilike.${s}`);
    }
    if (filters.categoryId) q = q.eq("category_id", filters.categoryId);
    if (filters.status) q = q.eq("status", filters.status);
    q = q.order(sort.col as string, { ascending: sort.dir === "asc" });
    q = q.range((page - 1) * pageSize, page * pageSize - 1);
    const { data, count } = await q;
    const withCost = await mergeProductCosts((data ?? []) as any[]);
    const merged = await mergeProductWholesalePrices(withCost);
    setData(merged as Product[]);
    setCount(count ?? 0);
    setLoading(false);
  }, [JSON.stringify(filters), currentCompanyId]);

  useEffect(() => { refresh(); }, [refresh]);

  return { data, count, loading, refresh };
}
