import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/StatCard";
import { useTransactions, useReceivables, usePayables, useBankAccounts } from "@/hooks/use-finance";
import { ArrowDownCircle, ArrowUpCircle, Scale, Landmark, AlertTriangle, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { deriveStatus } from "@/services/finance.service";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useMemo } from "react";

export const Route = createFileRoute("/_authenticated/finance/")({ component: FinanceOverview });

function fmt(n: number) { return `NT$ ${Math.round(n).toLocaleString()}`; }

function FinanceOverview() {
  const { data: txs, summary } = useTransactions();
  const { data: ars } = useReceivables();
  const { data: aps } = usePayables();
  const { data: banks } = useBankAccounts();

  const overdueAR = ars.filter((r) => deriveStatus(r.due_date, r.status) === "overdue");
  const overdueAP = aps.filter((p) => deriveStatus(p.due_date, p.status) === "overdue");
  const totalBalance = banks.reduce((s, b) => s + Number(b.balance), 0);
  const arOpen = ars.reduce((s, r) => s + (Number(r.total_amount) - Number(r.paid_amount)), 0);
  const apOpen = aps.reduce((s, p) => s + (Number(p.total_amount) - Number(p.paid_amount)), 0);

  const chartData = useMemo(() => {
    const buckets: Record<string, { income: number; expense: number }> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      buckets[d.toISOString().slice(0, 10)] = { income: 0, expense: 0 };
    }
    txs.forEach((t) => {
      const k = new Date(t.occurred_at).toISOString().slice(0, 10);
      if (k in buckets) {
        if (t.type === "income") buckets[k].income += Number(t.amount);
        else if (t.type === "expense") buckets[k].expense += Number(t.amount);
      }
    });
    return Object.entries(buckets).map(([k, v]) => ({ day: k.slice(5), ...v }));
  }, [txs]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard title="本期收入" value={fmt(summary.income)} icon={ArrowDownCircle} accent="success" />
        <StatCard title="本期支出" value={fmt(summary.expense)} icon={ArrowUpCircle} accent="warning" />
        <StatCard title="淨現金流" value={fmt(summary.net)} icon={Scale} accent={summary.net >= 0 ? "primary" : "warning"} />
        <StatCard title="銀行帳戶餘額" value={fmt(totalBalance)} icon={Landmark} accent="chart-2" />
      </div>

      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <StatCard title="應收未收" value={fmt(arOpen)} icon={ArrowDownCircle} accent="primary" />
        <StatCard title="應付未付" value={fmt(apOpen)} icon={ArrowUpCircle} accent="warning" />
        <StatCard title="逾期應收筆數" value={String(overdueAR.length)} icon={AlertTriangle} accent="warning" />
        <StatCard title="逾期應付筆數" value={String(overdueAP.length)} icon={Clock} accent="warning" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">現金流趨勢（近 7 日）</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="gIn" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="oklch(0.75 0.18 160)" stopOpacity={0.6} />
                  <stop offset="100%" stopColor="oklch(0.75 0.18 160)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gOut" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="oklch(0.72 0.22 30)" stopOpacity={0.55} />
                  <stop offset="100%" stopColor="oklch(0.72 0.22 30)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" opacity={0.5} />
              <XAxis dataKey="day" stroke="var(--color-muted-foreground)" fontSize={12} />
              <YAxis stroke="var(--color-muted-foreground)" fontSize={12} />
              <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8 }} formatter={(v: any) => fmt(Number(v))} />
              <Area type="monotone" dataKey="income" stroke="oklch(0.75 0.18 160)" strokeWidth={2} fill="url(#gIn)" name="收入" />
              <Area type="monotone" dataKey="expense" stroke="oklch(0.72 0.22 30)" strokeWidth={2} fill="url(#gOut)" name="支出" />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-warning" /> 逾期應收</CardTitle></CardHeader>
          <CardContent>
            {overdueAR.length === 0 ? <p className="text-sm text-muted-foreground py-6 text-center">目前沒有逾期應收款 🎉</p> : (
              <div className="divide-y divide-border">
                {overdueAR.slice(0, 5).map((r) => (
                  <div key={r.id} className="py-2.5 flex items-center justify-between text-sm">
                    <div>
                      <div className="font-medium">{r.customer_name}</div>
                      <div className="text-xs text-muted-foreground font-mono">{r.invoice_no} · 到期 {r.due_date}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-warning">{fmt(Number(r.total_amount) - Number(r.paid_amount))}</div>
                      <Badge variant="destructive" className="text-[10px] mt-0.5">逾期</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Clock className="h-4 w-4 text-warning" /> 逾期應付</CardTitle></CardHeader>
          <CardContent>
            {overdueAP.length === 0 ? <p className="text-sm text-muted-foreground py-6 text-center">目前沒有逾期應付款 🎉</p> : (
              <div className="divide-y divide-border">
                {overdueAP.slice(0, 5).map((p) => (
                  <div key={p.id} className="py-2.5 flex items-center justify-between text-sm">
                    <div>
                      <div className="font-medium">{p.vendor_name}</div>
                      <div className="text-xs text-muted-foreground font-mono">{p.bill_no} · 到期 {p.due_date}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-warning">{fmt(Number(p.total_amount) - Number(p.paid_amount))}</div>
                      <Badge variant="destructive" className="text-[10px] mt-0.5">逾期</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
