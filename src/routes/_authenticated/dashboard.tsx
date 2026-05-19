import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/StatCard";
import { ShoppingCart, DollarSign, Boxes, Users } from "lucide-react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";

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
  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">營運總覽</h1>
        <p className="text-sm text-muted-foreground mt-1">即時掌握公司關鍵營運指標</p>
      </div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard title="今日訂單" value="287" delta={12.5} icon={ShoppingCart} accent="primary" />
        <StatCard title="今日營收" value="NT$ 482K" delta={8.2} icon={DollarSign} accent="success" />
        <StatCard title="庫存總量" value="14,392" delta={-2.1} icon={Boxes} accent="warning" />
        <StatCard title="會員總數" value="3,247" delta={5.4} icon={Users} accent="chart-2" />
      </div>

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
