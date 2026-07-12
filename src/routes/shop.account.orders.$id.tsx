import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Package, MapPin, Lock, ExternalLink, Gift } from "lucide-react";
import { ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS, SHIPPING_STATUS_LABELS, type SalesOrder, type SalesOrderItem } from "@/types/shop";
import { resolveRewardNotice, type RewardTxRow } from "@/lib/checkout-reward-notice";
import { processOrderAnnualFeeUpgrade } from "@/lib/annual-fee-vip.functions";
import { processOrderVipPackageUpgrade } from "@/lib/vip-tiers.functions";
import { applyOrderPoints } from "@/lib/points.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/shop/account/orders/$id")({ component: OrderDetail });

function OrderDetail() {
  const { id } = Route.useParams();
  const [order, setOrder] = useState<SalesOrder | null>(null);
  const [items, setItems] = useState<SalesOrderItem[]>([]);
  const [rewardTx, setRewardTx] = useState<any[]>([]);
  const [tierBreakdown, setTierBreakdown] = useState<Array<{
    product_id: string | null;
    product_name: string;
    sku: string | null;
    quantity: number;
    unit_reward_points: number;
    line_total: number;
    tier: { min_qty: number; max_qty: number | null } | null;
    source: "tier" | "base";
  }>>([]);
  const [loading, setLoading] = useState(true);
  const upgradeTriggered = useRef(false);
  const rewardBackfillTriggered = useRef(false);

  useEffect(() => {
    (async () => {
      const [{ data: o }, { data: it }, { data: rt }] = await Promise.all([
        supabase.from("sales_orders").select("*").eq("id", id).maybeSingle(),
        supabase.from("sales_order_items").select("*").eq("sales_order_id", id),
        supabase
          .from("point_transactions")
          .select("amount, source, note")
          .eq("reference_id", id)
          .in("source", ["order_earn", "order_earn_referrer"])
          .eq("point_type", "reward"),
      ]);
      setOrder(o as SalesOrder | null);
      const itemRows = (it ?? []) as SalesOrderItem[];
      setItems(itemRows);
      setRewardTx((rt ?? []) as any[]);

      // 讀取階梯設定與基礎獎勵點以顯示本單計算明細（與伺服器發放邏輯一致）
      const productIds = Array.from(new Set(itemRows.map((i: any) => i.product_id).filter(Boolean))) as string[];
      if (productIds.length > 0) {
        const [{ data: prods }, { data: tiersData }] = await Promise.all([
          supabase.from("products").select("id, reward_points").in("id", productIds),
          supabase
            .from("product_wholesale_tiers")
            .select("product_id, min_qty, max_qty, unit_reward_points")
            .in("product_id", productIds)
            .order("min_qty", { ascending: true }),
        ]);
        const baseMap = new Map<string, number>((prods ?? []).map((p: any) => [p.id, Number(p.reward_points ?? 0)]));
        const tiersMap = new Map<string, Array<{ min_qty: number; max_qty: number | null; unit_reward_points: number }>>();
        for (const t of (tiersData ?? []) as any[]) {
          const arr = tiersMap.get(t.product_id) ?? [];
          arr.push({
            min_qty: Number(t.min_qty ?? 0),
            max_qty: t.max_qty == null ? null : Number(t.max_qty),
            unit_reward_points: Number(t.unit_reward_points ?? 0),
          });
          tiersMap.set(t.product_id, arr);
        }
        const breakdown = itemRows.map((row: any) => {
          const pid = row.product_id as string | null;
          const qty = Number(row.quantity ?? 0);
          const tiers = pid ? tiersMap.get(pid) ?? [] : [];
          const matched = tiers.filter((t) => qty >= t.min_qty && (t.max_qty == null || qty <= t.max_qty));
          if (matched.length > 0) {
            const best = matched.reduce((b, c) => (c.unit_reward_points > b.unit_reward_points ? c : b));
            return {
              product_id: pid,
              product_name: row.product_name,
              sku: row.sku,
              quantity: qty,
              unit_reward_points: best.unit_reward_points,
              line_total: best.unit_reward_points * qty,
              tier: { min_qty: best.min_qty, max_qty: best.max_qty },
              source: "tier" as const,
            };
          }
          const unit = pid ? baseMap.get(pid) ?? 0 : 0;
          return {
            product_id: pid,
            product_name: row.product_name,
            sku: row.sku,
            quantity: qty,
            unit_reward_points: unit,
            line_total: unit * qty,
            tier: null,
            source: "base" as const,
          };
        });
        setTierBreakdown(breakdown);
      }
      setLoading(false);
    })();
  }, [id]);


  // 付款成功後：自動觸發年費 VIP 升級 hook（冪等；非年費規則不影響流程）
  useEffect(() => {
    if (!order || upgradeTriggered.current) return;
    if (order.payment_status !== "paid") return;
    upgradeTriggered.current = true;
    (async () => {
      try {
        const res: any = await processOrderAnnualFeeUpgrade({ data: { orderId: id } });
        try {
          const r2: any = await processOrderVipPackageUpgrade({ data: { orderId: id } });
          if (r2?.ok) {
            const applied2 = (r2.results ?? []).filter((x: any) => x?.applied);
            if (applied2.length > 0) {
              const tier = applied2.find((x: any) => x.upgraded)?.new_tier;
              const pts = applied2.reduce((s: number, x: any) => s + Number(x.granted_bonus_points ?? 0), 0);
              toast.success(`VIP 升級套組已生效${tier ? `（${tier} 級）` : ""}${pts > 0 ? `；已發放贈點 ${pts}` : ""}`);
            }
          }
        } catch (e) { console.error("[vip-package-upgrade] hook failed", e); }
        if (!res?.ok) return; // 不符合規則 → 靜默不影響原流程
        const results = (res.results ?? []) as any[];
        const applied = results.filter((r) => r.applied);
        const skipped = results.filter((r) => r.skipped === "already_processed");
        if (applied.length > 0) {
          const pts = applied.reduce((s, r) => s + Number(r.granted_reward_points ?? 0), 0);
          const hasGift = applied.some((r) => r.gift_product_id);
          toast.success(
            `已完成 VIP 升級${pts > 0 ? `；已發放獎勵點 ${pts}` : ""}${hasGift ? "；贈品將由客服確認出貨" : ""}`,
          );
        } else if (skipped.length > 0) {
          toast.info("VIP 升級已完成，未重複處理");
        }
      } catch (err) {
        // hook 失敗不可影響訂單狀態；記錄並提示客服
        console.error("[annual-fee-upgrade] hook failed", err);
        toast.warning("訂單付款成功，但 VIP 升級處理發生問題，請聯絡客服協助確認。");
      }
    })();
  }, [order, id]);

  // 回填：已付款但尚未產生獎勵點紀錄時，補呼叫伺服器端 applyOrderPoints（冪等）
  useEffect(() => {
    if (!order || rewardBackfillTriggered.current) return;
    if (order.payment_status !== "paid") return;
    if (rewardTx.length > 0) return;
    rewardBackfillTriggered.current = true;
    (async () => {
      try {
        await applyOrderPoints({ data: { orderId: id, shopping_redeem: 0, reward_redeem: 0, discount_redeem: 0 } });
        const { data: rt } = await supabase
          .from("point_transactions")
          .select("amount, source, note")
          .eq("reference_id", id)
          .in("source", ["order_earn", "order_earn_referrer"])
          .eq("point_type", "reward");
        setRewardTx((rt ?? []) as any[]);
      } catch (err) {
        console.error("[order-detail] reward backfill failed", err);
      }
    })();
  }, [order, id, rewardTx.length]);



  if (loading) return <Skeleton className="h-96" />;
  if (!order) {
    return (
      <Card><CardContent className="py-16 text-center text-muted-foreground">
        找不到此訂單
        <div className="mt-4"><Button asChild variant="outline"><Link to="/shop/account/orders">返回訂單列表</Link></Button></div>
      </CardContent></Card>
    );
  }

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/shop/account/orders"><ArrowLeft className="h-4 w-4 mr-1" />返回訂單列表</Link>
      </Button>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="h-4 w-4 text-primary" />{order.order_no}
            </CardTitle>
            <div className="flex gap-2">
              <Badge variant="outline">{ORDER_STATUS_LABELS[order.order_status] ?? order.order_status}</Badge>
              <Badge variant="outline">{PAYMENT_STATUS_LABELS[order.payment_status] ?? order.payment_status}</Badge>
              <Badge variant="outline">{SHIPPING_STATUS_LABELS[order.shipping_status] ?? order.shipping_status}</Badge>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">建立時間：{new Date(order.created_at).toLocaleString()}</p>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <div className="text-sm font-medium mb-3">訂購商品</div>
            <div className="space-y-2">
              {items.map((it) => (
                <div key={it.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                  <div className="h-14 w-14 rounded-md bg-muted overflow-hidden shrink-0">
                    {it.image && <img src={it.image} alt={it.product_name} className="h-full w-full object-cover" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{it.product_name}</div>
                    <div className="text-xs text-muted-foreground">{it.sku} · NT$ {Number(it.unit_price).toLocaleString()} × {it.quantity}</div>
                  </div>
                  <div className="font-semibold tabular-nums text-sm">NT$ {Number(it.subtotal).toLocaleString()}</div>
                </div>
              ))}
              {items.length === 0 && <div className="text-sm text-muted-foreground text-center py-4">無訂購項目</div>}
            </div>
          </div>

          <Separator />

          <div className="grid sm:grid-cols-2 gap-6 text-sm">
            <div className="rounded-lg border border-border/60 bg-muted/20 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5 text-primary" />
                  收件資訊（下單當下快照）
                </div>
                <Badge variant="secondary" className="gap-1 text-[10px] h-5">
                  <Lock className="h-3 w-3" />已鎖定
                </Badge>
              </div>
              <div className="space-y-1.5">
                <div className="font-medium">{order.receiver_name}</div>
                <div className="text-sm text-muted-foreground">{order.receiver_phone}</div>
                <div className="text-sm text-muted-foreground leading-relaxed">{order.shipping_address}</div>
                <a
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.shipping_address)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline mt-1"
                >
                  <MapPin className="h-3 w-3" />
                  在地圖查看
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              <p className="mt-3 pt-3 border-t border-border/40 text-[11px] text-muted-foreground/80">
                此地址為下單時所使用的收件資訊，之後變更預設地址不會影響本訂單。
              </p>
            </div>
            <div>
              <div className="text-xs text-muted-foreground mb-2">金額明細</div>
              <div className="space-y-1">
                <div className="flex justify-between"><span className="text-muted-foreground">小計</span><span className="tabular-nums">NT$ {Number(order.subtotal).toLocaleString()}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">運費</span><span className="tabular-nums">NT$ {Number(order.shipping_fee).toLocaleString()}</span></div>
                {Number(order.discount_amount) > 0 && (
                  <div className="flex justify-between text-emerald-400"><span>折扣 {order.coupon_code ? `(${order.coupon_code})` : ""}</span><span className="tabular-nums">- NT$ {Number(order.discount_amount).toLocaleString()}</span></div>
                )}
                <Separator className="my-2" />
                <div className="flex justify-between font-semibold text-base"><span>總計</span><span className="tabular-nums text-primary">NT$ {Number(order.total_amount).toLocaleString()}</span></div>
                {(() => {
                  const notice = resolveRewardNotice(rewardTx as RewardTxRow[]);
                  if (!notice) return null;
                  if (notice.kind === "earn") {
                    return (
                      <div className="mt-2 flex justify-between items-center rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-500">
                        <span className="flex items-center gap-1.5"><Gift className="h-4 w-4" />本次發放獎勵點</span>
                        <span className="tabular-nums font-semibold">+ {notice.points.toLocaleString()} 點</span>
                      </div>
                    );
                  }
                  return (
                    <div className="mt-2 rounded-md bg-muted/40 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
                      <div className="font-medium text-foreground/80 mb-0.5 flex items-center gap-1.5"><Gift className="h-3.5 w-3.5" />本次發放獎勵點</div>
                      {notice.note}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>


          {order.notes && (
            <>
              <Separator />
              <div>
                <div className="text-xs text-muted-foreground mb-1">訂單備註</div>
                <div className="text-sm">{order.notes}</div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
