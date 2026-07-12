// Pure helper for the checkout success page "本次發放獎勵點" section.
// Extracted so it can be unit-tested without React / DOM.

export interface RewardTxRow {
  amount: number;
  source: string;
  note: string | null;
}

export type RewardNotice =
  | { kind: "earn"; points: number }
  | { kind: "referrer"; note: string }
  | null;

export const REFERRER_FALLBACK_NOTE =
  "本次獎勵點依復購位階制度發放至推薦人獎勵點錢包（依營業分紅比例與 VIP 升級分紅上限）。";

/**
 * Decide what the checkout success page should render for reward points.
 * - Buyer earned reward points directly  → { kind: "earn", points }
 * - Rewards routed to referrer wallet    → { kind: "referrer", note }
 * - Nothing to show                      → null
 *
 * "earn" takes precedence when both rows are present (defensive; the writer
 * shouldn't emit both, but if it does the buyer-facing message wins).
 */
export function resolveRewardNotice(rewardTx: RewardTxRow[]): RewardNotice {
  const earn = rewardTx.find((r) => r.source === "order_earn");
  const earnPts = Number(earn?.amount ?? 0);
  if (earnPts > 0) return { kind: "earn", points: earnPts };

  const ref = rewardTx.find((r) => r.source === "order_earn_referrer");
  if (ref) return { kind: "referrer", note: ref.note ?? REFERRER_FALLBACK_NOTE };

  return null;
}
