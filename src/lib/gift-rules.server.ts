import type { GiftCartLine, GiftChannel } from "./gift-rules";
import { computeGifts } from "./gift-rules";
import { normalizeRules } from "./gift-rules-shared";

/**
 * 伺服器端重算贈品並寫入 sales_order_items。
 * 前端傳來的贈品一律忽略，以資料庫規則為準。
 */
export async function applyGiftLinesToOrder(params: {
  orderId: string;
  companyId: string;
  lines: GiftCartLine[];
  channel?: GiftChannel;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as any;

  const { data: ruleRows, error: ruleErr } = await db
    .from("gift_rules")
    .select(
      "id, name, trigger_type, threshold, max_gift_qty, priority, is_active, starts_at, ends_at, channel_shop, channel_b2b, gift_rule_conditions(product_id), gift_rule_gifts(product_id, gift_qty)",
    )
    .eq("is_active", true)
    .or(`company_id.is.null,company_id.eq.${params.companyId}`);
  if (ruleErr) {
    console.warn("[gift-rules] server fetch failed", ruleErr.message);
    return [];
  }

  const rules = normalizeRules(ruleRows ?? []);
  if (!rules.length) return [];

  const { awards } = computeGifts(
    params.lines.filter((l) => !l.is_gift),
    rules,
    params.channel ?? "shop",
  );
  if (!awards.length) return [];

  const productIds = Array.from(new Set(awards.map((a) => a.product_id)));
  const { data: products } = await db
    .from("products")
    .select("id, name, sku, image")
    .in("id", productIds);
  const pmap = new Map((products ?? []).map((p: any) => [p.id, p]));

  const rows = awards.map((a) => {
    const p: any = pmap.get(a.product_id) ?? {};
    return {
      sales_order_id: params.orderId,
      company_id: params.companyId,
      product_id: a.product_id,
      product_name: `${p.name ?? "贈品"}（贈品）`,
      sku: p.sku ?? null,
      image: p.image ?? null,
      unit_price: 0,
      quantity: a.quantity,
      subtotal: 0,
      tier_reward_points: 0,
      is_gift: true,
      gift_rule_id: a.rule_id,
    };
  });

  const { error: insErr } = await db.from("sales_order_items").insert(rows);
  if (insErr) {
    console.warn("[gift-rules] gift line insert failed", insErr.message);
    return [];
  }
  return awards;
}
