// 多件可加贈品（滿件／滿額送）規則計算模組
// 純函式，前後台共用；伺服器端建單時會重算一次，不信任前端輸入。

export type GiftTriggerType = "product_qty" | "order_qty" | "order_amount" | "group_qty";

export const GIFT_TRIGGER_LABEL: Record<GiftTriggerType, string> = {
  product_qty: "單一商品件數",
  order_qty: "訂單總件數",
  order_amount: "訂單金額",
  group_qty: "指定商品群組件數",
};

export const GIFT_TRIGGER_UNIT: Record<GiftTriggerType, string> = {
  product_qty: "件",
  order_qty: "件",
  order_amount: "元",
  group_qty: "件",
};

export interface GiftRuleGift {
  product_id: string;
  gift_qty: number;
  product_name?: string | null;
  image?: string | null;
}

export interface GiftRule {
  id: string;
  name: string;
  trigger_type: GiftTriggerType;
  threshold: number;
  max_gift_qty: number; // 0 = 不限
  priority?: number | null;
  is_active?: boolean | null;
  starts_at?: string | null;
  ends_at?: string | null;
  channel_shop?: boolean | null;
  channel_b2b?: boolean | null;
  product_ids: string[]; // 觸發商品範圍（product_qty / group_qty 必填）
  gifts: GiftRuleGift[];
}

export interface GiftCartLine {
  product_id: string;
  quantity: number;
  unit_price: number;
  is_gift?: boolean;
}

export interface GiftAward {
  rule_id: string;
  rule_name: string;
  product_id: string;
  quantity: number;
  product_name?: string | null;
  image?: string | null;
}

export interface GiftRuleProgress {
  rule: GiftRule;
  metric: number; // 目前累計（件數或金額）
  multiples: number; // 已達標倍數
  remainingToNext: number; // 距離下一個倍數還差多少
  capped: boolean; // 是否被 max_gift_qty 截斷
  awards: GiftAward[];
}

export type GiftChannel = "shop" | "b2b";

function toDateOnly(d: Date) {
  // 以台灣時間（UTC+8）判斷生效日
  const tw = new Date(d.getTime() + 8 * 3600 * 1000);
  return tw.toISOString().slice(0, 10);
}

export function isRuleActiveOn(rule: GiftRule, channel: GiftChannel, now: Date = new Date()) {
  if (rule.is_active === false) return false;
  if (channel === "shop" && rule.channel_shop === false) return false;
  if (channel === "b2b" && rule.channel_b2b === false) return false;
  const today = toDateOnly(now);
  if (rule.starts_at && today < rule.starts_at) return false;
  if (rule.ends_at && today > rule.ends_at) return false;
  return true;
}

/** 計算單一規則的達標倍數與贈品 */
export function evaluateRule(rule: GiftRule, lines: GiftCartLine[]): GiftRuleProgress {
  // 贈品列本身不參與門檻計算
  const paid = lines.filter((l) => !l.is_gift && l.quantity > 0);
  const scope = new Set(rule.product_ids ?? []);

  let metric = 0;
  switch (rule.trigger_type) {
    case "order_qty":
      metric = paid.reduce((s, l) => s + l.quantity, 0);
      break;
    case "order_amount":
      metric = paid.reduce((s, l) => s + l.unit_price * l.quantity, 0);
      break;
    case "group_qty":
      metric = paid.filter((l) => scope.has(l.product_id)).reduce((s, l) => s + l.quantity, 0);
      break;
    case "product_qty":
    default:
      // 單一商品：取範圍內「單一商品」達標倍數最高者累加（各商品分別計算後相加）
      metric = paid.filter((l) => scope.has(l.product_id)).reduce((s, l) => s + l.quantity, 0);
      break;
  }

  const threshold = Number(rule.threshold) || 0;
  let multiples = 0;

  if (rule.trigger_type === "product_qty") {
    // 每個商品各自計算倍數再相加，避免跨商品湊件
    const byProduct = new Map<string, number>();
    for (const l of paid) {
      if (!scope.has(l.product_id)) continue;
      byProduct.set(l.product_id, (byProduct.get(l.product_id) ?? 0) + l.quantity);
    }
    for (const qty of byProduct.values()) {
      if (threshold > 0) multiples += Math.floor(qty / threshold);
    }
  } else {
    multiples = threshold > 0 ? Math.floor(metric / threshold) : 0;
  }

  const remainingToNext = threshold > 0 ? threshold - (metric % threshold || 0) : 0;

  let totalGiftQty = 0;
  let capped = false;
  const awards: GiftAward[] = [];
  if (multiples > 0) {
    for (const g of rule.gifts ?? []) {
      let qty = (Number(g.gift_qty) || 0) * multiples;
      if (qty <= 0) continue;
      if (rule.max_gift_qty > 0) {
        const allowed = Math.max(0, rule.max_gift_qty - totalGiftQty);
        if (qty > allowed) {
          qty = allowed;
          capped = true;
        }
      }
      if (qty <= 0) {
        capped = true;
        continue;
      }
      totalGiftQty += qty;
      awards.push({
        rule_id: rule.id,
        rule_name: rule.name,
        product_id: g.product_id,
        quantity: qty,
        product_name: g.product_name ?? null,
        image: g.image ?? null,
      });
    }
  }

  return {
    rule,
    metric,
    multiples,
    remainingToNext: multiples > 0 && threshold > 0 && metric % threshold === 0 ? threshold : remainingToNext,
    capped,
    awards,
  };
}

/** 計算購物車應獲得的所有贈品（同贈品合併數量） */
export function computeGifts(
  lines: GiftCartLine[],
  rules: GiftRule[],
  channel: GiftChannel = "shop",
  now: Date = new Date(),
): { awards: GiftAward[]; progress: GiftRuleProgress[] } {
  const usable = (rules ?? [])
    .filter((r) => isRuleActiveOn(r, channel, now))
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));

  const progress = usable.map((r) => evaluateRule(r, lines));

  const merged = new Map<string, GiftAward>();
  for (const p of progress) {
    for (const a of p.awards) {
      const key = `${a.product_id}`;
      const cur = merged.get(key);
      if (cur) {
        cur.quantity += a.quantity;
        cur.rule_name = `${cur.rule_name} / ${a.rule_name}`;
      } else {
        merged.set(key, { ...a });
      }
    }
  }
  return { awards: Array.from(merged.values()), progress };
}

export function triggerSummary(rule: Pick<GiftRule, "trigger_type" | "threshold">) {
  const unit = GIFT_TRIGGER_UNIT[rule.trigger_type];
  const t = Number(rule.threshold) || 0;
  const amount = rule.trigger_type === "order_amount";
  return `每滿 ${amount ? `NT$${t.toLocaleString()}` : `${t} ${unit}`}（${GIFT_TRIGGER_LABEL[rule.trigger_type]}）`;
}
