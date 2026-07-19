import { Gift } from "lucide-react";
import type { OrderRewardBreakdown } from "@/lib/order-reward-calc";

interface Props {
  breakdown: OrderRewardBreakdown | null;
  /** Actual amount recorded to buyer wallet in point_transactions (order_earn). */
  issuedToBuyer: number;
  /** Whether any order_earn_referrer marker row exists (i.e. issuance already ran). */
  hasReferrerIssuance: boolean;
  className?: string;
  compact?: boolean;
}

/**
 * Unified "本單產生獎勵點" display used across admin + storefront order
 * detail pages. Shows the projected amount (from item rules × VIP bonus
 * parameters) and, when different, the actual issued amount for transparency.
 */
export function OrderRewardSummary({
  breakdown,
  issuedToBuyer,
  hasReferrerIssuance,
  className,
  compact = false,
}: Props) {
  if (!breakdown || breakdown.kind === "none") return null;

  const projected =
    breakdown.kind === "buyer" ? breakdown.buyerPoints : breakdown.totalDistributed;
  const issued = breakdown.kind === "buyer" ? issuedToBuyer : breakdown.totalDistributed;
  const issuanceRun = breakdown.kind === "buyer" ? issuedToBuyer > 0 : hasReferrerIssuance;
  const diff = issuanceRun && breakdown.kind === "buyer" && issued !== projected;

  const title =
    breakdown.kind === "buyer"
      ? "本單產生獎勵點（發獎金用，非買家錢包）"
      : "本單產生獎勵點（依復購位階發放至推薦人）";

  return (
    <div
      className={
        "rounded-md bg-amber-500/10 px-3 py-2 text-amber-500 " +
        (compact ? "text-xs" : "text-sm") +
        (className ? ` ${className}` : "")
      }
    >
      <div className="flex justify-between items-center">
        <span className="flex items-center gap-1.5">
          <Gift className="h-4 w-4" />
          {title}
        </span>
        <span className="tabular-nums font-semibold">
          + {projected.toLocaleString()} 點
        </span>
      </div>
      {breakdown.kind === "referrer" && breakdown.levels.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-[11px] text-amber-500/80">
          {breakdown.levels.map((l) => (
            <li key={l.level} className="flex justify-between">
              <span>
                第 {l.level} 代 {l.note ? `— ${l.note}` : ""}
              </span>
              <span className="tabular-nums">+{l.amount.toLocaleString()}</span>
            </li>
          ))}
        </ul>
      )}
      {diff && (
        <div className="mt-1 text-[11px] text-amber-500/80">
          實際發放 {issued.toLocaleString()} 點（差異可能來自 VIP 消費回饋或營業分紅上限）
        </div>
      )}
      {breakdown.kind === "referrer" && !hasReferrerIssuance && (
        <div className="mt-1 text-[11px] text-amber-500/80">
          為預估值；實際發放結果請以點數紀錄為準
        </div>
      )}
    </div>
  );
}
