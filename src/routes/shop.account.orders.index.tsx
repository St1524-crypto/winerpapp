import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { ORDER_STATUS_LABELS, PAYMENT_STATUS_LABELS, type SalesOrder } from "@/types/shop";
import { ChevronRight, ShoppingBag } from "lucide-react";

export const Route = createFileRoute("/shop/account/orders/")({ component: OrdersPage });

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  paid: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  picking: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  shipped: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  completed: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  cancelled: "bg-slate-500/15 text-slate-400 border-slate-500/30",
};

function OrdersPage() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("all");

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase.from("sales_orders").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
      setOrders((data ?? []) as SalesOrder[]);
      setLoading(false);
    })();
  }, [user]);

  const filtered = tab === "all" ? orders : orders.filter((o) => o.order_status === tab);

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">我的訂單</CardTitle></CardHeader>
      <CardContent>
        <Tabs value={tab} onValueChange={setTab} className="mb-4">
          <TabsList>
            <TabsTrigger value="all">全部</TabsTrigger>
            <TabsTrigger value="pending">待付款</TabsTrigger>
            <TabsTrigger value="paid">已付款</TabsTrigger>
            <TabsTrigger value="shipped">已出貨</TabsTrigger>
            <TabsTrigger value="completed">已完成</TabsTrigger>
          </TabsList>
        </Tabs>

        {loading ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <ShoppingBag className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">此狀態下沒有訂單</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((o) => (
              <Link
                key={o.id}
                to="/shop/account/orders/$id"
                params={{ id: o.id }}
                className="flex items-center justify-between p-4 rounded-lg border border-border/60 hover:border-primary/50 hover:bg-accent/40 transition group"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-sm">{o.order_no}</span>
                    <Badge variant="outline" className={STATUS_STYLES[o.order_status] ?? ""}>
                      {ORDER_STATUS_LABELS[o.order_status] ?? o.order_status}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(o.created_at).toLocaleString()} · {PAYMENT_STATUS_LABELS[o.payment_status] ?? o.payment_status}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <div className="font-semibold tabular-nums">NT$ {Number(o.total_amount).toLocaleString()}</div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
