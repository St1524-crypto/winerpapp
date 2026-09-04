import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ShoppingBag, MapPin, Wallet, Package, Info, ListChecks } from "lucide-react";
import { ORDER_STATUS_LABELS } from "@/types/shop";
import { getMyDividendStatus } from "@/lib/member-dividend-status.functions";

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

  const dividendFn = useServerFn(getMyDividendStatus);
  const { data: dividend } = useQuery({
    queryKey: ["my-dividend-status", user?.id],
    queryFn: () => dividendFn(),
    enabled: !!user,
  });
  const pools = (dividend as any)?.pools ?? [];

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

      {pools.length > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          {pools.map((p: any) => (
            <Card key={p.kind}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between gap-2">
                  <span>{p.label}</span>
                  {p.status === "active" ? (
                    <Badge>{p.statusLabel}</Badge>
                  ) : (
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button size="sm" variant="destructive" className="h-7 gap-1">
                          停止分紅 <Info className="h-3.5 w-3.5" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-72 text-sm">
                        <div className="font-medium mb-1">停止分紅原因</div>
                        {p.reasons.length === 0 ? (
                          <p className="text-muted-foreground">未達成續領條件</p>
                        ) : (
                          <ul className="list-disc pl-4 space-y-1 text-muted-foreground">
                            {p.reasons.map((r: string, i: number) => <li key={i}>{r}</li>)}
                          </ul>
                        )}
                      </PopoverContent>
                    </Popover>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">領獎上限</span>
                  <span className="tabular-nums">{p.cap > 0 ? p.cap.toLocaleString() : "不適用"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">目前總收入</span>
                  <span className="tabular-nums">{Number(p.totalEarnings).toLocaleString()}</span>
                </div>
                {p.cap > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">尚可領取</span>
                    <span className={`tabular-nums ${p.capReached ? "text-destructive" : ""}`}>
                      {p.capReached ? `已領完上限 ${p.cap.toLocaleString()}` : Number(p.remaining ?? 0).toLocaleString()}
                    </span>
                  </div>
                )}
                {p.startsOn && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">合格期間</span>
                    <span className="tabular-nums text-xs">{p.startsOn} ~ {p.endsOn}</span>
                  </div>
                )}
                {p.task && (
                  <div className="rounded-md border p-2 mt-2">
                    <div className="flex items-center gap-1.5 font-medium">
                      <ListChecks className="h-4 w-4 text-primary" /> 續領任務
                    </div>
                    <p className="mt-1">{p.task.text}</p>
                    <p className="text-xs text-muted-foreground mt-1">{p.task.progress}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}



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
