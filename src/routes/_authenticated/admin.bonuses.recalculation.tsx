import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CalendarDays, Loader2, RefreshCw, RotateCcw, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { ForbiddenScreen } from "@/components/ForbiddenScreen";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth, type AppRole } from "@/hooks/use-auth";
import { adminListBonusRecalculationRuns, adminRunBonusRecalculation } from "@/lib/bonus.functions";

const VIEW_ROLES: AppRole[] = ["super_admin", "admin", "finance"];
const APPLY_ROLES: AppRole[] = ["super_admin", "admin"];

type Scope = "daily" | "monthly";

export const Route = createFileRoute("/_authenticated/admin/bonuses/recalculation")({
  component: Guard,
});

function Guard() {
  const { roles, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!roles.some((role) => VIEW_ROLES.includes(role))) {
    return <ForbiddenScreen requiredRoles={VIEW_ROLES} pageName="獎金重算管理" />;
  }

  return <BonusRecalculationPage />;
}

function todayTw() {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Taipei" }));
  return now.toISOString().slice(0, 10);
}

function currentYmTw() {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Taipei" }));
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function n(value: unknown) {
  return Number(value ?? 0).toLocaleString("zh-TW");
}

function statusTone(status: string) {
  if (status === "completed") return "default";
  if (status === "blocked") return "secondary";
  if (status === "failed") return "destructive";
  return "outline";
}

function BonusRecalculationPage() {
  const { roles } = useAuth();
  const canApply = roles.some((role) => APPLY_ROLES.includes(role));
  const [scope, setScope] = useState<Scope>("daily");
  const [dailyDate, setDailyDate] = useState(todayTw());
  const [monthlyYm, setMonthlyYm] = useState(currentYmTw());
  const [busy, setBusy] = useState(false);
  const [runsLoading, setRunsLoading] = useState(false);
  const [lastResult, setLastResult] = useState<any | null>(null);
  const [runs, setRuns] = useState<any[]>([]);
  const [confirmApply, setConfirmApply] = useState(false);

  const target = scope === "daily" ? dailyDate : monthlyYm;
  const summary = lastResult?.after ?? lastResult?.before ?? {};
  const settlementRpc = lastResult?.settlement_rpc ?? {};

  const runRows = useMemo(() => runs.slice(0, 20), [runs]);

  async function loadRuns() {
    setRunsLoading(true);
    try {
      const res = await adminListBonusRecalculationRuns({ data: { limit: 30 } });
      setRuns(res.runs ?? []);
    } catch (error: any) {
      toast.error(error?.message ?? "讀取重算紀錄失敗");
    } finally {
      setRunsLoading(false);
    }
  }

  useEffect(() => {
    loadRuns();
  }, []);

  async function execute(dryRun: boolean) {
    if (!dryRun && !canApply) {
      toast.error("只有 super_admin / admin 可以正式重算");
      return;
    }
    setBusy(true);
    try {
      const result = await adminRunBonusRecalculation({
        data: { scope, target, dryRun },
      });
      setLastResult(result);
      await loadRuns();
      if (result?.blocked) {
        toast.warning(result.reason ?? "重算已被安全規則阻擋");
      } else {
        toast.success(dryRun ? "重算預覽完成" : "正式重算完成");
      }
    } catch (error: any) {
      toast.error(error?.message ?? "獎金重算失敗");
    } finally {
      setBusy(false);
      setConfirmApply(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <RotateCcw className="h-6 w-6 text-primary" />
            獎金重算管理
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            先預覽再執行；已發放獎金不覆蓋，需走追回或更正流程。
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/admin/bonuses">
            <ArrowLeft className="mr-2 h-4 w-4" />
            返回獎金營運中心
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>重算條件</CardTitle>
          <CardDescription>
            日獎金支援指定日期；月獎金支援指定月份。正式執行前會保留 audit run 紀錄。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>重算類型</Label>
              <div className="flex rounded-md border p-1">
                <Button
                  type="button"
                  variant={scope === "daily" ? "default" : "ghost"}
                  className="flex-1"
                  onClick={() => setScope("daily")}
                >
                  日獎金
                </Button>
                <Button
                  type="button"
                  variant={scope === "monthly" ? "default" : "ghost"}
                  className="flex-1"
                  onClick={() => setScope("monthly")}
                >
                  月獎金
                </Button>
              </div>
            </div>

            {scope === "daily" ? (
              <div className="space-y-2">
                <Label htmlFor="daily-date">結算日期</Label>
                <Input id="daily-date" type="date" value={dailyDate} onChange={(e) => setDailyDate(e.target.value)} />
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="monthly-ym">結算月份 YYYYMM</Label>
                <Input
                  id="monthly-ym"
                  inputMode="numeric"
                  maxLength={6}
                  value={monthlyYm}
                  onChange={(e) => setMonthlyYm(e.target.value.replace(/\D/g, "").slice(0, 6))}
                />
              </div>
            )}

            <div className="space-y-2">
              <Label>安全狀態</Label>
              <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                <div>發放錢包：不觸碰</div>
                <div>點數交易：不觸碰</div>
                <div>正式重算：{canApply ? "允許" : "僅 super_admin / admin"}</div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => execute(true)} disabled={busy}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CalendarDays className="mr-2 h-4 w-4" />}
              Dry-run 預覽
            </Button>
            <Button variant="destructive" onClick={() => setConfirmApply(true)} disabled={busy || !canApply}>
              <ShieldAlert className="mr-2 h-4 w-4" />
              正式重算
            </Button>
            <Button variant="outline" onClick={loadRuns} disabled={runsLoading}>
              {runsLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              重整紀錄
            </Button>
          </div>
        </CardContent>
      </Card>

      {lastResult && (
        <Card>
          <CardHeader>
            <CardTitle>最近結果</CardTitle>
            <CardDescription>
              run id：<span className="font-mono">{lastResult.run_id ?? "—"}</span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {lastResult.blocked && (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                {lastResult.reason}
              </div>
            )}
            <div className="grid gap-3 md:grid-cols-4">
              <ResultMetric label="總筆數" value={summary.total_records} />
              <ResultMetric label="總點數" value={summary.total_points} />
              <ResultMetric label="已發放筆數" value={summary.released_records} />
              <ResultMetric label="RPC 影響點數" value={settlementRpc.points ?? settlementRpc.total_points ?? "—"} />
            </div>
            <details className="rounded-md border p-3">
              <summary className="cursor-pointer text-sm font-medium">查看原始 JSON</summary>
              <pre className="mt-3 max-h-96 overflow-auto rounded bg-muted p-3 text-xs">
                {JSON.stringify(lastResult, null, 2)}
              </pre>
            </details>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>重算紀錄</CardTitle>
          <CardDescription>顯示最近 30 筆 bonus_recalculation_runs。</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>時間</TableHead>
                <TableHead>類型</TableHead>
                <TableHead>目標</TableHead>
                <TableHead>模式</TableHead>
                <TableHead>狀態</TableHead>
                <TableHead>結果</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runRows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    尚無重算紀錄
                  </TableCell>
                </TableRow>
              ) : (
                runRows.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell className="whitespace-nowrap">{new Date(run.created_at).toLocaleString("zh-TW")}</TableCell>
                    <TableCell>{run.scope === "daily" ? "日獎金" : "月獎金"}</TableCell>
                    <TableCell className="font-mono">{run.target_date ?? run.target_yyyymm}</TableCell>
                    <TableCell>{run.dry_run ? "dry-run" : "apply"}</TableCell>
                    <TableCell>
                      <Badge variant={statusTone(run.status) as any}>{run.status}</Badge>
                    </TableCell>
                    <TableCell className="max-w-md truncate text-xs text-muted-foreground">
                      {run.error ?? JSON.stringify(run.result ?? {})}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AlertDialog open={confirmApply} onOpenChange={setConfirmApply}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認正式重算？</AlertDialogTitle>
            <AlertDialogDescription>
              本操作會寫入 bonus_recalculation_runs，並依類型更新未發放的 bonus_records。
              已發放資料不會覆蓋；若偵測到已發放，系統會阻擋。此操作不會發放錢包、不會寫入 point_transactions。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => execute(false)}>確認重算</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ResultMetric({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="rounded-md border bg-muted/20 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold">{typeof value === "number" ? n(value) : String(value ?? "—")}</div>
    </div>
  );
}
