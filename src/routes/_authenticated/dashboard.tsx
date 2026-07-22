import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/StatCard";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ShoppingCart, DollarSign, Boxes, Users, FileDown, Package, AlertTriangle, Flame, Sparkles, Truck, PackageCheck, Factory, TrendingUp } from "lucide-react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import { exportPdfReport } from "@/lib/pdf-report";
import { useBranding } from "@/hooks/use-branding";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompany } from "@/hooks/use-current-company";

export const Route = createFileRoute("/_authenticated/dashboard")({ component: Dashboard });

const ORDER_STATUS_LABEL: Record<string, string> = {
  pending: "待付款",
  paid: "已付款",
  picking: "處理中",
  shipped: "已出貨",
  completed: "已完成",
  cancelled: "已取消",
  refunded: "已退款",
};

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  "已完成": "default",
  "處理中": "secondary",
  "已付款": "secondary",
  "已出貨": "outline",
  "待付款": "secondary",
  "已取消": "destructive",
  "已退款": "destructive",
};

interface RecentOrder { no: string; customer: string; amount: string; status: string; }

function Dashboard() {
  const { logoUrl } = useBranding();
  const { currentCompanyId } = useCurrentCompany();
  const [stats, setStats] = useState({ total: 0, low: 0, featured: 0, today: 0 });
  const [proc, setProc] = useState({ todayInAmount: 0, pendingPO: 0, vendorCount: 0, lowCount: 0 });
  const [purchaseTrend, setPurchaseTrend] = useState<{ day: string; amount: number }[]>([]);
  const [revenuePeriod, setRevenuePeriod] = useState<"today" | "week" | "month">("today");
  const [revenue, setRevenue] = useState<{ current: number; delta: number | undefined }>({ current: 0, delta: undefined });
  const [topStats, setTopStats] = useState<{ ordersToday: number; ordersDelta: number | undefined; stockTotal: number; memberTotal: number; memberDelta: number | undefined }>({
    ordersToday: 0, ordersDelta: undefined, stockTotal: 0, memberTotal: 0, memberDelta: undefined,
  });
  const [salesTrend, setSalesTrend] = useState<{ day: string; sales: number; orders: number }[]>([]);
  const [categoryData, setCategoryData] = useState<{ name: string; value: number }[]>([]);
  const [recentOrders, setRecentOrders] = useState<RecentOrder[]>([]);

  useEffect(() => {
    (async () => {
      const sb: any = supabase;
      const since = new Date(); since.setHours(0, 0, 0, 0);
      const yesterday = new Date(since); yesterday.setDate(yesterday.getDate() - 1);
      const since7 = new Date(since); since7.setDate(since7.getDate() - 6);
      const since30 = new Date(since); since30.setDate(since30.getDate() - 29);
      const prev30 = new Date(since30); prev30.setDate(prev30.getDate() - 30);

      const [{ count: total }, { data: all }, { count: featured }, { count: today }] = await Promise.all([
        sb.from("products").select("id", { count: "exact", head: true }),
        sb.from("products").select("stock,safe_stock"),
        sb.from("products").select("id", { count: "exact", head: true }).eq("featured", true),
        sb.from("products").select("id", { count: "exact", head: true }).gte("created_at", since.toISOString()),
      ]);
      const low = (all ?? []).filter((p: any) => p.stock <= p.safe_stock).length;
      const stockTotal = (all ?? []).reduce((s: number, p: any) => s + (Number(p.stock) || 0), 0);
      setStats({ total: total ?? 0, low, featured: featured ?? 0, today: today ?? 0 });

      // 採購
      const [, { count: pendingPO }, { count: vendorCount }] = await Promise.all([
        sb.from("goods_receiving").select("purchase_order_id, received_date").gte("received_date", since.toISOString()),
        sb.from("purchase_orders").select("id", { count: "exact", head: true }).in("status", ["submitted", "confirmed", "partial"]),
        sb.from("vendors").select("id", { count: "exact", head: true }).eq("status", "active"),
      ]);
      const txQuery = sb.from("inventory_transactions").select("quantity, product_id").eq("type", "purchase_in").gte("created_at", since.toISOString());
      if (currentCompanyId) txQuery.eq("company_id", currentCompanyId);
      const { data: txToday } = await txQuery;
      let todayAmt = 0;
      if (txToday && txToday.length) {
        const ids = Array.from(new Set(txToday.map((x: any) => x.product_id).filter(Boolean))) as string[];
        const { data: prices } = await sb.rpc("get_product_costs", { _ids: ids });
        const pm: Record<string, number> = {};
        (prices ?? []).forEach((p: any) => pm[p.id] = Number(p.cost_price) || 0);
        todayAmt = txToday.reduce((s: number, t: any) => s + (pm[t.product_id] ?? 0) * t.quantity, 0);
      }
      setProc({ todayInAmount: todayAmt, pendingPO: pendingPO ?? 0, vendorCount: vendorCount ?? 0, lowCount: low });

      // 採購趨勢
      const { data: pos } = await sb.from("purchase_orders").select("total_amount, created_at").gte("created_at", since7.toISOString());
      const buckets: Record<string, number> = {};
      for (let i = 0; i < 7; i++) { const d = new Date(since7); d.setDate(d.getDate() + i); buckets[d.toISOString().slice(0, 10)] = 0; }
      (pos ?? []).forEach((p: any) => {
        const k = new Date(p.created_at).toISOString().slice(0, 10);
        if (k in buckets) buckets[k] += Number(p.total_amount) || 0;
      });
      setPurchaseTrend(Object.entries(buckets).map(([k, v]) => ({ day: k.slice(5), amount: v })));

      // 頂部統計：今日訂單、會員總數
      const orderCountQ = (from: string, to?: string) => {
        let q = sb.from("sales_orders").select("id", { count: "exact", head: true })
          .gte("created_at", from).neq("order_status", "cancelled");
        if (to) q = q.lt("created_at", to);
        if (currentCompanyId) q = q.eq("company_id", currentCompanyId);
        return q;
      };
      const [{ count: ordersTodayC }, { count: ordersYestC }, { count: memberTotal }, { count: memberPrev }] = await Promise.all([
        orderCountQ(since.toISOString()),
        orderCountQ(yesterday.toISOString(), since.toISOString()),
        sb.from("profiles").select("id", { count: "exact", head: true }),
        sb.from("profiles").select("id", { count: "exact", head: true }).lt("created_at", since30.toISOString()),
      ]);
      const ordersToday = ordersTodayC ?? 0;
      const ordersYest = ordersYestC ?? 0;
      const ordersDelta = ordersYest > 0 ? Number((((ordersToday - ordersYest) / ordersYest) * 100).toFixed(1)) : undefined;
      const memNow = memberTotal ?? 0;
      const memPrev = memberPrev ?? 0;
      const memberDelta = memPrev > 0 ? Number((((memNow - memPrev) / memPrev) * 100).toFixed(1)) : undefined;
      setTopStats({ ordersToday, ordersDelta, stockTotal, memberTotal: memNow, memberDelta });

      // 銷售趨勢（近 7 日）
      const trendQ = sb.from("sales_orders").select("total_amount, created_at, order_status, payment_status").gte("created_at", since7.toISOString());
      if (currentCompanyId) trendQ.eq("company_id", currentCompanyId);
      const { data: trendRows } = await trendQ;
      const trendBuckets: Record<string, { sales: number; orders: number }> = {};
      const dayLabels = ["週日", "週一", "週二", "週三", "週四", "週五", "週六"];
      const trendKeys: string[] = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(since7); d.setDate(d.getDate() + i);
        const k = d.toISOString().slice(0, 10);
        trendKeys.push(k);
        trendBuckets[k] = { sales: 0, orders: 0 };
      }
      (trendRows ?? []).forEach((o: any) => {
        if (o.order_status === "cancelled" || o.payment_status === "refunded") return;
        const k = new Date(o.created_at).toISOString().slice(0, 10);
        if (k in trendBuckets) {
          trendBuckets[k].sales += Number(o.total_amount) || 0;
          trendBuckets[k].orders += 1;
        }
      });
      setSalesTrend(trendKeys.map((k) => ({
        day: dayLabels[new Date(k).getDay()],
        sales: trendBuckets[k].sales,
        orders: trendBuckets[k].orders,
      })));

      // 分類訂單分析（近 30 日 order items）
      const itemsQ = sb.from("sales_order_items").select("quantity, product_id, created_at").gte("created_at", since30.toISOString());
      if (currentCompanyId) itemsQ.eq("company_id", currentCompanyId);
      const { data: items } = await itemsQ;
      if (items && items.length) {
        const pids = Array.from(new Set(items.map((i: any) => i.product_id).filter(Boolean))) as string[];
        const { data: prods } = await sb.from("products").select("id, category_id, category").in("id", pids);
        const catIds = Array.from(new Set((prods ?? []).map((p: any) => p.category_id).filter(Boolean))) as string[];
        const { data: cats } = catIds.length
          ? await sb.from("categories").select("id, name").in("id", catIds)
          : { data: [] as any[] };
        const catName: Record<string, string> = {};
        (cats ?? []).forEach((c: any) => catName[c.id] = c.name);
        const prodCat: Record<string, string> = {};
        (prods ?? []).forEach((p: any) => {
          prodCat[p.id] = (p.category_id && catName[p.category_id]) || p.category || "未分類";
        });
        const counts: Record<string, number> = {};
        items.forEach((it: any) => {
          const name = prodCat[it.product_id] || "未分類";
          counts[name] = (counts[name] || 0) + (Number(it.quantity) || 0);
        });
        setCategoryData(
          Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, value]) => ({ name, value }))
        );
      } else {
        setCategoryData([]);
      }

      // 最近訂單
      const recentQ = sb.from("sales_orders").select("order_no, customer_name, total_amount, order_status").order("created_at", { ascending: false }).limit(6);
      if (currentCompanyId) recentQ.eq("company_id", currentCompanyId);
      const { data: recentData } = await recentQ;
      setRecentOrders((recentData ?? []).map((o: any) => ({
        no: o.order_no,
        customer: o.customer_name ?? "—",
        amount: `NT$ ${Number(o.total_amount).toLocaleString()}`,
        status: ORDER_STATUS_LABEL[o.order_status] ?? o.order_status,
      })));

      // 期間營收
      const now = new Date();
      const startCurrent = new Date(now);
      const startPrevious = new Date(now);
      if (revenuePeriod === "today") {
        startCurrent.setHours(0, 0, 0, 0);
        startPrevious.setTime(startCurrent.getTime());
        startPrevious.setDate(startPrevious.getDate() - 1);
      } else if (revenuePeriod === "week") {
        startCurrent.setHours(0, 0, 0, 0);
        const dow = (startCurrent.getDay() + 6) % 7;
        startCurrent.setDate(startCurrent.getDate() - dow);
        startPrevious.setTime(startCurrent.getTime());
        startPrevious.setDate(startPrevious.getDate() - 7);
      } else {
        startCurrent.setDate(1);
        startCurrent.setHours(0, 0, 0, 0);
        startPrevious.setTime(startCurrent.getTime());
        startPrevious.setMonth(startPrevious.getMonth() - 1);
      }
      const soQuery = (from: string, to?: string) => {
        let q = sb.from("sales_orders").select("total_amount, order_status, payment_status, created_at").gte("created_at", from);
        if (to) q = q.lt("created_at", to);
        if (currentCompanyId) q = q.eq("company_id", currentCompanyId);
        return q;
      };
      const [{ data: soCurrent }, { data: soPrev }] = await Promise.all([
        soQuery(startCurrent.toISOString()),
        soQuery(startPrevious.toISOString(), startCurrent.toISOString()),
      ]);
      const sumRev = (rows: any[] | null | undefined) =>
        (rows ?? [])
          .filter((o) => o.order_status !== "cancelled" && o.payment_status !== "refunded")
          .reduce((s, o) => s + (Number(o.total_amount) || 0), 0);
      const currentRev = sumRev(soCurrent);
      const prevRev = sumRev(soPrev);
      const delta = prevRev > 0 ? Number((((currentRev - prevRev) / prevRev) * 100).toFixed(1)) : undefined;
      setRevenue({ current: currentRev, delta });

      void prev30;
    })();
  }, [currentCompanyId, revenuePeriod]);


  async function exportRecentOrders() {
    try {
      await exportPdfReport({
        title: "最近訂單報表",
        subtitle: "Dashboard 最新 6 筆交易摘要",
        logoUrl,
        meta: { 區間: "本週", 筆數: recentOrders.length, 產生人: "系統" },
        columns: [
          { key: "no", label: "訂單編號" },
          { key: "customer", label: "客戶" },
          { key: "amount", label: "金額", align: "right" },
          { key: "status", label: "狀態", align: "right" },
        ],
        rows: recentOrders,
        filename: `recent-orders-${Date.now()}.pdf`,
      });
      toast.success("PDF 報表已產生");
    } catch (e: any) {
      toast.error(e.message ?? "匯出失敗");
    }
  }

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">營運總覽</h1>
          <p className="text-sm text-muted-foreground mt-1">即時掌握公司關鍵營運指標</p>
        </div>
        <Button onClick={exportRecentOrders} className="bg-gradient-primary">
          <FileDown className="h-4 w-4 mr-2" /> 匯出 PDF
        </Button>
      </div>

      <div className="flex items-center justify-end">
        <ToggleGroup
          type="single"
          value={revenuePeriod}
          onValueChange={(v) => v && setRevenuePeriod(v as "today" | "week" | "month")}
          variant="outline"
          size="sm"
        >
          <ToggleGroupItem value="today">今日</ToggleGroupItem>
          <ToggleGroupItem value="week">本週</ToggleGroupItem>
          <ToggleGroupItem value="month">本月</ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard title="今日訂單" value={String(topStats.ordersToday)} delta={topStats.ordersDelta} icon={ShoppingCart} accent="primary" />
        <StatCard
          title={revenuePeriod === "today" ? "今日營收" : revenuePeriod === "week" ? "本週營收" : "本月營收"}
          value={`NT$ ${revenue.current.toLocaleString()}`}
          delta={revenue.delta}
          icon={DollarSign}
          accent="success"
        />
        <StatCard title="庫存總量" value={topStats.stockTotal.toLocaleString()} icon={Boxes} accent="warning" />
        <StatCard title="會員總數" value={topStats.memberTotal.toLocaleString()} delta={topStats.memberDelta} icon={Users} accent="chart-2" />
      </div>

      <div>
        <h2 className="text-sm font-semibold text-muted-foreground tracking-wider uppercase mb-3 flex items-center gap-2">
          <Package className="h-4 w-4" /> 商品營運指標
        </h2>
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          <StatCard title="商品總數" value={String(stats.total)} icon={Package} accent="primary" />
          <StatCard title="庫存不足商品" value={String(stats.low)} icon={AlertTriangle} accent="warning" />
          <StatCard title="熱銷商品" value={String(stats.featured)} icon={Flame} accent="chart-2" />
          <StatCard title="今日新增商品" value={String(stats.today)} icon={Sparkles} accent="success" />
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold text-muted-foreground tracking-wider uppercase mb-3 flex items-center gap-2">
          <Truck className="h-4 w-4" /> 採購進貨指標
        </h2>
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          <StatCard title="今日進貨金額" value={`NT$ ${proc.todayInAmount.toLocaleString()}`} icon={DollarSign} accent="success" />
          <StatCard title="待收貨採購單" value={String(proc.pendingPO)} icon={PackageCheck} accent="primary" />
          <StatCard title="低庫存商品" value={String(proc.lowCount)} icon={AlertTriangle} accent="warning" />
          <StatCard title="供應商總數" value={String(proc.vendorCount)} icon={Factory} accent="chart-2" />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4" /> 採購趨勢（近 7 日）</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={purchaseTrend}>
              <defs>
                <linearGradient id="gPo" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="oklch(0.70 0.20 280)" stopOpacity={0.6} />
                  <stop offset="100%" stopColor="oklch(0.70 0.20 280)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.5} />
              <XAxis dataKey="day" stroke="var(--color-muted-foreground)" fontSize={12} />
              <YAxis stroke="var(--color-muted-foreground)" fontSize={12} />
              <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8 }} formatter={(v: any) => `NT$ ${Number(v).toLocaleString()}`} />
              <Area type="monotone" dataKey="amount" stroke="oklch(0.70 0.20 280)" strokeWidth={2} fill="url(#gPo)" />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">銷售趨勢（近 7 日）</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={salesTrend}>
                <defs>
                  <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.72 0.18 200)" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="oklch(0.72 0.18 200)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.5} />
                <XAxis dataKey="day" stroke="var(--color-muted-foreground)" fontSize={12} />
                <YAxis stroke="var(--color-muted-foreground)" fontSize={12} />
                <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8 }} formatter={(v: any, k: any) => k === "sales" ? `NT$ ${Number(v).toLocaleString()}` : v} />
                <Area type="monotone" dataKey="sales" stroke="oklch(0.72 0.18 200)" strokeWidth={2} fill="url(#g1)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">分類訂單分析（近 30 日）</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={categoryData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.5} />
                <XAxis type="number" stroke="var(--color-muted-foreground)" fontSize={12} />
                <YAxis dataKey="name" type="category" stroke="var(--color-muted-foreground)" fontSize={11} width={70} />
                <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8 }} />
                <Bar dataKey="value" fill="oklch(0.70 0.20 280)" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">最近訂單</CardTitle>
          <span className="text-xs text-muted-foreground">最新 {recentOrders.length} 筆</span>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                  <th className="pb-3 font-medium">訂單編號</th>
                  <th className="pb-3 font-medium">客戶</th>
                  <th className="pb-3 font-medium text-right">金額</th>
                  <th className="pb-3 font-medium text-right">狀態</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {recentOrders.length === 0 && (
                  <tr><td colSpan={4} className="py-8 text-center text-muted-foreground text-sm">尚無訂單</td></tr>
                )}
                {recentOrders.map((o) => (
                  <tr key={o.no} className="hover:bg-muted/30 transition-colors">
                    <td className="py-3 font-mono text-xs">{o.no}</td>
                    <td className="py-3">{o.customer}</td>
                    <td className="py-3 text-right font-medium">{o.amount}</td>
                    <td className="py-3 text-right">
                      <Badge variant={statusVariant[o.status] ?? "outline"}>{o.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
