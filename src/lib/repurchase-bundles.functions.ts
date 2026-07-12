import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------- Types ----------
export type BundleVisibility = "all" | "vip" | "dealer";
export type BundleStatus = "active" | "inactive" | "draft";

export interface BundleItemInput {
  product_id: string;
  quantity: number;
  sort_order?: number;
}

// ---------- Public: list active bundles ----------
export const listActiveBundles = createServerFn({ method: "GET" }).handler(async () => {
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: bundles, error } = await sb
    .from("repurchase_bundles")
    .select("*")
    .eq("status", "active")
    .eq("visibility", "all")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  const ids = (bundles ?? []).map((b: any) => b.id);
  const { data: items } = ids.length
    ? await sb
        .from("repurchase_bundle_items")
        .select("*, product:products(id, name, sku, image, price)")
        .in("bundle_id", ids)
        .order("sort_order")
    : { data: [] as any[] };
  return (bundles ?? []).map((b: any) => ({
    ...b,
    items: (items ?? []).filter((it: any) => it.bundle_id === b.id),
  }));
});

// ---------- Public: get bundle by slug ----------
export const getBundleBySlug = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ slug: z.string().min(1) }).parse(d))
  .handler(async ({ data }) => {
    const { createClient } = await import("@supabase/supabase-js");
    const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: b, error } = await sb
      .from("repurchase_bundles")
      .select("*")
      .eq("slug", data.slug)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!b) return null;
    const { data: items } = await sb
      .from("repurchase_bundle_items")
      .select("*, product:products(id, name, sku, image, price, stock, status)")
      .eq("bundle_id", (b as any).id)
      .order("sort_order");
    return { ...(b as any), items: items ?? [] };
  });

// ---------- Admin utils ----------
async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
  const roles = (data ?? []).map((r: any) => r.role);
  if (!roles.some((r: string) => ["super_admin", "admin", "finance"].includes(r))) {
    throw new Error("沒有權限");
  }
}

// ---------- Admin: list all bundles ----------
export const adminListBundles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: bundles } = await supabaseAdmin
      .from("repurchase_bundles")
      .select("*")
      .order("sort_order")
      .order("created_at", { ascending: false });
    const ids = (bundles ?? []).map((b: any) => b.id);
    const { data: items } = ids.length
      ? await supabaseAdmin
          .from("repurchase_bundle_items")
          .select("*, product:products(id, name, sku, image, price)")
          .in("bundle_id", ids)
          .order("sort_order")
      : { data: [] as any[] };
    return (bundles ?? []).map((b: any) => ({
      ...b,
      items: (items ?? []).filter((it: any) => it.bundle_id === b.id),
    }));
  });

// ---------- Admin: upsert bundle ----------
const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, "slug 僅可含小寫英數與 -"),
  description: z.string().max(2000).optional().nullable(),
  cover_image: z.string().max(500).optional().nullable(),
  bundle_price: z.coerce.number().min(0),
  bundle_reward_points: z.coerce.number().int().min(0),
  visibility: z.enum(["all", "vip", "dealer"]).default("all"),
  status: z.enum(["active", "inactive", "draft"]).default("draft"),
  start_at: z.string().optional().nullable(),
  end_at: z.string().optional().nullable(),
  max_per_order: z.coerce.number().int().positive().optional().nullable(),
  sort_order: z.coerce.number().int().default(0),
  items: z.array(z.object({
    product_id: z.string().uuid(),
    quantity: z.coerce.number().int().positive(),
    sort_order: z.coerce.number().int().default(0),
  })).min(1, "請至少加入一項商品"),
});

export const adminUpsertBundle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => upsertSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { items, id, ...rest } = data;
    const payload: any = {
      ...rest,
      start_at: rest.start_at || null,
      end_at: rest.end_at || null,
      max_per_order: rest.max_per_order ?? null,
      updated_at: new Date().toISOString(),
    };
    let bundleId = id;
    if (bundleId) {
      const { error } = await supabaseAdmin.from("repurchase_bundles").update(payload).eq("id", bundleId);
      if (error) throw new Error(error.message);
    } else {
      payload.created_by = context.userId;
      const { data: ins, error } = await supabaseAdmin
        .from("repurchase_bundles")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      bundleId = (ins as any).id;
    }
    // Replace items
    await supabaseAdmin.from("repurchase_bundle_items").delete().eq("bundle_id", bundleId);
    const rows = items.map((it, idx) => ({
      bundle_id: bundleId,
      product_id: it.product_id,
      quantity: it.quantity,
      sort_order: it.sort_order ?? idx,
    }));
    const { error: iErr } = await supabaseAdmin.from("repurchase_bundle_items").insert(rows);
    if (iErr) throw new Error(iErr.message);
    return { id: bundleId };
  });

// ---------- Admin: delete ----------
export const adminDeleteBundle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("repurchase_bundles").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Add bundle copies to authenticated user's cart ----------
// bundle_line_key 統一等於 bundle_id：同一套組的多份會累加到同一批列上（quantity 為總件數）。
export const addBundleToCart = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    bundleId: z.string().uuid(),
    copies: z.coerce.number().int().positive().default(1),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context;
    // Validate bundle is purchasable
    const { data: bundle, error: bErr } = await supabase
      .from("repurchase_bundles")
      .select("*")
      .eq("id", data.bundleId)
      .maybeSingle();
    if (bErr) throw new Error(bErr.message);
    if (!bundle || (bundle as any).status !== "active") throw new Error("套組不存在或未上架");
    if ((bundle as any).max_per_order && data.copies > (bundle as any).max_per_order) {
      throw new Error(`單筆最多可購買 ${(bundle as any).max_per_order} 組`);
    }
    const { data: bItems, error: iErr } = await supabase
      .from("repurchase_bundle_items")
      .select("product_id, quantity")
      .eq("bundle_id", data.bundleId);
    if (iErr) throw new Error(iErr.message);
    if (!bItems || bItems.length === 0) throw new Error("套組尚未設定商品");

    // Ensure cart exists
    const { data: existingCarts } = await supabase
      .from("carts").select("id").eq("user_id", userId)
      .order("created_at", { ascending: false }).limit(1);
    let cartId = existingCarts?.[0]?.id;
    if (!cartId) {
      const { data: created, error: cErr } = await supabase
        .from("carts").insert({ user_id: userId }).select("id").single();
      if (cErr) throw new Error(cErr.message);
      cartId = (created as any).id;
    }
    const lineKey = data.bundleId;
    for (const bi of bItems as any[]) {
      const addQty = Number(bi.quantity) * data.copies;
      const { data: existing } = await supabase
        .from("cart_items")
        .select("id, quantity")
        .eq("cart_id", cartId)
        .eq("product_id", bi.product_id)
        .eq("bundle_line_key", lineKey)
        .maybeSingle();
      if (existing) {
        await supabase.from("cart_items")
          .update({ quantity: Number((existing as any).quantity) + addQty })
          .eq("id", (existing as any).id);
      } else {
        await supabase.from("cart_items").insert({
          cart_id: cartId,
          product_id: bi.product_id,
          quantity: addQty,
          bundle_id: data.bundleId,
          bundle_line_key: lineKey,
        });
      }
    }
    return { ok: true, cartId, copies: data.copies };
  });

// ---------- Remove entire bundle from cart ----------
export const removeBundleFromCart = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ cartId: z.string().uuid(), bundleLineKey: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("cart_items").delete()
      .eq("cart_id", data.cartId)
      .eq("bundle_line_key", data.bundleLineKey);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
