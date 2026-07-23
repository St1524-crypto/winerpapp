import { Link, createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Coins, History, Loader2, RefreshCw, Search, Send, WalletCards } from "lucide-react";
import { toast } from "sonner";
import { useAuth, type AppRole } from "@/hooks/use-auth";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  getBonusOperationsData,
  getBonusRecalculationDiagnostics,
  manualReleaseRewards,
  releaseDueRewards,
  recalculateWaitingBonusRecords,
  retryFailedBonusRewards,
} from "@/lib/bonus.functions";

const ALLOWED_ROLES: AppRole[] = ["super_admin", "admin"];

type BonusRecordBundle = {
  records: any[];
  members: Record<string, any>;
};

type BonusOperationsSummary = {
  waitingRelease: number;
  released: number;
  failed: number;
  dailyBatches: number;
  monthlyBatches: number;
};

type ConfirmAction =
  | { type: "release-selected"; ids: string[] }
  | { type: "release-one"; ids: string[] }
  | { type: "release-due"; ids: null }
  | { type: "retry-failed"; ids: string[] };

type DiagnosticsForm = {
  orderId: string;
  memberId: string;
  dateFrom: string;
  dateTo: string;
};

const TYPE_LABEL: Record<string, string> = {
  referral: "推薦獎勵",
  repurchase: "復購獎勵",
  monthly_vip: "月獎金",
  rank_rebate: "位階回饋",
};

const STATUS_LABEL: Record<string, string> = {
  waiting_release: "待發放",
  released: "已發放",
  failed: "發放失敗",
  pending: "待結算",
  settled: "已結算",
  cancelled: "已取消",
  processing: "處理中",
  completed: "完成",
};

const BATCH_TYPE_LABEL: Record<string, string> = {
  daily: "日獎金",
  monthly: "月獎金",
  referral: "推薦獎勵",
  repurchase: "復購獎勵",
};

