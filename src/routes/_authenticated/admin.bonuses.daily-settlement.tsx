import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2, Search, PlayCircle, ShieldCheck, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth, type AppRole } from "@/hooks/use-auth";
import { ForbiddenScreen } from "@/components/ForbiddenScreen";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { scanUnsettledDailyBonusDates, runDailyBonusReconciliation } from "@/lib/bonus.functions";

const ALLOWED: AppRole[] = ["super_admin", "admin", "finance"];

export const Route = createFileRoute("/_authenticated/admin/bonuses/daily-settlement")({
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
    return <ForbiddenScreen requiredRoles={ALLOWED} pageName="每日獎金結算" />;
  return <Page />;
}

function iso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fmt(n: any) {
  return Number(n ?? 0).toLocaleString();
}

function Page() {
  const today = new Date();
  const defaultFrom = new Date(today.getTime() - 30 * 86400000);
  const [fromDate, setFromDate] = useState(iso(defaultFrom));
  const [toDate, setToDate] = useState(iso(today));
  const [rows, setRows] = useState<any[]>([]);
  const [scanning, setScanning] = useState(false);
  const [busyDate, setBusyDate] = useState<string | null>(null);
  const [preview, setPreview] = useState<Record<string, any>>({});
  const [showAll, setShowAll] = useState(false);

  async function scan() {
    setScanning(true);
    try {
      const res = await scanUnsettledDailyBonusDates({ data: { fromDate, toDate } });
      setRows(res.dates ?? []);
      setPreview({});
    } catch (e: any) {
      toast.error(e?.message ?? "掃描失敗");
    } finally {
      setScanning(false);
    }
  }
  useEffect(() => {
    scan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function dryRun(date: string) {
    setBusyDate(date);
    try {
      const res = await runDailyBonusReconciliation({ data: { settlementDate: date, dryRun: true } });
      setPreview((p) => ({ ...p, [date]: res }));
      if (res.ok) toast.success(`${date} Dry-run 完成`);
      else toast.error(res.rpc?.error ?? "Dry-run 失敗");
    } catch (e: any) {
      toast.error(e?.message ?? "Dry-run 失敗");
    } finally {
      setBusyDate(null);
    }
  }

  async function apply(date: string) {
    if (!confirm(`確定要對 ${date} 執行「立即補算」（會寫入 bonus_records）？\n發放仍受 reward_release_mode 控制。`)) return;
    setBusyDate(date);
    try {
      const res = await runDailyBonusReconciliation({ data: { settlementDate: date, dryRun: false } });
      setPreview((p) => ({ ...p, [date]: res }));
      if (res.ok) {
        toast.success(`${date} 補算完成`);
        scan();
      } else {
        toast.error(res.rpc?.error ?? "補算失敗");
      }
    } catch (e: any) {
      toast.error(e?.message ?? "補算失敗");
    } finally {
      setBusyDate(null);
    }
  }

  const visible = useMemo(
    () => (showAll ? rows : rows.filter((r) => r.unsettled)),
    [rows, showAll],
  );
  const unsettledCount = rows.filter((r) => r.unsettled).length;

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
            每日獎金結算監控
          </CardTitle>
          <CardDescription>
            掃描指定區間內「有訂單獎勵點但缺 bonus_records」的日期，可直接對未結算日期執行 Dry-run 或立即補算。
            所有寫入仍走 <code className="rounded bg-muted px-1">settle_daily_bonus_for_date</code>；發放時機依 reward_release_mode 控制。
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
          <div>
            <Label htmlFor="from">起始日</Label>
            <Input id="from" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-44" />
          </div>
          <div>
            <Label htmlFor="to">結束日</Label>
            <Input id="to" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-44" />
          </div>
          <Button onClick={scan} disabled={scanning}>
            {scanning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
            重新掃描
          </Button>
          <div className="ml-auto flex items-center gap-2 text-sm">
            <input
              id="showAll"
              type="checkbox"
              checked={showAll}
              onChange={(e) => setShowAll(e.target.checked)}
              className="h-4 w-4"
            />
            <Label htmlFor="showAll" className="cursor-pointer">顯示所有日期（含已結算）</Label>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            未結算日期：<span className="text-destructive">{unsettledCount}</span> 天
            {rows.length > 0 && (
              <span className="ml-2 text-sm text-muted-foreground">
                （掃描區間 {fromDate} ~ {toDate}，共 {rows.length} 個有獎勵點的日期）
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>日期</TableHead>
                <TableHead className="text-right">來源訂單</TableHead>
                <TableHead className="text-right">應產生點數</TableHead>
                <TableHead className="text-right">目前 records</TableHead>
                <TableHead className="text-right">有效點數</TableHead>
                <TableHead className="text-right">已取消</TableHead>
                <TableHead>狀態</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                    {scanning ? "掃描中…" : "區間內沒有符合條件的日期"}
                  </TableCell>
                </TableRow>
              ) : (
                visible.map((r) => (
                  <>
                    <TableRow key={r.date}>
                      <TableCell className="font-mono">{r.date}</TableCell>
                      <TableCell className="text-right">{fmt(r.orderCount)}</TableCell>
                      <TableCell className="text-right">{fmt(r.expectedPoints)}</TableCell>
                      <TableCell className="text-right">{fmt(r.bonusRecordsTotal)}</TableCell>
                      <TableCell className="text-right">{fmt(r.bonusRecordsActivePoints)}</TableCell>
                      <TableCell className="text-right">{fmt(r.bonusRecordsCancelled)}</TableCell>
                      <TableCell>
                        {r.unsettled ? (
                          <Badge variant="destructive" className="gap-1">
                            <AlertTriangle className="h-3 w-3" />未結算
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="gap-1">
                            <CheckCircle2 className="h-3 w-3" />已結算
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busyDate === r.date}
                            onClick={() => dryRun(r.date)}
                          >
                            {busyDate === r.date ? <Loader2 className="h-3 w-3 animate-spin" /> : "Dry-run"}
                          </Button>
                          <Button
                            size="sm"
                            disabled={busyDate === r.date}
                            onClick={() => apply(r.date)}
                          >
                            {busyDate === r.date ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <>
                                <PlayCircle className="mr-1 h-3 w-3" />
                                立即補算
                              </>
                            )}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {preview[r.date] ? (
                      <TableRow key={`${r.date}-preview`}>
                        <TableCell colSpan={8} className="bg-muted/40">
                          <PreviewBlock date={r.date} report={preview[r.date]} />
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function PreviewBlock({ date, report }: { date: string; report: any }) {
  const s = report.summary ?? {};
  const err = report.rpc?.error;
  return (
    <div className="space-y-2 p-2 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant={report.input?.dryRun ? "secondary" : "default"}>
          {report.input?.dryRun ? "dry-run" : "apply"}
        </Badge>
        <span className="font-mono text-xs">{date}</span>
        <span>總筆數 <b>{fmt(s.totalRecords)}</b></span>
        <span>總點數 <b>{fmt(s.totalPoints)}</b></span>
        <span>會員數 <b>{fmt(s.uniqueMembers)}</b></span>
      </div>
      {err ? (
        <pre className="whitespace-pre-wrap rounded bg-destructive/10 p-2 text-xs text-destructive">{err}</pre>
      ) : (
        <pre className="max-h-56 overflow-auto rounded bg-background p-2 text-xs">
          {JSON.stringify(report.rpc?.result, null, 2)}
        </pre>
      )}
    </div>
  );
}
