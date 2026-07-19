import { Gift, CheckCircle2, Clock, ArrowRightLeft, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { OrderRewardBreakdown } from "@/lib/order-reward-calc";

interface RewardEarnRow {
  amount: number | string;
  source: string;
  note: string | null;
  created_at?: string | null;
}

interface Props {
  breakdown: OrderRewardBreakdown | null;
  /** Actual points recorded to buyer wallet (source = order_earn). */
  issuedToBuyer: number;
  /** Whether any referrer marker row exists (source = order_earn_referrer). */
  hasReferrerIssuance: boolean;
  /** point_transactions rows for this order (both order_earn / order_earn_referrer). */
  rewardEarnRows: RewardEarnRow[];
}

/**
 * Dedicated "獎勵點明細" card for the order detail page.
 * Shows: 本單獎勵點數、計算方式摘要、發放狀態。
 *
 * 注意：這裡的「獎勵點」是發獎金用的積分（進入獎金/推薦人獎勵點錢包），
 * 與買家可折抵購物金額的「貢獻點」是不同錢包。
 */
export function OrderRewardDetailCard({
  breakdown,
  issuedToBuyer,
  hasReferrerIssuance,
  rewardEarnRows,
}: Props) {
  if (!breakdown || breakdown.kind === "none") return null;

  const projected =
    breakdown.kind === "buyer" ? breakdown.buyerPoints : breakdown.totalDistributed;
  const actual = breakdown.kind === "buyer" ? issuedToBuyer : 0;
  const issued = breakdown.kind === "buyer" ? issuedToBuyer > 0 : hasReferrerIssuance;

  const referrerRow = rewardEarnRows.find((r) => r.source === "order_earn_referrer");
  const buyerRow = rewardEarnRows.find((r) => r.source === "order_earn");
  const issuedAt = (breakdown.kind === "buyer" ? buyerRow?.created_at : referrerRow?.created_at) ?? null;

  const fmt = (n: number) => n.toLocaleString();
  const fmtTime = (iso: string | null) => {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString("zh-TW", { hour12: false });
    } catch {
      return iso;
    }
  };

  return (
    <Card className="border-amber-500/30 bg-amber-500/[0.03]">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2 text-amber-700 dark:text-amber-300">
          <Gift className="h-4 w-4" />
          獎勵點明細
          <Badge variant="outline" className="ml-1 text-[10px] font-normal">
            發獎金用 · 非買家貢獻點錢包
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {/* 1. 本單獎勵點數 */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-md border border-amber-500/20 bg-background/60 p-3">
            <div className="text-[11px] text-muted-foreground">預估獎勵點</div>
            <div className="mt-1 text-lg font-semibold tabular-nums text-amber-600">
              + {fmt(projected)} 點
            </div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              依商品獎勵點 × VIP 復購位階
            </div>
          </div>
          <div className="rounded-md border border-amber-500/20 bg-background/60 p-3">
            <div className="text-[11px] text-muted-foreground">實際發放</div>
            <div className="mt-1 text-lg font-semibold tabular-nums text-amber-600">
              {breakdown.kind === "buyer"
                ? `+ ${fmt(actual)} 點`
                : issued
                ? "已依明細發放"
                : "尚未發放"}
            </div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              {issued ? `發放時間：${fmtTime(issuedAt)}` : "訂單付款完成後產生"}
            </div>
          </div>
        </div>

        {/* 2. 計算方式摘要 */}
        <div className="rounded-md border border-border/60 bg-background/40 p-3">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Info className="h-3.5 w-3.5" />
            計算方式
          </div>
          <div className="mt-1.5 text-xs text-foreground/80 leading-relaxed">
            商品獎勵點小計 <span className="tabular-nums font-medium">{fmt(breakdown.itemsSubtotal)}</span> 點。
            {breakdown.kind === "buyer" ? (
              <>買家為有效 VIP → 全額入買家獎勵點帳戶（作為結算獎金用）。</>
            ) : (
              <>買家非有效 VIP → 依「復購位階制度」按代別比例折算後，發放至有效 VIP 上線的獎勵點錢包。</>
            )}
          </div>
          {breakdown.kind === "referrer" && breakdown.levels.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-[11px] text-muted-foreground">
              {breakdown.levels.map((l) => (
                <li key={l.level} className="flex justify-between gap-2">
                  <span>
                    第 {l.level} 代{l.note ? ` — ${l.note}` : ""}
                  </span>
                  <span className="tabular-nums text-amber-600">
                    +{l.amount.toLocaleString()} 點
                  </span>
                </li>
              ))}
            </ul>
          )}
          {breakdown.kind === "buyer" && actual > 0 && actual !== projected && (
            <div className="mt-1.5 text-[11px] text-amber-600">
              實際發放與預估不同：可能受 VIP 消費回饋或營業分紅上限影響。
            </div>
          )}
        </div>

        {/* 3. 發放狀態 */}
        <div className="rounded-md border border-border/60 bg-background/40 p-3">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            {issued ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            ) : (
              <Clock className="h-3.5 w-3.5" />
            )}
            發放狀態
          </div>
          <div className="mt-1.5 text-xs text-foreground/80 space-y-1">
            {!issued && (
              <div className="flex items-center gap-1.5">
                <Badge variant="secondary" className="text-[10px]">待發放</Badge>
                <span>訂單付款完成並通過結算後將自動入帳。</span>
              </div>
            )}
            {issued && breakdown.kind === "buyer" && (
              <div className="flex items-center gap-1.5">
                <Badge className="text-[10px] bg-emerald-600 hover:bg-emerald-600">已入買家獎勵點錢包</Badge>
                <span className="tabular-nums">+ {fmt(actual)} 點</span>
              </div>
            )}
            {issued && breakdown.kind === "referrer" && (
              <>
                <div className="flex items-center gap-1.5">
                  <Badge className="text-[10px] bg-emerald-600 hover:bg-emerald-600">
                    <ArrowRightLeft className="mr-1 h-3 w-3" />
                    已轉推薦人獎勵點錢包
                  </Badge>
                </div>
                {referrerRow?.note && (
                  <div className="text-[11px] text-muted-foreground leading-relaxed">
                    {referrerRow.note}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
