import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Loader2, PlayCircle, ShieldCheck, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth, type AppRole } from "@/hooks/use-auth";
import { ForbiddenScreen } from "@/components/ForbiddenScreen";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { runDailyBonusReconciliation } from "@/lib/bonus.functions";

const ALLOWED: AppRole[] = ["super_admin", "admin", "finance"];

export const Route = createFileRoute("/_authenticated/admin/bonuses/reconciliation")({
  component: Guard,
});

function Guard() {
  const { roles, loading } = useAuth();
  if (loading)
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  if (!roles.some((r) => ALLOWED.includes(r)))
    return <ForbiddenScreen requiredRoles={ALLOWED} pageName="補結驗證報告" />;
  return <Page />;
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmt(n: any) {
  return Number(n ?? 0).toLocaleString();
}

function Page() {
  const [date, setDate] = useState(today());
  const [dryRun, setDryRun] = useState(true);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<any>(null);

  async function run() {
    if (!dryRun) {
      const ok = confirm(
        `即將以「Apply（實際寫入 bonus_records）」模式執行 ${date}。\n仍不會直接發放點數（發放受 reward_release_mode 控制）。\n確定執行？`,
      );
      if (!ok) return;
    }
    setBusy(true);
    setReport(null);
    try {
      const res = await runDailyBonusReconciliation({
        data: { settlementDate: date, dryRun },
      });
      setReport(res);
      if (res.ok) toast.success(`${dryRun ? "Dry-run" : "Apply"} 完成`);
      else toast.error(res.rpc?.error ?? "執行失敗");
    } catch (e: any) {
      toast.error(e?.message ?? "執行失敗");
    } finally {
      setBusy(false);
    }
  }

  function downloadJson() {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bonus-reconciliation-${date}-${dryRun ? "dryrun" : "apply"}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/admin/bonuses">
            <ArrowLeft className="mr-1 h-4 w-4" />
            返回獎金中心
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            一鍵補結驗證報告
          </CardTitle>
          <CardDescription>
            執行 <code className="rounded bg-muted px-1">settle_daily_bonus_for_date</code>（可切換 dry-run／apply），
            並自動彙整結果 JSON、bonus_records 分佈、ledger 與當日錢包安全檢查。
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
          <div>
            <Label htmlFor="date">結算日期</Label>
            <Input
              id="date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-48"
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch id="dry" checked={dryRun} onCheckedChange={setDryRun} />
            <Label htmlFor="dry" className="cursor-pointer">
              Dry-run（不寫入 bonus_records）
            </Label>
          </div>
          <Button onClick={run} disabled={busy}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlayCircle className="mr-2 h-4 w-4" />}
            {dryRun ? "執行 Dry-run" : "執行 Apply"}
          </Button>
          {report ? (
            <Button variant="outline" onClick={downloadJson}>
              下載 JSON 報告
            </Button>
          ) : null}
        </CardContent>
      </Card>

      {report ? <ReportView report={report} /> : null}
    </div>
  );
}

