import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Crown } from "lucide-react";
import { getMyVipUpgradeOrders } from "@/lib/vip-tiers.functions";

export const Route = createFileRoute("/shop/account/vip")({
  component: MyVipPage,
  head: () => ({ meta: [{ title: "我的 VIP — 源晶商城" }] }),
});

function MyVipPage() {
  const fn = useServerFn(getMyVipUpgradeOrders);
  const [state, setState] = useState<any>({ orders: [], profile: null });

  useEffect(() => { fn().then(setState).catch(() => {}); }, []);

  const p = state.profile;
  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold flex items-center gap-2"><Crown className="h-6 w-6" />我的 VIP</h1>

      <Card>
        <CardHeader><CardTitle>目前狀態</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div>VIP 階級：<Badge>{p?.vip_tier ?? "未升級"}</Badge></div>
          <div>VIP 狀態：{p?.is_vip ? "有效" : "未啟用"}</div>
          {p?.vip_expires_at && <div>到期日：{new Date(p.vip_expires_at).toLocaleDateString()}</div>}
          <div className="pt-2">
            <Link to="/shop/vip" className="text-primary underline text-sm">前往升級套組</Link>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>升級紀錄</CardTitle></CardHeader>
        <CardContent>
          {state.orders.length === 0 ? (
            <p className="text-sm text-muted-foreground">尚無升級紀錄</p>
          ) : (
            <div className="space-y-2">
              {state.orders.map((o: any) => (
                <div key={o.id} className="flex items-center justify-between border-b pb-2 text-sm">
                  <div>
                    <div className="font-medium">{o.previous_tier ?? "—"} → {o.new_tier ?? "—"} ({o.tier_code})</div>
                    <div className="text-muted-foreground">{new Date(o.created_at).toLocaleString()}　{o.notes}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold">NT$ {Number(o.amount).toLocaleString()}</div>
                    <Badge variant={o.payment_status === "paid" ? "default" : "secondary"}>{o.payment_status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
