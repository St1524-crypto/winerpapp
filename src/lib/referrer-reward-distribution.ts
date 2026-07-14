// Pure helpers for guest / expired-VIP referral reward distribution.
// Extracted from points.functions.ts so cap logic and note formatting can be unit-tested.

export type CapReason = "消費回饋上限" | "升級分紅上限";

export interface LevelDistribution {
  level: number;
  amount: number;
  note?: string;
}

/**
 * Compute the actual payable reward points for one generation, given the base
 * points (already rate-adjusted) and the payable amounts returned by
 * `record_business_bonus_release` and `record_upgrade_bonus_release`.
 *
 * `payable = min(basePoints, bizPayable, upgPayable)` and we surface which
 * cap(s) reduced the payout so the buyer-side marker `note` can explain it.
 */
export function computeLevelPayable(
  basePoints: number,
  bizPayable: number,
  upgPayable: number,
): { payable: number; capReasons: CapReason[] } {
  const base = Math.max(0, Math.floor(basePoints));
  const biz = Math.max(0, Math.floor(bizPayable));
  const upg = Math.max(0, Math.floor(upgPayable));
  const payable = Math.max(0, Math.min(base, biz, upg));
  const capReasons: CapReason[] = [];
  if (biz < base) capReasons.push("消費回饋上限");
  if (upg < base) capReasons.push("升級分紅上限");
  return { payable, capReasons };
}

/**
 * Build the per-generation `note` fragment used both in the buyer's marker
 * `point_transactions` row and (via `formatBuyerMarkerNote`) in the order
 * detail UI. Guarantees a non-empty note when the payable is 0 due to caps or
 * an inactive upline.
 */
export function formatLevelNote(
  payable: number,
  capReasons: CapReason[],
  upVipActive: boolean,
  basePoints: number,
): string | undefined {
  if (!upVipActive) {
    return basePoints > 0 ? "上線非有效 VIP 略過" : undefined;
  }
  if (capReasons.length === 0) return undefined;
  return payable > 0
    ? `部分達${capReasons.join("、")}`
    : `已達${capReasons.join("、")} 略過`;
}

/**
 * Aggregate marker note for the buyer's `point_transactions` row.
 * Includes every generation entry so the reason for `payable=0` is visible.
 */
export function formatBuyerMarkerNote(
  rewardEarn: number,
  totalDistributed: number,
  distributedTo: LevelDistribution[],
): string {
  const base = `買家非有效 VIP，${rewardEarn} 獎勵點依復購位階折算 ${totalDistributed} 點發放至推薦人獎勵點錢包`;
  if (distributedTo.length === 0) return `${base}（無有效 VIP 上線可接收）`;
  const parts = distributedTo
    .map((d) => `L${d.level} +${d.amount} 點${d.note ? `（${d.note}）` : ""}`)
    .join(", ");
  return `${base}（${parts}）`;
}

/**
 * Compute basePoints for a generation from `repurchase_bonus_settings.bonus_rate`.
 * Rounded down to integer points, matching the runtime behaviour.
 */
export function computeBasePoints(rewardEarn: number, rate: number): number {
  return Math.floor((Math.max(0, rewardEarn) * Math.max(0, rate)) / 100);
}
