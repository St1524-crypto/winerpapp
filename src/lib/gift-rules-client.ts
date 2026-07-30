import { supabase } from "@/integrations/supabase/client";
import type { GiftRule } from "./gift-rules";

/** 讀取啟用中的贈品規則（含觸發商品與贈品內容）。anon / authenticated 皆可讀。 */
export async function fetchActiveGiftRules(): Promise<GiftRule[]> {
  const { data, error } = await (supabase as any)
    .from("gift_rules")
    .select(
      "id, name, trigger_type, threshold, max_gift_qty, priority, is_active, starts_at, ends_at, channel_shop, channel_b2b, gift_rule_conditions(product_id), gift_rule_gifts(product_id, gift_qty)",
    )
    .eq("is_active", true)
    .order("priority", { ascending: false });
  if (error) {
    console.warn("[gift-rules] fetch failed", error.message);
    return [];
  }
  return normalizeRules(data ?? []);
}

export function normalizeRules(rows: any[]): GiftRule[] {
  return (rows ?? []).map((r: any) => ({
    id: r.id,
    name: r.name,
    trigger_type: r.trigger_type,
    threshold: Number(r.threshold) || 0,
    max_gift_qty: Number(r.max_gift_qty) || 0,
    priority: r.priority ?? 0,
    is_active: r.is_active,
    starts_at: r.starts_at ?? null,
    ends_at: r.ends_at ?? null,
    channel_shop: r.channel_shop,
    channel_b2b: r.channel_b2b,
    product_ids: (r.gift_rule_conditions ?? []).map((c: any) => c.product_id),
    gifts: (r.gift_rule_gifts ?? []).map((g: any) => ({
      product_id: g.product_id,
      gift_qty: Number(g.gift_qty) || 0,
    })),
  }));
}

/** 後台：讀取全部規則（含停用） */
export async function fetchAllGiftRules(): Promise<GiftRule[]> {
  const { data, error } = await (supabase as any)
    .from("gift_rules")
    .select(
      "id, name, trigger_type, threshold, max_gift_qty, priority, is_active, starts_at, ends_at, channel_shop, channel_b2b, note, gift_rule_conditions(product_id), gift_rule_gifts(product_id, gift_qty)",
    )
    .order("priority", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return normalizeRules(data ?? []);
}
