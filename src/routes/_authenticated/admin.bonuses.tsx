import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth, type AppRole } from "@/hooks/use-auth";
import { ForbiddenScreen } from "@/components/ForbiddenScreen";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Coins,
  History,
  Loader2,
  Play,
  RefreshCw,
  Send,
} from "lucide-react";
import { toast } from "sonner";
import {
  listBonusRecords,
  listSettlementBatches,
  manualReleaseRewards,
  releaseDueRewards,
  runDailySettlement,
  runMonthlySettlement,
} from "@/lib/bonus.functions";

const ALLOW: AppRole[] = ["super_admin", "admin", "finance"];

type BonusRecordBundle = {
  records: any[];
  members: Record<string, any>;
};

const TYPE_LABEL: Record<string, string> = {
  referral: "推薦獎勵",
  repurchase: "復購獎勵",
  monthly_vip: "月獎金",
  rank_rebate: "位階回饋",
};

const STATUS_LABEL: Record<string, string> = {
  processing: "processing",
  completed: "completed",
  failed: "failed",
  pending: "待結算",
  waiting_release: "待發放",
  released: "已發放",
  cancelled: "已取消",
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
  if (!roles.some((r) => ALLOW.includes(r))) {
    return <ForbiddenScreen requiredRoles={ALLOW} pageName="獎金營運中心" />;
  }
  return <BonusOperationsCenter />;
}

