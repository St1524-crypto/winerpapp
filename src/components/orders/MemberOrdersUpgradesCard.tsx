import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Crown, ShoppingBag } from "lucide-react";

type Props = {
  memberId?: string | null;
  customerPhone?: string | null;
  customerEmail?: string | null;
  currentOrderId?: string | null;
  onOpenOrder?: (orderId: string) => void;
};

const ORDER_LABEL: Record<string, string> = {
  pending: "待處理",
  processing: "處理中",
  completed: "已完成",
  cancelled: "已取消",
};
const PAY_LABEL: Record<string, string> = {
  pending: "未付款",
  partial: "部分付款",
  paid: "已付款",
  refunded: "已退款",
};

function fmt(n: unknown) {
  return `NT$ ${Number(n ?? 0).toLocaleString()}`;
}

export function MemberOrdersUpgradesCard({
  memberId, customerPhone, customerEmail, currentOrderId, onOpenOrder,
}: Props) {
  const q = useQuery({
    queryKey: ["member-orders-upgrades", memberId ?? null, customerPhone ?? null, customerEmail ?? null],
    enabled: !!(memberId || customerPhone || customerEmail),
    queryFn: async () => {
      // 訂單：以會員 ID 為主，另外比對電話 / Email（含未綁定帳號的訂單）
      let ordersQuery = supabase
        .from("sales_orders")
        .select("id,order_no,total_amount,order_status,payment_status,shipping_status,created_at")
        .order("created_at", { ascending: false })
        .limit(100);
      const filters: string[] = [];
      if (memberId) filters.push(`user_id.eq.${memberId}`);
      if (customerPhone) filters.push(`customer_phone.eq.${customerPhone}`);
      if (customerEmail) filters.push(`customer_email.eq.${customerEmail}`);
      ordersQuery = ordersQuery.or(filters.join(","));
      const [ordersRes, logsRes, upOrdersRes, pkgRes] = await Promise.all([
        ordersQuery,
        memberId
          ? supabase
              .from("vip_package_upgrade_logs")
              .select("id,package_id,sales_order_id,tier_code,previous_tier,new_tier,bonus_points,upgraded,status,notes,created_at")
              .eq("user_id", memberId)
              .order("created_at", { ascending: false })
          : Promise.resolve({ data: [] as any[] }),
        memberId
          ? supabase
              .from("vip_upgrade_orders")
              .select("id,package_id,tier_code,amount,bonus_points,payment_status,notes,created_at")
              .eq("user_id", memberId)
              .order("created_at", { ascending: false })
          : Promise.resolve({ data: [] as any[] }),
        supabase.from("vip_upgrade_packages").select("id,name,tier_code,price"),
      ]);
      const pkgMap = new Map<string, any>(((pkgRes as any).data ?? []).map((p: any) => [p.id, p]));
      return {
        orders: ((ordersRes as any).data ?? []) as any[],
        logs: (((logsRes as any).data ?? []) as any[]).map((l) => ({ ...l, pkg: pkgMap.get(l.package_id) })),
        upgradeOrders: (((upOrdersRes as any).data ?? []) as any[]).map((o) => ({ ...o, pkg: pkgMap.get(o.package_id) })),
      };
    },
  });

  const data = q.data;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <ShoppingBag className="h-4 w-4" />
          此會員所有訂單與升級套組
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {q.isLoading ? (
          <div className="text-muted-foreground">載入中...</div>
        ) : !data ? (
          <div className="text-muted-foreground">無法識別會員</div>
        ) : (
          <>
            <div className="space-y-1">
              <div className="text-xs text-muted-foreground">訂單（{data.orders.length}）</div>
              {data.orders.length === 0 ? (
                <div className="text-muted-foreground text-xs">尚無訂單</div>
              ) : (
                <ul className="divide-y rounded-md border">
                  {data.orders.map((o) => (
                    <li
                      key={o.id}
                      className={`flex items-center justify-between gap-2 px-3 py-2 ${
                        o.id === currentOrderId ? "bg-muted/60" : "hover:bg-muted/40 cursor-pointer"
                      }`}
                      onClick={() => o.id !== currentOrderId && onOpenOrder?.(o.id)}
                    >
                      <div className="min-w-0">
                        <div className="font-medium truncate">{o.order_no}</div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(o.created_at).toLocaleString()}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="outline">{ORDER_LABEL[o.order_status] ?? o.order_status}</Badge>
                        <Badge variant="outline">{PAY_LABEL[o.payment_status] ?? o.payment_status}</Badge>
                        <span className="font-semibold tabular-nums">{fmt(o.total_amount)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="space-y-1">
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <Crown className="h-3.5 w-3.5" />
                升級套組紀錄（{data.logs.length + data.upgradeOrders.length}）
              </div>
              {data.logs.length + data.upgradeOrders.length === 0 ? (
                <div className="text-muted-foreground text-xs">尚無升級套組紀錄</div>
              ) : (
                <ul className="divide-y rounded-md border">
                  {data.logs.map((l) => (
                    <li key={l.id} className="px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium truncate">
                          [{l.tier_code}] {l.pkg?.name ?? "（套組已刪除）"}
                        </span>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant={l.upgraded ? "default" : "secondary"}>
                            {l.upgraded ? "已升級" : "已套用（未變更階級）"}
                          </Badge>
                          {l.pkg?.price != null && (
                            <span className="tabular-nums">{fmt(l.pkg.price)}</span>
                          )}
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(l.created_at).toLocaleString()}
                        {" · "}
                        {(l.previous_tier ?? "—")} → {(l.new_tier ?? "—")}
                        {" · 贈點 "}
                        {Number(l.bonus_points ?? 0).toLocaleString()}
                        {l.sales_order_id ? " · 來源訂單已連結" : ""}
                      </div>
                    </li>
                  ))}
                  {data.upgradeOrders.map((o) => (
                    <li key={o.id} className="px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium truncate">
                          [{o.tier_code}] {o.pkg?.name ?? "升級單"}
                        </span>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant={o.payment_status === "paid" ? "default" : "secondary"}>
                            {PAY_LABEL[o.payment_status] ?? o.payment_status}
                          </Badge>
                          <span className="tabular-nums">{fmt(o.amount)}</span>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(o.created_at).toLocaleString()} · 贈點{" "}
                        {Number(o.bonus_points ?? 0).toLocaleString()}
                        {o.notes ? ` · ${o.notes}` : ""}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
