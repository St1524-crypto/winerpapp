// Pure helpers to compute the reward points an order should generate,
// based on product/tier rules and VIP referrer distribution parameters.
//
// This module is UI-only: it never writes to the database. Actual issuance
// still happens in `points.functions.ts` / `applyOrderPoints`.

import {
  computeBasePoints,
  computeLevelPayable,
  formatLevelNote,
  formatBuyerMarkerNote,
  type LevelDistribution,
} from "./referrer-reward-distribution";

export interface OrderItemLike {
  product_id: string | null;
  quantity: number;
  tier_reward_points?: number | null;
}

/** Per-line unit reward: tier_reward_points overrides product base. */
export function computeItemUnitReward(
  item: OrderItemLike,
  productRewardsMap: Record<string, number>,
): number {
  const t = item.tier_reward_points;
  if (t !== null && t !== undefined && Number.isFinite(Number(t))) {
    return Math.max(0, Number(t) || 0);
  }
  const pid = item.product_id ?? "";
  return Math.max(0, Number(productRewardsMap[pid] ?? 0));
}

export function computeItemsRewardSubtotal(
  items: OrderItemLike[],
  productRewardsMap: Record<string, number>,
): number {
  return items.reduce(
    (s, it) => s + computeItemUnitReward(it, productRewardsMap) * Math.max(0, Number(it.quantity ?? 0)),
    0,
  );
}

export interface ReferrerChainNode {
  id: string;
  /** Whether this upline is an ACTIVE VIP at read time. */
  vipActive: boolean;
}

export interface BonusRate {
  generation_level: number;
  bonus_rate: number;
}

export interface OrderRewardBreakdown {
  /** Reward earn base computed from items × rules. */
  itemsSubtotal: number;
  /** Who receives the points. */
  kind: "buyer" | "referrer" | "none";
  /** For buyer kind: points going to buyer wallet. */
  buyerPoints: number;
  /** For referrer kind: per-level projected distribution. */
  levels: LevelDistribution[];
  /** Sum of `levels[].amount`. */
  totalDistributed: number;
  /** Aggregate note (matches formatBuyerMarkerNote for referrer). */
  note: string;
}

export interface BreakdownInput {
  buyerId: string;
  itemsSubtotal: number;
  buyerVipActive: boolean;
  referrerChain: ReferrerChainNode[];
  bonusRates: BonusRate[];
}

/**
 * Preview-only breakdown. Does not consult per-member cap ledgers — actual
 * issuance may still be reduced by 消費回饋上限 / 營業分紅上限 at the DB
 * layer. The UI shows both this projection and the recorded issuance for
 * transparency.
 */
export function computeOrderRewardBreakdown({
  itemsSubtotal,
  buyerVipActive,
  referrerChain,
  bonusRates,
}: BreakdownInput): OrderRewardBreakdown {
  const subtotal = Math.max(0, Math.floor(itemsSubtotal));
  if (subtotal <= 0) {
    return {
      itemsSubtotal: 0,
      kind: "none",
      buyerPoints: 0,
      levels: [],
      totalDistributed: 0,
      note: "本單無可產生獎勵點",
    };
  }
  if (buyerVipActive) {
    return {
      itemsSubtotal: subtotal,
      kind: "buyer",
      buyerPoints: subtotal,
      levels: [],
      totalDistributed: subtotal,
      note: `買家為有效 VIP，${subtotal} 獎勵點入自己帳戶`,
    };
  }
  const maxLevel = bonusRates.reduce(
    (m, r) => Math.max(m, Number(r.generation_level ?? 0)),
    0,
  );
  const levels: LevelDistribution[] = [];
  let totalDistributed = 0;
  for (let level = 1; level <= maxLevel && level <= referrerChain.length; level++) {
    const rate = Number(
      bonusRates.find((r) => Number(r.generation_level) === level)?.bonus_rate ?? 0,
    );
    const up = referrerChain[level - 1];
    const basePoints = computeBasePoints(subtotal, rate);
    if (!up.vipActive) {
      if (basePoints > 0) {
        levels.push({
          level,
          amount: 0,
          note: formatLevelNote(0, [], false, basePoints),
        });
      }
      continue;
    }
    // Preview does not run cap ledger RPCs; assume no cap unless caller
    // supplies pre-checked values. `payable === basePoints` here.
    const { payable, capReasons } = computeLevelPayable(basePoints, basePoints, basePoints);
    levels.push({
      level,
      amount: payable,
      note: formatLevelNote(payable, capReasons, true, basePoints),
    });
    totalDistributed += payable;
  }
  return {
    itemsSubtotal: subtotal,
    kind: "referrer",
    buyerPoints: 0,
    levels,
    totalDistributed,
    note: formatBuyerMarkerNote("" as unknown as number ? 0 : subtotal, totalDistributed, levels),
  };
}
