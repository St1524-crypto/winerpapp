import { supabase } from "@/integrations/supabase/client";
import type { WholesaleTier } from "@/types/product";

/** Pick the tier whose [min_qty, max_qty] covers the quantity. */
export function pickTier(tiers: WholesaleTier[] | null | undefined, qty: number): WholesaleTier | null {
  if (!tiers || tiers.length === 0) return null;
  // 找出所有符合 [min_qty, max_qty] 的階梯，取單價最低（對買家最有利）
  const matches = tiers.filter((t) => {
    const okMin = qty >= t.min_qty;
    const okMax = t.max_qty == null || qty <= t.max_qty;
    return okMin && okMax;
  });
  if (matches.length === 0) return null;
  return matches.reduce((best, cur) =>
    (Number(cur.unit_price) || 0) < (Number(best.unit_price) || 0) ? cur : best,
  );
}

export interface WholesalePricingResult {
  unitPrice: number;          // 套用後單價（無階梯則回 basePrice）
  unitRewardPoints: number;   // 此階梯每件獎勵點（無階梯則回 baseReward）
  totalReward: number;        // 單件獎勵點 × 數量
  tier: WholesaleTier | null;
}

export function applyWholesalePricing(
  basePrice: number,
  baseReward: number,
  tiers: WholesaleTier[] | null | undefined,
  qty: number,
): WholesalePricingResult {
  const tier = pickTier(tiers, qty);
  if (!tier) {
    return { unitPrice: basePrice, unitRewardPoints: baseReward, totalReward: baseReward * qty, tier: null };
  }
  return {
    unitPrice: Number(tier.unit_price) || 0,
    unitRewardPoints: Number(tier.unit_reward_points) || 0,
    totalReward: (Number(tier.unit_reward_points) || 0) * qty,
    tier,
  };
}

export async function fetchTiersByProductIds(productIds: string[]): Promise<Record<string, WholesaleTier[]>> {
  if (productIds.length === 0) return {};
  const { data } = await supabase
    .from("product_wholesale_tiers" as any)
    .select("*")
    .in("product_id", productIds)
    .order("min_qty", { ascending: true });
  const map: Record<string, WholesaleTier[]> = {};
  for (const t of (data ?? []) as any as WholesaleTier[]) {
    const pid = (t as any).product_id as string;
    (map[pid] = map[pid] ?? []).push(t);
  }
  return map;
}

export async function fetchTiersForProduct(productId: string): Promise<WholesaleTier[]> {
  const { data } = await supabase
    .from("product_wholesale_tiers" as any)
    .select("*")
    .eq("product_id", productId)
    .order("min_qty", { ascending: true });
  return (data ?? []) as any as WholesaleTier[];
}
