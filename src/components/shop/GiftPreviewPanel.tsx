import { Gift } from "lucide-react";
import { useGiftPreview } from "@/hooks/use-gift-preview";
import { GIFT_TRIGGER_UNIT, type GiftCartLine, type GiftChannel } from "@/lib/gift-rules";

interface Props {
  lines: GiftCartLine[];
  channel?: GiftChannel;
  compact?: boolean;
}

/** 購物車 / 結帳頁的「多件加贈」提示區塊 */
export function GiftPreviewPanel({ lines, channel = "shop", compact }: Props) {
  const { awards, progress } = useGiftPreview(lines, channel);

  const hints = progress
    .filter((p) => p.rule.gifts.length > 0 && p.metric > 0 && p.multiples === 0)
    .slice(0, 3);

  if (!awards.length && !hints.length) return null;

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium text-primary">
        <Gift className="h-4 w-4" />
        多件加贈
      </div>

      {awards.length > 0 && (
        <ul className="space-y-1">
          {awards.map((a) => (
            <li key={a.product_id} className="flex items-center justify-between text-sm">
              <span className="truncate">
                {a.product_name}
                {!compact && <span className="ml-1 text-xs text-muted-foreground">（{a.rule_name}）</span>}
              </span>
              <span className="shrink-0 font-semibold text-primary">× {a.quantity}</span>
            </li>
          ))}
        </ul>
      )}

      {hints.map((p) => (
        <div key={p.rule.id} className="text-xs text-muted-foreground">
          再{p.rule.trigger_type === "order_amount"
            ? `消費 NT$${Math.max(0, p.remainingToNext).toLocaleString()}`
            : `買 ${Math.max(0, p.remainingToNext)} ${GIFT_TRIGGER_UNIT[p.rule.trigger_type]}`}
          即可獲得「{p.rule.name}」贈品
        </div>
      ))}

      <div className="text-[11px] text-muted-foreground">贈品為 0 元，不計入獎勵點與分紅基數。</div>
    </div>
  );
}
