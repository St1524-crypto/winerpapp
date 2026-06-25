import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { getRequestHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

const PRODUCT_COLS =
  "id, sku, name, price, image, status, featured, short_description, category, reward_points";

function publicClient() {
  const auth = getRequestHeader("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  return createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    {
      auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
      global: token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
    },
  );
}

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "super_admin",
  });
  if (data) return;
  const { data: isAdmin } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "admin",
  });
  if (isAdmin) return;
  const { data: isSales } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "sales",
  });
  if (!isSales) throw new Error("Forbidden");
}

/** Public — used by /shop home. */
export const listHomepageFeatured = createServerFn({ method: "GET" }).handler(async () => {
  const client = publicClient();
  const { data: feats, error } = await client
    .from("homepage_featured_products" as any)
    .select("id, product_id, sort_order, is_active, note")
    .eq("is_active", true)
    .order("sort_order", { ascending: true })
    .limit(24);
  if (error) return { ok: false as const, error: error.message, items: [] };
  const ids = (feats ?? []).map((f: any) => f.product_id);
  if (!ids.length) return { ok: true as const, items: [] };
  const { data: prods } = await client
    .from("products")
    .select(PRODUCT_COLS)
    .in("id", ids)
    .eq("status", "active");
  const map = new Map((prods ?? []).map((p: any) => [p.id, p]));
  const items = (feats ?? [])
    .map((f: any) => ({ ...f, product: map.get(f.product_id) }))
    .filter((r: any) => r.product);
  return { ok: true as const, items };
});

/** Admin — all rows (including inactive). */
export const adminListHomepageFeatured = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data: feats } = await context.supabase
      .from("homepage_featured_products" as any)
      .select("*")
      .order("sort_order", { ascending: true });
    const ids = (feats ?? []).map((f: any) => f.product_id);
    let prodMap = new Map<string, any>();
    if (ids.length) {
      const { data: prods } = await context.supabase
        .from("products")
        .select(PRODUCT_COLS)
        .in("id", ids);
      prodMap = new Map((prods ?? []).map((p: any) => [p.id, p]));
    }
    const items = (feats ?? []).map((f: any) => ({ ...f, product: prodMap.get(f.product_id) }));
    return { ok: true as const, items };
  });

/** Admin — search active products to add. */
export const adminSearchProductsForFeature = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ search: z.string().max(120).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    let q = context.supabase
      .from("products")
      .select(PRODUCT_COLS)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(30);
    if (data.search) {
      const s = `%${data.search}%`;
      q = q.or(`name.ilike.${s},sku.ilike.${s}`);
    }
    const { data: prods, error } = await q;
    if (error) return { ok: false as const, error: error.message, items: [] };
    return { ok: true as const, items: prods ?? [] };
  });

export const adminAddHomepageFeatured = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ product_id: z.string().uuid(), note: z.string().max(200).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: maxRow } = await context.supabase
      .from("homepage_featured_products" as any)
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextOrder = ((maxRow as any)?.sort_order ?? -1) + 1;
    const { data: row, error } = await context.supabase
      .from("homepage_featured_products" as any)
      .insert({
        product_id: data.product_id,
        note: data.note ?? null,
        sort_order: nextOrder,
        is_active: true,
        created_by: context.userId,
      })
      .select()
      .single();
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, row };
  });

export const adminRemoveHomepageFeatured = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("homepage_featured_products" as any)
      .delete()
      .eq("id", data.id);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

export const adminToggleHomepageFeatured = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), is_active: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("homepage_featured_products" as any)
      .update({ is_active: data.is_active })
      .eq("id", data.id);
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const };
  });

export const adminReorderHomepageFeatured = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        orders: z
          .array(z.object({ id: z.string().uuid(), sort_order: z.number().int().min(0).max(9999) }))
          .min(1)
          .max(100),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    for (const o of data.orders) {
      const { error } = await context.supabase
        .from("homepage_featured_products" as any)
        .update({ sort_order: o.sort_order })
        .eq("id", o.id);
      if (error) return { ok: false as const, error: error.message };
    }
    return { ok: true as const };
  });