export const Route = createFileRoute("/_authenticated/admin/bonuses/")({
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

  if (!roles.some((role) => ALLOWED_ROLES.includes(role))) {
    return <ForbiddenScreen requiredRoles={ALLOWED_ROLES} pageName="獎金營運中心" />;
  }

  return <BonusOperationsPage />;
}

function BonusOperationsPage() {
  const { roles } = useAuth();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [diagnosticsLoading, setDiagnosticsLoading] = useState(false);
  const [diagnosticsForm, setDiagnosticsForm] = useState<DiagnosticsForm>({
    orderId: "",
    memberId: "",
    dateFrom: "",
    dateTo: "",
  });
  const [diagnostics, setDiagnostics] = useState<any | null>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [selectedWaiting, setSelectedWaiting] = useState<Set<string>>(new Set());
  const [waiting, setWaiting] = useState<BonusRecordBundle>({ records: [], members: {} });
  const [released, setReleased] = useState<BonusRecordBundle>({ records: [], members: {} });
  const [failed, setFailed] = useState<BonusRecordBundle>({ records: [], members: {} });
  const [batches, setBatches] = useState<any[]>([]);
  const [summary, setSummary] = useState<BonusOperationsSummary>({
    waitingRelease: 0,
    released: 0,
    failed: 0,
    dailyBatches: 0,
    monthlyBatches: 0,
  });

  const selectedWaitingRecords = useMemo(
    () => waiting.records.filter((record) => selectedWaiting.has(record.id)),
    [selectedWaiting, waiting.records],
  );

  async function loadData() {
    setLoading(true);
    try {
      const data = await getBonusOperationsData();
      const members = data.members ?? {};

      setWaiting({ records: data.records?.waiting ?? [], members });
      setReleased({ records: data.records?.released ?? [], members });
      setFailed({ records: data.records?.failed ?? [], members });
      setBatches([...(data.batches?.daily ?? []), ...(data.batches?.monthly ?? [])]);
      setSummary({
        waitingRelease: Number(data.summary?.waitingRelease ?? 0),
        released: Number(data.summary?.released ?? 0),
        failed: Number(data.summary?.failed ?? 0),
        dailyBatches: Number(data.summary?.dailyBatches ?? 0),
        monthlyBatches: Number(data.summary?.monthlyBatches ?? 0),
      });
      setSelectedWaiting(new Set());
    } catch (error: any) {
      toast.error(error?.message ?? "讀取獎金營運資料失敗");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  function toggleWaiting(id: string, checked: boolean) {
    setSelectedWaiting((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function runDiagnostics() {
    const payload = {
      orderId: diagnosticsForm.orderId.trim() || undefined,
      memberId: diagnosticsForm.memberId.trim() || undefined,
      dateFrom: diagnosticsForm.dateFrom || undefined,
      dateTo: diagnosticsForm.dateTo || undefined,
    };

    if (!payload.orderId && !payload.memberId) {
      toast.error("請輸入訂單 ID 或會員 ID");
      return;
    }

    setDiagnosticsLoading(true);
    try {
      const result = await getBonusRecalculationDiagnostics({ data: payload });
      setDiagnostics(result);
      toast.success("補算診斷查詢完成");
    } catch (error: any) {
      toast.error(error?.message ?? "補算診斷查詢失敗");
    } finally {
      setDiagnosticsLoading(false);
    }
  }

  async function recalculateWaitingRecord(id: string) {
    setBusy(true);
    try {
      const result = await recalculateWaitingBonusRecords({ data: { recordIds: [id] } });
      toast.success(`已重新計算 ${result.recalculated ?? 1} 筆，點數 ${result.totalBefore ?? 0} → ${result.totalAfter ?? 0}`);
      await loadData();
    } catch (error: any) {
      toast.error(error?.message ?? "重新計算獎金失敗");
    } finally {
      setBusy(false);
    }
  }

  async function executeConfirmedAction() {
    if (!confirmAction) return;
    setBusy(true);
    try {
      if (confirmAction.type === "release-due") {
        await releaseDueRewards();
        toast.success("已送出到期待發放獎金");
      } else if (confirmAction.type === "retry-failed") {
        const result = await retryFailedBonusRewards({ data: { recordIds: confirmAction.ids } });
        toast.success(`已重新發放 ${result.retried ?? confirmAction.ids.length} 筆失敗獎金`);
      } else {
        await manualReleaseRewards({ data: { recordIds: confirmAction.ids } });
        toast.success(`已送出 ${confirmAction.ids.length} 筆手動發放`);
      }
      setConfirmAction(null);
      await loadData();
    } catch (error: any) {
      toast.error(error?.message ?? "發放操作失敗");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Coins className="h-6 w-6 text-primary" />
            獎金營運中心
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            管理日獎金、月獎金、推薦獎勵、復購獎勵與獎勵點發放狀態。
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link to="/admin/bonuses/daily-details">
              <Search className="mr-2 h-4 w-4" />
              每日獎金明細表
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/admin/bonuses/monthly-details">
              <Search className="mr-2 h-4 w-4" />
              月獎金明細表
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/admin/bonuses/summary">
              <Search className="mr-2 h-4 w-4" />
              獎金總表
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/admin/bonuses/member-details">
              <Search className="mr-2 h-4 w-4" />
              會員日/月獎金明細
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/admin/bonuses/vip-detail">
              <Search className="mr-2 h-4 w-4" />
              VIP 個人明細
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/admin/bonuses/daily-summary-split">
              <Search className="mr-2 h-4 w-4" />
              日總表（分開）
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/admin/bonuses/daily-summary-merged">
              <Search className="mr-2 h-4 w-4" />
              日總表（合計）
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/admin/bonuses/monthly-summary">
              <Search className="mr-2 h-4 w-4" />
              月總表
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/admin/bonuses/monthly-detail-split">
              <Search className="mr-2 h-4 w-4" />
              月明細（分開/列印）
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/admin/bonuses/national-share">
              <Search className="mr-2 h-4 w-4" />
              全國分紅（月結）
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/admin/bonuses/national-share-settings">
              <Search className="mr-2 h-4 w-4" />
              全國分紅設定（每月累計上限）
            </Link>
          </Button>
          <Button asChild variant="default">
            <Link to="/admin/bonuses/daily-settlement">
              <CheckCircle2 className="mr-2 h-4 w-4" />
              每日獎金結算監控
            </Link>
          </Button>
          <Button asChild variant="default">
            <Link to="/admin/bonuses/reconciliation">
              <CheckCircle2 className="mr-2 h-4 w-4" />
              補結驗證報告
            </Link>
          </Button>
          <Button asChild variant="destructive">
            <Link to="/admin/bonuses/recalculation">
              <RefreshCw className="mr-2 h-4 w-4" />
              獎金重算管理
            </Link>
          </Button>

          <Button variant="outline" onClick={loadData} disabled={loading || busy}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            重新整理
          </Button>
        </div>
      </div>

      <section>
        <h2 className="sr-only">總覽</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard title="待發放獎金" value={summary.waitingRelease} icon={Send} />
          <MetricCard title="已發放獎金" value={summary.released} icon={CheckCircle2} />
          <MetricCard title="失敗獎金" value={summary.failed} icon={AlertTriangle} tone="danger" />
          <MetricCard title="批次紀錄" value={summary.dailyBatches + summary.monthlyBatches} icon={History} />
        </div>
      </section>

      <ManualOperationsCard
        busy={busy}
        selectedCount={selectedWaiting.size}
        selectedPoints={sumPoints(selectedWaitingRecords)}
        onReleaseSelected={() => setConfirmAction({ type: "release-selected", ids: Array.from(selectedWaiting) })}
        onReleaseDue={() => setConfirmAction({ type: "release-due", ids: null })}
      />

      <RecalculationDiagnosticsCard
        form={diagnosticsForm}
        loading={diagnosticsLoading}
        result={diagnostics}
        onChange={setDiagnosticsForm}
        onSubmit={runDiagnostics}
      />

      <BonusRecordTable
        title="待發放獎金"
        description="僅列出 bonus_records.status = waiting_release 的紀錄，可選擇後手動發放。"
        records={waiting.records}
        members={waiting.members}
        mode="waiting"
        loading={loading}
        selected={selectedWaiting}
        onToggle={toggleWaiting}
        onReleaseOne={(id) => setConfirmAction({ type: "release-one", ids: [id] })}
        onRecalculate={roles.includes("super_admin") ? recalculateWaitingRecord : undefined}
      />

      <BonusRecordTable
        title="已發放獎金"
        description="僅列出 bonus_records.status = released 的紀錄。已發放資料不提供再次發放操作。"
        records={released.records}
        members={released.members}
        mode="released"
        loading={loading}
      />

      <BonusRecordTable
        title="失敗獎金"
        description="僅列出 bonus_records.status = failed 的紀錄。重新發放會透過既有失敗重試流程處理。"
        records={failed.records}
        members={failed.members}
        mode="failed"
        loading={loading}
        onRetryFailed={(id) => setConfirmAction({ type: "retry-failed", ids: [id] })}
      />

      <BatchTable rows={batches} loading={loading} />

      <ConfirmReleaseDialog
        action={confirmAction}
        records={waiting.records}
        failedRecords={failed.records}
        busy={busy}
        onOpenChange={(open) => {
          if (!open && !busy) setConfirmAction(null);
        }}
        onConfirm={executeConfirmedAction}
      />
    </div>
  );
}

function ManualOperationsCard({
  busy,
  selectedCount,
  selectedPoints,
  onReleaseSelected,
  onReleaseDue,
}: {
  busy: boolean;
  selectedCount: number;
  selectedPoints: number;
  onReleaseSelected: () => void;
  onReleaseDue: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">手動操作區</CardTitle>
        <CardDescription>操作會呼叫既有 reward release API，不修改日獎金、月獎金或 wallet release 核心邏輯。</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-3">
        <div className="rounded-md border p-4">
          <div className="text-sm text-muted-foreground">已選待發放</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{selectedCount}</div>
          <div className="mt-1 text-xs text-muted-foreground">{formatNumber(selectedPoints)} 點</div>
        </div>
        <Button className="h-auto min-h-20 justify-start" disabled={busy || selectedCount === 0} onClick={onReleaseSelected}>
          <Send className="mr-2 h-4 w-4" />
          批次發放選取獎金
        </Button>
        <Button variant="outline" className="h-auto min-h-20 justify-start" disabled={busy} onClick={onReleaseDue}>
          <WalletCards className="mr-2 h-4 w-4" />
          發放所有到期獎勵點
        </Button>
      </CardContent>
    </Card>
  );
}

function RecalculationDiagnosticsCard({
  form,
  loading,
  result,
  onChange,
  onSubmit,
}: {
  form: DiagnosticsForm;
  loading: boolean;
  result: any | null;
  onChange: (form: DiagnosticsForm) => void;
  onSubmit: () => void;
}) {
  const orderDiagnostics = result?.orderDiagnostics;
  const memberDiagnostics = result?.memberDiagnostics;
  const orderRecords = result?.orderBonusRecords ?? [];
  const recentMemberRecords = memberDiagnostics?.recent_bonus_records ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">會員獎金補算診斷</CardTitle>
        <CardDescription>
          只查詢訂單或會員是否已有 bonus_records，用於補算前判斷漏算與重複風險，不會修改資料。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <div className="space-y-2 xl:col-span-2">
            <Label htmlFor="bonus-diagnostics-order">訂單 ID</Label>
            <Input
              id="bonus-diagnostics-order"
              className="font-mono"
              value={form.orderId}
              onChange={(event) => onChange({ ...form, orderId: event.target.value })}
              placeholder="sales_orders.id"
            />
          </div>
          <div className="space-y-2 xl:col-span-2">
            <Label htmlFor="bonus-diagnostics-member">會員 ID</Label>
            <Input
              id="bonus-diagnostics-member"
              className="font-mono"
              value={form.memberId}
              onChange={(event) => onChange({ ...form, memberId: event.target.value })}
              placeholder="profiles.id"
            />
          </div>
          <div className="flex items-end">
            <Button className="w-full" onClick={onSubmit} disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
              查詢
            </Button>
          </div>
          <div className="space-y-2">
            <Label htmlFor="bonus-diagnostics-date-from">開始日期</Label>
            <Input
              id="bonus-diagnostics-date-from"
              type="date"
              value={form.dateFrom}
              onChange={(event) => onChange({ ...form, dateFrom: event.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bonus-diagnostics-date-to">結束日期</Label>
            <Input
              id="bonus-diagnostics-date-to"
              type="date"
              value={form.dateTo}
              onChange={(event) => onChange({ ...form, dateTo: event.target.value })}
            />
          </div>
        </div>

        {result && (
          <div className="space-y-4 rounded-md border p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={orderDiagnostics?.may_need_recalculation ? "destructive" : "secondary"}>
                {orderDiagnostics?.may_need_recalculation ? "可能需要補算" : "未判定需補算"}
              </Badge>
              <Badge variant={orderDiagnostics?.duplicate_risk ? "destructive" : "outline"}>
                {orderDiagnostics?.duplicate_risk ? "有重複風險" : "未發現重複風險"}
              </Badge>
              {memberDiagnostics?.has_failed_records && <Badge variant="destructive">會員有失敗紀錄</Badge>}
              {memberDiagnostics?.has_unreleased_records && <Badge variant="secondary">會員有未發放紀錄</Badge>}
            </div>

            {result.order && (
              <div className="grid gap-3 md:grid-cols-4">
                <ReadOnlyField label="訂單編號" value={result.order.order_no ?? shortId(result.order.id)} />
                <ReadOnlyField label="付款狀態" value={result.order.payment_status} />
                <ReadOnlyField label="訂單類型" value={result.order.order_type} />
                <ReadOnlyField label="訂單金額" value={formatNumber(result.order.total_amount)} />
              </div>
            )}

            {orderDiagnostics && (
              <div className="grid gap-3 md:grid-cols-4">
                <ReadOnlyField label="訂單獎金筆數" value={orderDiagnostics.bonus_record_count} />
                <ReadOnlyField label="診斷原因" value={orderDiagnostics.reason} />
                <ReadOnlyField label="已有獎金紀錄" value={orderDiagnostics.has_bonus_records ? "是" : "否"} />
                <ReadOnlyField label="重複風險數" value={orderDiagnostics.duplicate_risks?.length ?? 0} />
              </div>
            )}

            {result.member && (
              <div className="grid gap-3 md:grid-cols-4">
                <ReadOnlyField label="會員名稱" value={result.member.name ?? "未命名會員"} />
                <ReadOnlyField label="會員編號" value={result.member.member_no ?? shortId(result.member.id)} />
                <ReadOnlyField label="會員狀態" value={result.member.member_status ?? "-"} />
                <ReadOnlyField label="VIP" value={result.member.is_vip ? "是" : "否"} />
              </div>
            )}

            {memberDiagnostics && (
              <div className="grid gap-3 md:grid-cols-5">
                <ReadOnlyField label="待結算" value={memberDiagnostics.summary?.pending ?? 0} />
                <ReadOnlyField label="待發放" value={memberDiagnostics.summary?.waiting_release ?? 0} />
                <ReadOnlyField label="已發放" value={memberDiagnostics.summary?.released ?? 0} />
                <ReadOnlyField label="失敗" value={memberDiagnostics.summary?.failed ?? 0} />
                <ReadOnlyField label="總點數" value={formatNumber(memberDiagnostics.summary?.total_points ?? 0)} />
              </div>
            )}

            <MiniBonusRecordList title="訂單相關獎金紀錄" records={orderRecords} />
            <MiniBonusRecordList title="會員最近獎金紀錄" records={recentMemberRecords} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="rounded-md bg-muted/50 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 break-words text-sm font-medium">{value === null || value === undefined || value === "" ? "-" : String(value)}</div>
    </div>
  );
}

function MiniBonusRecordList({ title, records }: { title: string; records: any[] }) {
  if (!records.length) return null;

  return (
    <div>
      <div className="mb-2 text-sm font-medium">{title}</div>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>紀錄ID</TableHead>
              <TableHead>獎金類型</TableHead>
              <TableHead>狀態</TableHead>
              <TableHead className="text-right">點數</TableHead>
              <TableHead>建立時間</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.slice(0, 10).map((record) => (
              <TableRow key={record.id}>
                <TableCell className="font-mono text-xs">{shortId(record.id)}</TableCell>
                <TableCell>{TYPE_LABEL[record.bonus_type] ?? record.bonus_type ?? "-"}</TableCell>
                <TableCell>
                  <StatusBadge status={record.status} />
                </TableCell>
                <TableCell className="text-right tabular-nums">{formatNumber(record.bonus_points)}</TableCell>
                <TableCell>{formatDateTime(record.created_at)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function MetricCard({ title, value, icon: Icon, tone }: { title: string; value: number; icon: any; tone?: "danger" }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-5">
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{formatNumber(value)}</p>
        </div>
        <Icon className={tone === "danger" ? "h-5 w-5 text-destructive" : "h-5 w-5 text-primary"} />
      </CardContent>
    </Card>
  );
}

function BonusRecordTable({
  title,
  description,
  records,
  members,
  mode,
  loading,
  selected,
  onToggle,
  onReleaseOne,
  onRecalculate,
  onRetryFailed,
}: {
  title: string;
  description: string;
  records: any[];
  members: Record<string, any>;
  mode: "waiting" | "released" | "failed";
  loading: boolean;
  selected?: Set<string>;
  onToggle?: (id: string, checked: boolean) => void;
  onReleaseOne?: (id: string) => void;
  onRecalculate?: (id: string) => void;
  onRetryFailed?: (id: string) => void;
}) {
  const isWaiting = mode === "waiting";
  const isReleased = mode === "released";
  const isFailed = mode === "failed";
  const colSpan = isWaiting ? 10 : 7;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                {isWaiting && <TableHead className="w-10" />}
                <TableHead>會員名稱</TableHead>
                <TableHead>會員編號</TableHead>
                <TableHead>獎金類型</TableHead>
                <TableHead className="text-right">點數</TableHead>
                {isWaiting && <TableHead>結算日期</TableHead>}
                {isWaiting && <TableHead>結算批次</TableHead>}
                {isWaiting && <TableHead>預計發放日</TableHead>}
                {isWaiting && <TableHead>狀態</TableHead>}
                {isReleased && <TableHead>發放時間</TableHead>}
                {isReleased && <TableHead>發放批次</TableHead>}
                {isReleased && <TableHead>錢包異動紀錄</TableHead>}
                {isFailed && <TableHead>失敗原因</TableHead>}
                {isFailed && <TableHead>失敗時間</TableHead>}
                {isFailed && <TableHead>是否可重新發放</TableHead>}
                {isWaiting && <TableHead className="text-right">操作</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={colSpan} className="py-8 text-center text-muted-foreground">
                    載入中...
                  </TableCell>
                </TableRow>
              ) : records.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={colSpan} className="py-8 text-center text-muted-foreground">
                    目前沒有資料
                  </TableCell>
                </TableRow>
              ) : (
                records.map((record) => (
                  <TableRow key={record.id}>
                    {isWaiting && (
                      <TableCell>
                        <Checkbox
                          checked={selected?.has(record.id) ?? false}
                          onCheckedChange={(checked) => onToggle?.(record.id, Boolean(checked))}
                          aria-label={`選取 ${memberName(record.member_id, members)}`}
                        />
                      </TableCell>
                    )}
                    <TableCell>{memberName(record.member_id, members)}</TableCell>
                    <TableCell>{memberNo(record.member_id, members)}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{TYPE_LABEL[record.bonus_type] ?? record.bonus_type ?? "-"}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">{formatNumber(record.bonus_points)}</TableCell>
                    {isWaiting && <TableCell>{formatDate(record.settlement_date)}</TableCell>}
                    {isWaiting && <TableCell className="font-mono text-xs">{shortId(record.settlement_batch_id)}</TableCell>}
                    {isWaiting && <TableCell>{formatDate(record.release_date)}</TableCell>}
                    {isWaiting && (
                      <TableCell>
                        <StatusBadge status={record.status} />
                      </TableCell>
                    )}
                    {isReleased && <TableCell>{formatDateTime(record.released_at)}</TableCell>}
                    {isReleased && <TableCell className="font-mono text-xs">{shortId(record.settlement_batch_id)}</TableCell>}
                    {isReleased && (
                      <TableCell>
                        <Badge variant="secondary" className="font-mono text-xs">
                          reference:{shortId(record.id)}
                        </Badge>
                      </TableCell>
                    )}
                    {isFailed && <TableCell className="max-w-sm truncate">{record.fail_reason ?? "-"}</TableCell>}
                    {isFailed && <TableCell>{formatDateTime(record.updated_at ?? record.created_at)}</TableCell>}
                    {isFailed && (
                      <TableCell>
                        <Button size="sm" variant="outline" onClick={() => onRetryFailed?.(record.id)}>
                          重新發放
                        </Button>
                      </TableCell>
                    )}
                    {isWaiting && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {onRecalculate && (
                            <Button size="sm" variant="outline" onClick={() => onRecalculate(record.id)}>
                              重新計算
                            </Button>
                          )}
                          <Button size="sm" variant="outline" onClick={() => onReleaseOne?.(record.id)}>
                            單筆發放
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function BatchTable({ rows, loading }: { rows: any[]; loading: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">批次紀錄</CardTitle>
        <CardDescription>顯示現有 bonus_settlement_batches。成功/失敗筆數目前 schema 尚未提供，下一階段補齊。</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>批次ID</TableHead>
                <TableHead>批次類型</TableHead>
                <TableHead>結算期間</TableHead>
                <TableHead>狀態</TableHead>
                <TableHead className="text-right">總筆數</TableHead>
                <TableHead className="text-right">總點數</TableHead>
                <TableHead className="text-right">成功筆數</TableHead>
                <TableHead className="text-right">失敗筆數</TableHead>
                <TableHead>建立時間</TableHead>
                <TableHead>完成時間</TableHead>
                <TableHead className="text-right">明細</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={11} className="py-8 text-center text-muted-foreground">
                    載入中...
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={11} className="py-8 text-center text-muted-foreground">
                    目前沒有批次紀錄
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-xs">{shortId(row.id)}</TableCell>
                    <TableCell>{BATCH_TYPE_LABEL[row.settlement_type] ?? row.settlement_type ?? "-"}</TableCell>
                    <TableCell>{formatDate(row.settlement_period_start)} - {formatDate(row.settlement_period_end)}</TableCell>
                    <TableCell>
                      <StatusBadge status={row.status} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(row.total_members)}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatNumber(row.total_bonus_points)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">下一階段</TableCell>
                    <TableCell className="text-right text-muted-foreground">下一階段</TableCell>
                    <TableCell>{formatDateTime(row.created_at)}</TableCell>
                    <TableCell>{formatDateTime(row.completed_at)}</TableCell>
                    <TableCell className="text-right">
                      <Button asChild size="sm" variant="outline">
                        <Link to="/admin/bonuses/batches/$batchId" params={{ batchId: row.id }}>
                          查看
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function ConfirmReleaseDialog({
  action,
  records,
  failedRecords,
  busy,
  onOpenChange,
  onConfirm,
}: {
  action: ConfirmAction | null;
  records: any[];
  failedRecords: any[];
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const sourceRecords = action?.type === "retry-failed" ? failedRecords : records;
  const selectedRecords = action?.ids ? sourceRecords.filter((record) => action.ids?.includes(record.id)) : [];
  const count = action?.ids ? action.ids.length : 0;
  const points = action?.ids ? sumPoints(selectedRecords) : null;
  const title = action?.type === "release-due"
    ? "確認發放所有到期獎勵點？"
    : action?.type === "retry-failed"
      ? "確認重新發放失敗獎金？"
      : "確認手動發放？";
  const description = action?.type === "release-due"
    ? "系統會呼叫既有 releaseDueRewards，只處理到期且仍為待發放狀態的獎金。"
    : action?.type === "retry-failed"
      ? `系統會呼叫既有 retryFailedBonusRewards 重新發放 ${count} 筆失敗獎金，合計 ${formatNumber(points)} 點。只有 failed 狀態紀錄會被重試。`
      : `系統會呼叫既有 manualReleaseRewards 發放 ${count} 筆待發放獎金，合計 ${formatNumber(points)} 點。已發放紀錄不會被再次發放。`;

  return (
    <AlertDialog open={!!action} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>取消</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={busy}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            確認發放
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function StatusBadge({ status }: { status?: string | null }) {
  const variant = status === "failed" ? "destructive" : status === "released" || status === "completed" ? "default" : "secondary";
  return <Badge variant={variant}>{STATUS_LABEL[status ?? ""] ?? status ?? "-"}</Badge>;
}

function memberName(memberId: string | null | undefined, members: Record<string, any>) {
  if (!memberId) return "-";
  return members[memberId]?.name || "未命名會員";
}

function memberNo(memberId: string | null | undefined, members: Record<string, any>) {
  if (!memberId) return "-";
  return members[memberId]?.member_no || shortId(memberId);
}

function shortId(value: unknown) {
  if (!value) return "-";
  const text = String(value);
  return text.length > 8 ? text.slice(0, 8) : text;
}

function sumPoints(records: any[]) {
  return records.reduce((sum, record) => sum + Number(record.bonus_points ?? 0), 0);
}

function formatNumber(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number.toLocaleString("zh-TW") : "0";
}

function formatDate(value: unknown) {
  if (!value) return "-";
  return String(value).slice(0, 10);
}

function formatDateTime(value: unknown) {
  if (!value) return "-";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("zh-TW", { hour12: false });
}
