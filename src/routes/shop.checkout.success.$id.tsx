import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { CheckCircle2, Loader2, Wallet, Gift, Percent } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/shop/checkout/success/$id")({
  component: CheckoutSuccessPage,
  head: () => ({ meta: [{ title: "訂單成立 — 源晶商城" }, { name: "robots", content: "noindex" }] }),
});

interface OrderSummary {
  id: string;
  order_no: string;
  subtotal: number;
  shipping_fee: number;
  discount_amount: number;
  total_amount: number;
  payment_status: string;
}

interface PointPayment {
  point_type: "discount" | "shopping" | "reward";
  points_used: number;
  amount_offset: number;
}

const POINT_LABEL: Record<PointPayment["point_type"], { label: string; icon: any }> = {
  discount: { label: "折扣點折抵", icon: Percent },
  shopping: { label: "購物點折抵", icon: Wallet },
  reward: { label: "獎勵點折抵", icon: Gift },
};

function CheckoutSuccessPage() {
  const { id } = Route.useParams();
  const [order, setOrder] = useState<OrderSummary | null>(null);
  const [points, setPoints] = useState<PointPayment[]>([]);
  const [rewardTx, setRewardTx] = useState<Array<{ amount: number; source: string; note: string | null }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [{ data: o }, { data: p }, { data: rt }] = await Promise.all([
        supabase
          .from("sales_orders")
          .select("id, order_no, subtotal, shipping_fee, discount_amount, total_amount, payment_status")
          .eq("id", id)
          .maybeSingle(),
        supabase
          .from("order_point_payments" as any)
          .select("point_type, points_used, amount_offset")
          .eq("sales_order_id", id),
        supabase
          .from("point_transactions")
          .select("amount, source, note")
          .eq("reference_id", id)
          .in("source", ["order_earn", "order_earn_referrer"])
          .eq("point_type", "reward"),
      ]);
      if (cancelled) return;
      setOrder((o as any) ?? null);
      setPoints(((p as any) ?? []) as PointPayment[]);
      setRewardTx(((rt as any) ?? []) as any[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [id]);

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto p-6 flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!order) {
    return (
      <div className="max-w-2xl mx-auto p-6 text-center space-y-4">
        <p className="text-muted-foreground">找不到此訂單</p>
        <Button asChild variant="outline"><Link to="/shop">返回商城</Link></Button>
      </div>
    );
  }

  const pointTotal = points.reduce((s, p) => s + Number(p.amount_offset || 0), 0);

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-4">
      <Card>
        <CardHeader className="items-center text-center space-y-2 pb-2">
          <div className="h-14 w-14 rounded-full bg-green-100 flex items-center justify-center">
            <CheckCircle2 className="h-8 w-8 text-green-600" />
          </div>
          <CardTitle className="text-xl">訂單建立成功</CardTitle>
          <p className="text-sm text-muted-foreground">訂單編號 {order.order_no}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg border p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">結算小計</span>
              <span className="tabular-nums">NT$ {Number(order.subtotal).toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">運費</span>
              <span className="tabular-nums">
                {Number(order.shipping_fee) === 0 ? "免運" : `NT$ ${Number(order.shipping_fee).toLocaleString()}`}
              </span>
            </div>

            {points.length > 0 && (
              <>
                <Separator className="my-2" />
                <div className="text-xs text-muted-foreground">點數使用明細</div>
                {points.map((p) => {
                  const { label, icon: Icon } = POINT_LABEL[p.point_type];
                  return (
                    <div key={p.point_type} className="flex justify-between items-center">
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <Icon className="h-3.5 w-3.5" />
                        {label}
                        <span className="text-xs">({Number(p.points_used).toLocaleString()} 點)</span>
                      </span>
                      <span className="tabular-nums text-green-600">
                        - NT$ {Number(p.amount_offset).toLocaleString()}
                      </span>
                    </div>
                  );
                })}
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">點數折抵合計</span>
                  <span className="tabular-nums text-green-600">- NT$ {pointTotal.toLocaleString()}</span>
                </div>
              </>
            )}

            <Separator className="my-2" />
            <div className="flex justify-between items-center">
              <span className="font-semibold">最終應付金額</span>
              <span className="text-xl font-bold text-primary tabular-nums">
                NT$ {Number(order.total_amount - pointTotal).toLocaleString()}
              </span>
            </div>
            {order.payment_status === "paid" && (
              <div className="text-xs text-green-600 text-right">已完成付款</div>
            )}
            {(() => {
              const earn = rewardTx.find((r) => r.source === "order_earn");
              const ref = rewardTx.find((r) => r.source === "order_earn_referrer");
              const earnPts = Number(earn?.amount ?? 0);
              if (earnPts > 0) {
                return (
                  <div className="mt-2 flex justify-between items-center rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-600">
                    <span className="flex items-center gap-1.5"><Gift className="h-4 w-4" />本次發放獎勵點</span>
                    <span className="tabular-nums font-semibold">+ {earnPts.toLocaleString()} 點</span>
                  </div>
                );
              }
              if (ref) {
                return (
                  <div className="mt-2 rounded-md bg-muted/40 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
                    {ref.note ?? "本次獎勵點依復購位階制度發放至推薦人獎勵點錢包（依營業分紅比例與 VIP 升級分紅上限）。"}
                  </div>
                );
              }
              return null;
            })()}

          <div className="flex flex-col sm:flex-row gap-2">
            <Button asChild className="flex-1">
              <Link to="/shop/account/orders/$id" params={{ id: order.id }}>查看訂單詳情</Link>
            </Button>
            <Button asChild variant="outline" className="flex-1">
              <Link to="/shop">繼續購物</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