function ReportView({ report }: { report: any }) {
  const s = report.summary ?? {};
  const rpcErr = report.rpc?.error;
  const rpcRes = report.rpc?.result;
  const walletWarn = report.wallet_safety?.warning;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {rpcErr ? (
              <AlertTriangle className="h-5 w-5 text-destructive" />
            ) : (
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            )}
            RPC 結果
            <Badge variant={report.input?.dryRun ? "secondary" : "default"}>
              {report.input?.dryRun ? "dry-run" : "apply"}
            </Badge>
            <Badge variant="outline">{report.input?.settlementDate}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {rpcErr ? (
            <pre className="whitespace-pre-wrap rounded bg-destructive/10 p-3 text-xs text-destructive">{rpcErr}</pre>
          ) : (
            <pre className="max-h-72 overflow-auto rounded bg-muted p-3 text-xs">{JSON.stringify(rpcRes, null, 2)}</pre>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">總筆數</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{fmt(s.totalRecords)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">總點數</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{fmt(s.totalPoints)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">受發放會員數</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{fmt(s.uniqueMembers)}</CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-base">依 bonus_type 分佈</CardTitle></CardHeader>
          <CardContent>
            <KVTable data={s.byType ?? {}} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">依 status 分佈</CardTitle></CardHeader>
          <CardContent>
            <KVTable data={s.byStatus ?? {}} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ledger 檢查</CardTitle>
          <CardDescription>當日 VIP 營業分紅 / VIP 分紅池 寫入紀錄</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div>
            vip_daily_revenue_bonus_ledger：<b>{fmt(report.ledger?.vip_daily_revenue?.count)}</b> 筆 / <b>{fmt(report.ledger?.vip_daily_revenue?.points)}</b> 點
          </div>
          <div>
            vip_bonus_pool_payouts：<b>{fmt(report.ledger?.vip_bonus_pool?.count)}</b> 筆 / <b>{fmt(report.ledger?.vip_bonus_pool?.points)}</b> 點
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            {walletWarn ? <AlertTriangle className="h-4 w-4 text-destructive" /> : <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
            錢包安全檢查（當日 UTC+8）
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <div>reward_wallet_logs 新增：{fmt(report.wallet_safety?.reward_wallet_logs_count_on_date)}</div>
          <div>point_transactions 新增：{fmt(report.wallet_safety?.point_transactions_count_on_date)}</div>
          {walletWarn ? <div className="text-destructive">⚠ {walletWarn}</div> : null}
        </CardContent>
      </Card>

      {(report.batches ?? []).length > 0 ? (
        <Card>
          <CardHeader><CardTitle className="text-base">結算批次</CardTitle></CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Batch ID</TableHead>
                  <TableHead>類型</TableHead>
                  <TableHead>期間</TableHead>
                  <TableHead className="text-right">總點數</TableHead>
                  <TableHead>狀態</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.batches.map((b: any) => (
                  <TableRow key={b.id}>
                    <TableCell className="font-mono text-xs">{b.id}</TableCell>
                    <TableCell>{b.batch_type}</TableCell>
                    <TableCell>{b.period_start} ~ {b.period_end}</TableCell>
                    <TableCell className="text-right">{fmt(b.total_points)}</TableCell>
                    <TableCell><Badge variant="outline">{b.status}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">bonus_records 明細（前 200 筆）</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>settlement_date</TableHead>
                <TableHead>release_date</TableHead>
                <TableHead>member</TableHead>
                <TableHead>type</TableHead>
                <TableHead>status</TableHead>
                <TableHead>gen</TableHead>
                <TableHead className="text-right">rate</TableHead>
                <TableHead className="text-right">base</TableHead>
                <TableHead className="text-right">points</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(report.records ?? []).map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell>{r.settlement_date}</TableCell>
                  <TableCell>{r.release_date}</TableCell>
                  <TableCell className="font-mono text-xs">{String(r.member_id).slice(0, 8)}…</TableCell>
                  <TableCell>{r.bonus_type}</TableCell>
                  <TableCell><Badge variant="outline">{r.status}</Badge></TableCell>
                  <TableCell>{r.generation_level ?? "-"}</TableCell>
                  <TableCell className="text-right">{r.bonus_rate ?? "-"}</TableCell>
                  <TableCell className="text-right">{fmt(r.base_amount)}</TableCell>
                  <TableCell className="text-right">{fmt(r.bonus_points)}</TableCell>
                </TableRow>
              ))}
              {(report.records ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                    此日期 bonus_records 為空
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function KVTable({ data }: { data: Record<string, { count: number; points: number }> }) {
  const entries = Object.entries(data);
  if (entries.length === 0) return <div className="text-sm text-muted-foreground">—</div>;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Key</TableHead>
          <TableHead className="text-right">筆數</TableHead>
          <TableHead className="text-right">點數</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map(([k, v]) => (
          <TableRow key={k}>
            <TableCell>{k}</TableCell>
            <TableCell className="text-right">{fmt(v.count)}</TableCell>
            <TableCell className="text-right">{fmt(v.points)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
