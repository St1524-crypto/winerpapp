import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Package } from "lucide-react";
import { ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS, SHIPPING_STATUS_LABELS, type SalesOrder, type SalesOrderItem } from "@/types/shop";

export const Route = createFileRoute("/shop/account/orders/$id")({ component: OrderDetail });

function OrderDetail() {
  const { id } = Route.useParams();
  const [order, setOrder] = useState<SalesOrder | null>(null);
  const [items, setItems] = useState<SalesOrderItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [{ data: o }, { data: it }] = await Promise.all([
        supabase.from("sales_orders").select("*").eq("id", id).maybeSingle(),
        supabase.from("sales_order_items").select("*").eq("sales_order_id", id),
      ]);
      setOrder(o as SalesOrder | null);
      setItems((it ?? []) as SalesOrderItem[]);
      setLoading(false);
    })();
  }, [id]);

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
            <div>
              <div className="text-xs text-muted-foreground mb-2">收件資訊</div>
              <div className="space-y-1">
                <div>{order.receiver_name}</div>
                <div className="text-muted-foreground">{order.receiver_phone}</div>
                <div className="text-muted-foreground">{order.shipping_address}</div>
              </div>
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