function BonusOperationsCenter() {
  const [loading, setLoading] = useState(true);
  const [batches, setBatches] = useState<any[]>([]);
  const [waiting, setWaiting] = useState<BonusRecordBundle>({ records: [], members: {} });
  const [released, setReleased] = useState<BonusRecordBundle>({ records: [], members: {} });
  const [failed, setFailed] = useState<BonusRecordBundle>({ records: [], members: {} });
  const [selectedWaiting, setSelectedWaiting] = useState<Set<string>>(new Set());
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [settlementMonth, setSettlementMonth] = useState(previousMonthInput());

  async function loadAll() {
    setLoading(true);
    try {
      const [batchRows, waitingRows, releasedRows, failedRows] = await Promise.all([
        listSettlementBatches(),
        listBonusRecords({ data: { status: "waiting_release", limit: 200 } }),
        listBonusRecords({ data: { status: "released", limit: 200 } }),
        listBonusRecords({ data: { status: "failed", limit: 200 } }),
      ]);
      setBatches(batchRows ?? []);
      setWaiting(normalizeBundle(waitingRows));
      setReleased(normalizeBundle(releasedRows));
      setFailed(normalizeBundle(failedRows));
      setSelectedWaiting(new Set());
    } catch (error: any) {
      toast.error(error?.message ?? "讀取獎金營運資料失敗");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  const dailyBatches = useMemo(
    () => batches.filter((batch) => batch.settlement_type === "daily"),
    [batches],
  );
  const monthlyBatches = useMemo(
    () => batches.filter((batch) => batch.settlement_type === "monthly"),
    [batches],
  );

  async function runAction(actionKey: string, label: string, action: () => Promise<any>) {
    setBusyAction(actionKey);
    try {
      await action();
      toast.success(`${label}完成`);
      await loadAll();
    } catch (error: any) {
      toast.error(error?.message ?? `${label}失敗`);
    } finally {
      setBusyAction(null);
    }
  }

  function toggleWaitingRecord(id: string, checked: boolean) {
    setSelectedWaiting((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
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
            日獎金、月獎金與獎勵點發放狀態總覽。
          </p>
        </div>
        <Button variant="outline" onClick={loadAll} disabled={loading || busyAction !== null}>
          <RefreshCw className="mr-2 h-4 w-4" />
          重新整理
        </Button>
      </div>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <MetricCard title="日獎金批次數" value={dailyBatches.length} icon={CalendarClock} />
        <MetricCard title="月獎金批次數" value={monthlyBatches.length} icon={History} />
        <MetricCard title="待發放筆數" value={waiting.records.length} icon={Send} />
        <MetricCard title="已發放筆數" value={released.records.length} icon={CheckCircle2} />
        <MetricCard title="失敗筆數" value={failed.records.length} icon={AlertTriangle} tone="danger" />
      </section>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">手動操作</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-2">
            <Label>日獎金結算</Label>
            <Button
              className="w-full justify-start"
              disabled={busyAction !== null}
              onClick={() => runAction("daily", "手動日結算", () => runDailySettlement())}
            >
              {busyAction === "daily" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
              手動日結算
            </Button>
          </div>
          <div className="space-y-2">
            <Label htmlFor="monthly-settlement-month">月獎金結算月份</Label>
            <div className="flex gap-2">
              <Input
                id="monthly-settlement-month"
                type="month"
                value={settlementMonth}
                onChange={(event) => setSettlementMonth(event.target.value)}
              />
              <Button
                disabled={busyAction !== null || !settlementMonth}
                onClick={() =>
                  runAction("monthly", "手動月結算", () =>
                    runMonthlySettlement({ data: { yyyymm: settlementMonth.replace("-", "") } }),
                  )
                }
              >
                {busyAction === "monthly" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                結算
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label>獎勵點發放</Label>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                disabled={busyAction !== null}
                onClick={() => runAction("due-release", "到期獎勵點發放", () => releaseDueRewards())}
              >
                {busyAction === "due-release" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                發放到期
              </Button>
              <Button
                className="flex-1"
                disabled={busyAction !== null || selectedWaiting.size === 0}
                onClick={() =>
                  runAction("manual-release", "手動發放", () =>
                    manualReleaseRewards({ data: { recordIds: Array.from(selectedWaiting) } }),
                  )
                }
              >
                {busyAction === "manual-release" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                發放勾選
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <BatchTable title="日獎金批次" rows={dailyBatches} />
        <BatchTable title="月獎金批次" rows={monthlyBatches} />
      </div>

      <RecordTable
        title="待發放獎勵點"
        rows={waiting.records}
        members={waiting.members}
        timeLabel="預計發放日"
        timeKey="release_date"
        selectable
        selected={selectedWaiting}
        onToggle={toggleWaitingRecord}
        loading={loading}
      />
      <RecordTable
        title="已發放獎勵點"
        rows={released.records}
        members={released.members}
        timeLabel="發放時間"
        timeKey="released_at"
        loading={loading}
      />
      <RecordTable
        title="失敗紀錄"
        rows={failed.records}
        members={failed.members}
        timeLabel="時間"
        timeKey="updated_at"
        showFailureReason
        loading={loading}
      />
    </div>
  );
}

function MetricCard({ title, value, icon: Icon, tone }: { title: string; value: number; icon: any; tone?: "danger" }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-5">
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
        </div>
        <div className={tone === "danger" ? "text-destructive" : "text-primary"}>
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}

function BatchTable({ title, rows }: { title: string; rows: any[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>狀態</TableHead>
              <TableHead>結算月份</TableHead>
              <TableHead>點數</TableHead>
              <TableHead>建立時間</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                  目前沒有批次資料
                </TableCell>
              </TableRow>
            ) : (
              rows.slice(0, 12).map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <StatusBadge status={row.status} />
                  </TableCell>
                  <TableCell>{formatPeriod(row)}</TableCell>
                  <TableCell className="tabular-nums">{formatNumber(row.total_bonus_points)}</TableCell>
                  <TableCell>{formatDateTime(row.created_at)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function RecordTable({
  title,
  rows,
  members,
  timeLabel,
  timeKey,
  selectable,
  selected,
  onToggle,
  showFailureReason,
}: {
  title: string;
  rows: any[];
  members: Record<string, any>;
  timeLabel: string;
  timeKey: string;
  selectable?: boolean;
  selected?: Set<string>;
  onToggle?: (id: string, checked: boolean) => void;
  showFailureReason?: boolean;
  loading?: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              {selectable && <TableHead className="w-10" />}
              <TableHead>會員</TableHead>
              <TableHead>獎金類型</TableHead>
              <TableHead>點數</TableHead>
              {showFailureReason && <TableHead>失敗原因</TableHead>}
              <TableHead>{timeLabel}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={selectable ? (showFailureReason ? 6 : 5) : (showFailureReason ? 5 : 4)} className="py-8 text-center text-muted-foreground">
                  目前沒有資料
                </TableCell>
              </TableRow>
            ) : (
              rows.slice(0, 20).map((row) => (
                <TableRow key={row.id}>
                  {selectable && (
                    <TableCell>
                      <Checkbox
                        checked={selected?.has(row.id) ?? false}
                        onCheckedChange={(checked) => onToggle?.(row.id, Boolean(checked))}
                        aria-label={`選取 ${memberLabel(row.member_id, members)}`}
                      />
                    </TableCell>
                  )}
                  <TableCell>{memberLabel(row.member_id, members)}</TableCell>
                  <TableCell>{TYPE_LABEL[row.bonus_type] ?? row.bonus_type ?? "-"}</TableCell>
                  <TableCell className="tabular-nums">{formatNumber(row.bonus_points)}</TableCell>
                  {showFailureReason && <TableCell className="max-w-sm truncate">{row.fail_reason ?? row.failure_reason ?? "-"}</TableCell>}
                  <TableCell>{timeKey === "release_date" ? formatDate(row[timeKey]) : formatDateTime(row[timeKey] ?? row.created_at)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status?: string }) {
  const variant = status === "failed" ? "destructive" : status === "completed" ? "default" : "secondary";
  return <Badge variant={variant}>{STATUS_LABEL[status ?? ""] ?? status ?? "-"}</Badge>;
}

function normalizeBundle(value: any): BonusRecordBundle {
  return {
    records: Array.isArray(value?.records) ? value.records : [],
    members: value?.members ?? {},
  };
}

function previousMonthInput() {
  const date = new Date();
  date.setMonth(date.getMonth() - 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function memberLabel(memberId: string | null | undefined, members: Record<string, any>) {
  if (!memberId) return "-";
  const member = members[memberId];
  if (!member) return memberId;
  const name = member.name || "未命名會員";
  return member.member_no ? `${name} (${member.member_no})` : name;
}

function formatPeriod(row: any) {
  const date = row.settlement_period_start ?? row.period_start ?? row.created_at;
  return typeof date === "string" && date.length >= 7 ? date.slice(0, 7) : "-";
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
