import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Loader2, Info, PlayCircle, AlertTriangle, FileText } from "lucide-react";
import { toast } from "sonner";
import { useAuth, type AppRole } from "@/hooks/use-auth";
import { ForbiddenScreen } from "@/components/ForbiddenScreen";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { adminRunNationalBonusDistribution } from "@/lib/bonus.functions";

const ALLOWED: AppRole[] = ["super_admin", "admin", "finance"];

export const Route = createFileRoute("/_authenticated/admin/bonuses/national-share")({
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
    return <ForbiddenScreen requiredRoles={ALLOWED} pageName="全國分紅（STAR5~DIRECTOR）" />;
  return <Page />;
}

type TierRow = {
  settlement_date: string;
  tier_code: string;
  pool_rate: number;
  pool_amount: number;
  eligible_count: number;
  distributed_count: number;
  skipped_count: number;
  blocked_count: number;
  distributed_points: number;
};

type Summary = {
  created_count: number;
  cancelled_count: number;
  skipped_count: number;
  total_distributed_points: number;
  by_tier: TierRow[];
};

function yesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function Page() {
  const [settlementDate, setSettlementDate] = useState<string>(yesterdayStr());
  const [dailyTotal, setDailyTotal] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);

  const points = Number(dailyTotal);
  const canSubmit =
    !!settlementDate && Number.isFinite(points) && points > 0 && !busy;

  async function runDistribution() {
    setBusy(true);
    setConfirmOpen(false);
    try {
      const res = (await adminRunNationalBonusDistribution({
        data: { settlementDate, dailyTotalRewardPoints: points },
      })) as Summary;
      setSummary(res);
      toast.success(
        `已建立 ${res.created_count} 筆 waiting_release、cancelled ${res.cancelled_count} 筆、skipped ${res.skipped_count} 筆`,
      );
    } catch (e: any) {
      toast.error(e?.message ?? "全國分紅執行失敗");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">全國分紅（STAR5~DIRECTOR）</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            手動指定結算日期與每日營業總獎勵點，執行 2C-2 全國分紅演算，僅建立 <code>waiting_release</code>{" "}
            的 <code>bonus_records</code>，實際發放仍由既有 release 流程處理。
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/admin/bonuses">
            <ArrowLeft className="mr-2 h-4 w-4" />
            返回獎金營運中心
          </Link>
        </Button>
      </div>

      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Info className="h-4 w-4" />
            全國分紅規則
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-xs text-muted-foreground">
          <div>1. 每級 pool = 當日營業總獎勵點 × 2%（讀取 <code>national_bonus_pool_settings.pool_rate</code>）</div>
          <div>2. 對象：STAR5 / STAR6 / STAR7 / DIRECTOR</div>
          <div>3. 各級累計上限：STAR5 20 萬 / STAR6 30 萬 / STAR7 40 萬 / DIRECTOR 50 萬</div>
          <div>4. VIP 必須 is_vip=true、vip_expires_at 不為空、且不早於結算日</div>
          <div>5. 達上限者停止發放；接近上限者只發到剩餘額度</div>
          <div>6. 位階透過 <code>private.get_effective_vip_tier</code> 判斷，支援 STAR/DIRECTOR 與舊 V1~V8 映射</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">手動執行</CardTitle>
          <CardDescription className="text-xs">
            冪等：同 <code>settlement_date + member_id + bonus_type=national_share</code>{" "}
            不會重複建立；重跑會 skip 已存在資料。
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="space-y-1">
            <Label>結算日期</Label>
            <Input
              type="date"
              value={settlementDate}
              onChange={(e) => setSettlementDate(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label>每日營業總獎勵點</Label>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={dailyTotal}
              onChange={(e) => setDailyTotal(e.target.value)}
              placeholder="例如：1000000"
            />
          </div>
          <div className="flex items-end">
            <Button
              className="w-full"
              disabled={!canSubmit}
              onClick={() => setConfirmOpen(true)}
            >
              {busy ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <PlayCircle className="mr-2 h-4 w-4" />
              )}
              執行全國分紅
            </Button>
          </div>
        </CardContent>
      </Card>

      {summary && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">執行結果</CardTitle>
            <CardDescription className="text-xs">
              <code>bonus_type=national_share</code> 已建立於 <code>bonus_records</code> 與{" "}
              <code>national_bonus_pool_ledger</code>；本流程不寫 wallet /
              reward_wallet_logs / point_transactions。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-4">
              <StatBox label="建立筆數 (waiting_release)" value={summary.created_count} />
              <StatBox label="停發 (cancelled)" value={summary.cancelled_count} tone="danger" />
              <StatBox label="重跑略過 (skipped)" value={summary.skipped_count} tone="muted" />
              <StatBox
                label="總發放獎勵點"
                value={summary.total_distributed_points.toLocaleString()}
              />
            </div>

            <div className="overflow-x-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>星級</TableHead>
                    <TableHead className="text-right">pool_rate</TableHead>
                    <TableHead className="text-right">pool_amount</TableHead>
                    <TableHead className="text-right">eligible</TableHead>
                    <TableHead className="text-right">建立 (waiting_release)</TableHead>
                    <TableHead className="text-right">cancelled (cap_reached)</TableHead>
                    <TableHead className="text-right">skipped</TableHead>
                    <TableHead className="text-right">實發點數</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {summary.by_tier.map((r) => (
                    <TableRow key={r.tier_code}>
                      <TableCell className="font-medium">{r.tier_code}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {(Number(r.pool_rate) * 100).toFixed(2)}%
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {Number(r.pool_amount).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{r.eligible_count}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.distributed_count}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.blocked_count}</TableCell>
                      <TableCell className="text-right tabular-nums">{r.skipped_count}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {Number(r.distributed_points).toLocaleString()}
                      </TableCell>
                    </TableRow>
                  ))}
                  {summary.by_tier.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={8}
                        className="py-6 text-center text-sm text-muted-foreground"
                      >
                        無任何啟用中的 national_bonus_pool_settings（STAR5~DIRECTOR）
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <Link
                  to="/admin/bonuses/daily-details"
                  search={{
                    dateFrom: settlementDate,
                    dateTo: settlementDate,
                    bonusType: "national_share",
                  } as any}
                >
                  <FileText className="mr-2 h-4 w-4" />
                  前往每日獎金明細（預帶 national_share）
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-amber-500/50 bg-amber-500/10">
        <CardContent className="flex items-start gap-2 py-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div className="text-xs text-amber-800 dark:text-amber-300">
            本頁僅產生 <code>bonus_records</code> 與 <code>national_bonus_pool_ledger</code>；wallet /
            reward_wallet_logs / point_transactions 均不會被寫入，實際入帳需經既有 release_bonus_rewards 流程。
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認執行全國分紅？</AlertDialogTitle>
            <AlertDialogDescription>
              <div className="space-y-1 text-sm">
                <div>
                  結算日期：<span className="font-mono">{settlementDate}</span>
                </div>
                <div>
                  每日營業總獎勵點：
                  <span className="font-mono">
                    {Number.isFinite(points) ? points.toLocaleString() : "—"}
                  </span>
                </div>
                <div className="pt-2 text-xs text-muted-foreground">
                  此操作會建立 <code>waiting_release</code> 的 <code>bonus_records</code>
                  ，但<strong>不會直接發放到 wallet</strong>。若該日已執行過，會自動略過已存在資料。
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={runDistribution}>確認執行</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function StatBox({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone?: "danger" | "muted";
}) {
  const cls =
    tone === "danger"
      ? "text-destructive"
      : tone === "muted"
        ? "text-muted-foreground"
        : "text-foreground";
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${cls}`}>{value}</div>
    </div>
  );
}
