import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Category, Product } from "@/types/product";

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
  const [data, setData] = useState<Product[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { page = 1, pageSize = 10, sort = { col: "created_at", dir: "desc" } } = filters;
    let q = supabase.from("products").select("*", { count: "exact" });
    if (filters.search) {
      const s = `%${filters.search}%`;
      q = q.or(`name.ilike.${s},sku.ilike.${s}`);
    }
    if (filters.categoryId) q = q.eq("category_id", filters.categoryId);
    if (filters.status) q = q.eq("status", filters.status);
    q = q.order(sort.col as string, { ascending: sort.dir === "asc" });
    q = q.range((page - 1) * pageSize, page * pageSize - 1);
    const { data, count } = await q;
    setData((data ?? []) as Product[]);
    setCount(count ?? 0);
    setLoading(false);
  }, [JSON.stringify(filters)]);

  useEffect(() => { refresh(); }, [refresh]);

  return { data, count, loading, refresh };
}
