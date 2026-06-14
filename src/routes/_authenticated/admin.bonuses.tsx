import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Coins, History, Loader2, RefreshCw, Send, WalletCards } from "lucide-react";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  listBonusRecords,
  listSettlementBatches,
  manualReleaseRewards,
  releaseDueRewards,
} from "@/lib/bonus.functions";

const ALLOWED_ROLES: AppRole[] = ["super_admin", "admin"];

type BonusRecordBundle = {
  records: any[];
  members: Record<string, any>;
};

type ConfirmAction =
  | { type: "release-selected"; ids: string[] }
  | { type: "release-one"; ids: string[] }
  | { type: "release-due"; ids: null };

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

export const Route = createFileRoute("/_authenticated/admin/bonuses")({
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
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [selectedWaiting, setSelectedWaiting] = useState<Set<string>>(new Set());
  const [waiting, setWaiting] = useState<BonusRecordBundle>({ records: [], members: {} });
  const [released, setReleased] = useState<BonusRecordBundle>({ records: [], members: {} });
  const [failed, setFailed] = useState<BonusRecordBundle>({ records: [], members: {} });
  const [batches, setBatches] = useState<any[]>([]);

  const selectedWaitingRecords = useMemo(
    () => waiting.records.filter((record) => selectedWaiting.has(record.id)),
    [selectedWaiting, waiting.records],
  );

  async function loadData() {
    setLoading(true);
    try {
      const [waitingData, releasedData, failedData, batchData] = await Promise.all([
        listBonusRecords({ data: { status: "waiting_release", limit: 200 } }),
        listBonusRecords({ data: { status: "released", limit: 200 } }),
        listBonusRecords({ data: { status: "failed", limit: 200 } }),
        listSettlementBatches(),
      ]);

      setWaiting(normalizeBundle(waitingData));
      setReleased(normalizeBundle(releasedData));
      setFailed(normalizeBundle(failedData));
      setBatches(batchData ?? []);
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

  async function executeConfirmedAction() {
    if (!confirmAction) return;
    setBusy(true);
    try {
      if (confirmAction.type === "release-due") {
        await releaseDueRewards();
        toast.success("已送出到期待發放獎金");
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
        <Button variant="outline" onClick={loadData} disabled={loading || busy}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          重新整理
        </Button>
      </div>

      <section>
        <h2 className="sr-only">總覽</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard title="待發放獎金" value={waiting.records.length} icon={Send} />
          <MetricCard title="已發放獎金" value={released.records.length} icon={CheckCircle2} />
          <MetricCard title="失敗獎金" value={failed.records.length} icon={AlertTriangle} tone="danger" />
          <MetricCard title="批次紀錄" value={batches.length} icon={History} />
        </div>
      </section>

      <ManualOperationsCard
        busy={busy}
        selectedCount={selectedWaiting.size}
        selectedPoints={sumPoints(selectedWaitingRecords)}
        onReleaseSelected={() => setConfirmAction({ type: "release-selected", ids: Array.from(selectedWaiting) })}
        onReleaseDue={() => setConfirmAction({ type: "release-due", ids: null })}
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
        description="僅列出 bonus_records.status = failed 的紀錄。重新發放會在下一階段接上完整失敗重試流程。"
        records={failed.records}
        members={failed.members}
        mode="failed"
        loading={loading}
      />

      <BatchTable rows={batches} loading={loading} />

      <ConfirmReleaseDialog
        action={confirmAction}
        records={waiting.records}
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
}) {
  const isWaiting = mode === "waiting";
  const isReleased = mode === "released";
  const isFailed = mode === "failed";
  const colSpan = isWaiting ? 9 : 7;

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
                        <Badge variant="secondary">下一階段開放</Badge>
                      </TableCell>
                    )}
                    {isWaiting && (
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => onReleaseOne?.(record.id)}>
                          單筆發放
                        </Button>
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={10} className="py-8 text-center text-muted-foreground">
                    載入中...
                  </TableCell>
                </TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="py-8 text-center text-muted-foreground">
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
  busy,
  onOpenChange,
  onConfirm,
}: {
  action: ConfirmAction | null;
  records: any[];
  busy: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const selectedRecords = action?.ids ? records.filter((record) => action.ids?.includes(record.id)) : [];
  const count = action?.ids ? action.ids.length : 0;
  const points = action?.ids ? sumPoints(selectedRecords) : null;
  const title = action?.type === "release-due" ? "確認發放所有到期獎勵點？" : "確認手動發放？";
  const description = action?.type === "release-due"
    ? "系統會呼叫既有 releaseDueRewards，只處理到期且仍為待發放狀態的獎金。"
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

function normalizeBundle(input: any): BonusRecordBundle {
  return {
    records: input?.records ?? [],
    members: input?.members ?? {},
  };
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
