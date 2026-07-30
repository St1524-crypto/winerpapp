import type { GiftRule } from "./gift-rules";

/** 將 DB 巢狀查詢結果轉為 GiftRule（前後端共用，不含任何 client 相依） */
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

export const GIFT_RULE_SELECT =
  "id, name, trigger_type, threshold, max_gift_qty, priority, is_active, starts_at, ends_at, channel_shop, channel_b2b, note, company_id, gift_rule_conditions(product_id), gift_rule_gifts(product_id, gift_qty)";
