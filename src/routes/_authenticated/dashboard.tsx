import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/StatCard";
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

const salesTrend = [
  { day: "週一", sales: 42000, orders: 38 },
  { day: "週二", sales: 51000, orders: 45 },
  { day: "週三", sales: 48000, orders: 41 },
  { day: "週四", sales: 65000, orders: 56 },
  { day: "週五", sales: 72000, orders: 64 },
  { day: "週六", sales: 89000, orders: 78 },
  { day: "週日", sales: 76000, orders: 67 },
];

const categoryData = [
  { name: "電子產品", value: 142 },
  { name: "服飾配件", value: 98 },
  { name: "居家用品", value: 76 },
  { name: "美妝保養", value: 64 },
  { name: "食品飲料", value: 52 },
];

const recentOrders = [
  { no: "ORD-2024-1042", customer: "陳大文", amount: "NT$ 12,800", status: "已完成" },
  { no: "ORD-2024-1041", customer: "林美玲", amount: "NT$ 5,420", status: "處理中" },
  { no: "ORD-2024-1040", customer: "王志強", amount: "NT$ 23,100", status: "已出貨" },
  { no: "ORD-2024-1039", customer: "黃淑芬", amount: "NT$ 880", status: "待付款" },
  { no: "ORD-2024-1038", customer: "張俊傑", amount: "NT$ 9,650", status: "已完成" },
  { no: "ORD-2024-1037", customer: "李雅婷", amount: "NT$ 3,200", status: "已取消" },
];

const statusVariant: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  "已完成": "default",
  "處理中": "secondary",
  "已出貨": "outline",
  "待付款": "secondary",
  "已取消": "destructive",
};

function Dashboard() {
  const { logoUrl } = useBranding();
  const [stats, setStats] = useState({ total: 0, low: 0, featured: 0, today: 0 });
  const [proc, setProc] = useState({ todayInAmount: 0, pendingPO: 0, vendorCount: 0, lowCount: 0 });
  const [purchaseTrend, setPurchaseTrend] = useState<{ day: string; amount: number }[]>([]);

  useEffect(() => {
    (async () => {
      const sb: any = supabase;
      const since = new Date(); since.setHours(0, 0, 0, 0);
      const [{ count: total }, { data: all }, { count: featured }, { count: today }] = await Promise.all([
        sb.from("products").select("id", { count: "exact", head: true }),
        sb.from("products").select("stock,safe_stock"),
        sb.from("products").select("id", { count: "exact", head: true }).eq("featured", true),
        sb.from("products").select("id", { count: "exact", head: true }).gte("created_at", since.toISOString()),
      ]);
      const low = (all ?? []).filter((p: any) => p.stock <= p.safe_stock).length;
      setStats({ total: total ?? 0, low, featured: featured ?? 0, today: today ?? 0 });

      // 採購相關
      const [{ data: todayGr }, { count: pendingPO }, { count: vendorCount }] = await Promise.all([
        sb.from("goods_receiving").select("purchase_order_id, received_date").gte("received_date", since.toISOString()),
        sb.from("purchase_orders").select("id", { count: "exact", head: true }).in("status", ["submitted", "confirmed", "partial"]),
        sb.from("vendors").select("id", { count: "exact", head: true }).eq("status", "active"),
      ]);
      // 計算今日進貨金額（從 inventory_transactions 計算 purchase_in）
      const { data: txToday } = await sb.from("inventory_transactions").select("quantity, product_id").eq("type", "purchase_in").gte("created_at", since.toISOString());
      let todayAmt = 0;
      if (txToday && txToday.length) {
        const ids = Array.from(new Set(txToday.map((x: any) => x.product_id).filter(Boolean)));
        const { data: prices } = await sb.from("products").select("id, cost_price").in("id", ids);
        const pm: Record<string, number> = {};
        (prices ?? []).forEach((p: any) => pm[p.id] = Number(p.cost_price) || 0);
        todayAmt = txToday.reduce((s: number, t: any) => s + (pm[t.product_id] ?? 0) * t.quantity, 0);
      }
      setProc({ todayInAmount: todayAmt, pendingPO: pendingPO ?? 0, vendorCount: vendorCount ?? 0, lowCount: low });

      // 採購趨勢（過去 7 天 PO 金額）
      const since7 = new Date(); since7.setDate(since7.getDate() - 6); since7.setHours(0, 0, 0, 0);
      const { data: pos } = await sb.from("purchase_orders").select("total_amount, created_at").gte("created_at", since7.toISOString());
      const buckets: Record<string, number> = {};
      for (let i = 0; i < 7; i++) { const d = new Date(since7); d.setDate(d.getDate() + i); buckets[d.toISOString().slice(0, 10)] = 0; }
      (pos ?? []).forEach((p: any) => {
        const k = new Date(p.created_at).toISOString().slice(0, 10);
        if (k in buckets) buckets[k] += Number(p.total_amount) || 0;
      });
      setPurchaseTrend(Object.entries(buckets).map(([k, v]) => ({ day: k.slice(5), amount: v })));
    })();
  }, []);


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

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard title="今日訂單" value="287" delta={12.5} icon={ShoppingCart} accent="primary" />
        <StatCard title="今日營收" value="NT$ 482K" delta={8.2} icon={DollarSign} accent="success" />
        <StatCard title="庫存總量" value="14,392" delta={-2.1} icon={Boxes} accent="warning" />
        <StatCard title="會員總數" value="3,247" delta={5.4} icon={Users} accent="chart-2" />
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
            <CardTitle className="text-base">銷售趨勢（本週）</CardTitle>
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
                <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8 }} />
                <Area type="monotone" dataKey="sales" stroke="oklch(0.72 0.18 200)" strokeWidth={2} fill="url(#g1)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">分類訂單分析</CardTitle>
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
          <span className="text-xs text-muted-foreground">最新 6 筆</span>
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
                {recentOrders.map((o) => (
                  <tr key={o.no} className="hover:bg-muted/30 transition-colors">
                    <td className="py-3 font-mono text-xs">{o.no}</td>
                    <td className="py-3">{o.customer}</td>
                    <td className="py-3 text-right font-medium">{o.amount}</td>
                    <td className="py-3 text-right">
                      <Badge variant={statusVariant[o.status]}>{o.status}</Badge>
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
