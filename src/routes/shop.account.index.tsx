import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShoppingBag, MapPin, Wallet, Package } from "lucide-react";
import { ORDER_STATUS_LABELS } from "@/types/shop";

export const Route = createFileRoute("/shop/account/")({ component: Overview });

function Overview() {
  const { user } = useAuth();
  const [stats, setStats] = useState({ orders: 0, pending: 0, spent: 0, addresses: 0 });
  const [recent, setRecent] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ data: orders }, { count: addrCount }] = await Promise.all([
        supabase.from("sales_orders").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
        supabase.from("customer_addresses").select("id", { count: "exact", head: true }).eq("user_id", user.id),
      ]);
      const list = orders ?? [];
      setStats({
        orders: list.length,
        pending: list.filter((o: any) => ["pending", "paid", "picking"].includes(o.order_status)).length,
        spent: list.filter((o: any) => o.payment_status === "paid").reduce((s: number, o: any) => s + Number(o.total_amount), 0),
        addresses: addrCount ?? 0,
      });
      setRecent(list.slice(0, 5));
    })();
  }, [user]);

  const cards = [
    { label: "總訂單", value: stats.orders, icon: ShoppingBag, color: "text-blue-400" },
    { label: "處理中", value: stats.pending, icon: Package, color: "text-amber-400" },
    { label: "累計消費", value: `NT$ ${stats.spent.toLocaleString()}`, icon: Wallet, color: "text-emerald-400" },
    { label: "收件地址", value: stats.addresses, icon: MapPin, color: "text-purple-400" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardContent className="pt-6">
              <c.icon className={`h-5 w-5 mb-3 ${c.color}`} />
              <div className="text-2xl font-bold tabular-nums">{c.value}</div>
              <div className="text-xs text-muted-foreground mt-1">{c.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">最近訂單</CardTitle>
          <Link to="/shop/account/orders" className="text-xs text-primary hover:underline">查看全部</Link>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              尚無訂單 — <Link to="/shop/products" search={{ q: "", cat: "", sort: "new", section: "" }} className="text-primary hover:underline">前往購物</Link>
            </div>
          ) : (
            <div className="space-y-2">
              {recent.map((o) => (
                <Link
                  key={o.id}
                  to="/shop/account/orders/$id"
                  params={{ id: o.id }}
                  className="flex items-center justify-between p-3 rounded-lg border border-border/60 hover:bg-accent/50 transition"
                >
                  <div>
                    <div className="font-medium text-sm">{o.order_no}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{new Date(o.created_at).toLocaleString()}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="outline">{ORDER_STATUS_LABELS[o.order_status] ?? o.order_status}</Badge>
                    <div className="font-semibold tabular-nums text-sm">NT$ {Number(o.total_amount).toLocaleString()}</div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
