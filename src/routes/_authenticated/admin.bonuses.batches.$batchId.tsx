import { Link, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ArrowLeft, AlertTriangle, CheckCircle2, Clock, Coins, Loader2, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ForbiddenScreen } from "@/components/ForbiddenScreen";
import { useAuth, type AppRole } from "@/hooks/use-auth";
import { getSettlementBatchDetail } from "@/lib/bonus.functions";

const ALLOWED_ROLES: AppRole[] = ["super_admin", "admin"];

const TYPE_LABEL: Record<string, string> = {
  referral: "推薦獎勵",
  repurchase: "復購獎勵",
  monthly_vip: "月獎金",
  rank_rebate: "階級回饋",
};

const STATUS_LABEL: Record<string, string> = {
  waiting_release: "待發放",
  released: "已發放",
  failed: "失敗",
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

export const Route = createFileRoute("/_authenticated/admin/bonuses/batches/$batchId")({
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
    return <ForbiddenScreen requiredRoles={ALLOWED_ROLES} pageName="獎金批次明細" />;
  }

  return <BonusBatchDetailPage />;
}

function BonusBatchDetailPage() {
  const { batchId } = Route.useParams();

  const detail = useQuery({
    queryKey: ["bonus-settlement-batch-detail", batchId],
    queryFn: () => getSettlementBatchDetail({ data: { batchId } }),
  });

  const batch = detail.data?.batch;
  const records = detail.data?.records ?? [];
  const members = detail.data?.members ?? {};
  const summary = detail.data?.summary;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <Button asChild variant="ghost" size="sm" className="w-fit px-0">
            <Link to="/admin/bonuses">
              <ArrowLeft className="mr-2 h-4 w-4" />
              返回獎金營運中心
            </Link>
          </Button>
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
              <Coins className="h-6 w-6 text-primary" />
              獎金批次明細
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              檢視結算批次、狀態統計與關聯獎金紀錄。
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={() => detail.refetch()} disabled={detail.isFetching}>
          {detail.isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          重新整理
        </Button>
      </div>

      {detail.isError ? (
        <Card>
          <CardContent className="flex items-center gap-2 p-6 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            <span>{detail.error instanceof Error ? detail.error.message : "批次明細載入失敗"}</span>
          </CardContent>
        </Card>
      ) : detail.isLoading ? (
        <Card>
          <CardContent className="flex items-center justify-center p-10 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            載入批次明細...
          </CardContent>
        </Card>
      ) : batch ? (
        <>
          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard title="待發放" value={summary?.waitingRelease ?? 0} icon={Clock} />
            <MetricCard title="已發放" value={summary?.released ?? 0} icon={CheckCircle2} />
            <MetricCard title="失敗" value={summary?.failed ?? 0} icon={AlertTriangle} tone="danger" />
            <MetricCard title="總點數" value={summary?.totalPoints ?? batch.total_bonus_points ?? 0} icon={Coins} />
          </section>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">批次資訊</CardTitle>
              <CardDescription className="font-mono text-xs">{batch.id}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <InfoItem label="批次類型" value={BATCH_TYPE_LABEL[batch.settlement_type] ?? batch.settlement_type ?? "-"} />
                <InfoItem label="狀態" value={<StatusBadge status={batch.status} />} />
                <InfoItem label="結算期間" value={`${formatDate(batch.settlement_period_start)} - ${formatDate(batch.settlement_period_end)}`} />
                <InfoItem label="總筆數" value={formatNumber(batch.total_members)} />
                <InfoItem label="批次總點數" value={formatNumber(batch.total_bonus_points)} />
                <InfoItem label="建立時間" value={formatDateTime(batch.created_at)} />
                <InfoItem label="完成時間" value={formatDateTime(batch.completed_at)} />
                <InfoItem label="建立人員" value={shortId(batch.created_by)} />
              </div>
              {batch.notes && (
                <div className="mt-4 rounded-md border bg-muted/30 p-3 text-sm">
                  {batch.notes}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">關聯獎金紀錄</CardTitle>
              <CardDescription>此批次下的 bonus_records 清單。</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>會員名稱</TableHead>
                      <TableHead>會員編號</TableHead>
                      <TableHead>獎金類型</TableHead>
                      <TableHead className="text-right">點數</TableHead>
                      <TableHead>狀態</TableHead>
                      <TableHead>預計發放日</TableHead>
                      <TableHead>發放時間</TableHead>
                      <TableHead>失敗時間</TableHead>
                      <TableHead>重發次數</TableHead>
                      <TableHead>發放來源</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {records.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={10} className="py-8 text-center text-muted-foreground">
                          此批次目前沒有獎金紀錄
                        </TableCell>
                      </TableRow>
                    ) : (
                      records.map((record: any) => (
                        <TableRow key={record.id}>
                          <TableCell>{memberName(record.member_id, members)}</TableCell>
                          <TableCell>{memberNo(record.member_id, members)}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{TYPE_LABEL[record.bonus_type] ?? record.bonus_type ?? "-"}</Badge>
                          </TableCell>
                          <TableCell className="text-right font-medium tabular-nums">{formatNumber(record.bonus_points)}</TableCell>
                          <TableCell>
                            <StatusBadge status={record.status} />
                          </TableCell>
                          <TableCell>{formatDate(record.release_date)}</TableCell>
                          <TableCell>{formatDateTime(record.released_at)}</TableCell>
                          <TableCell>{formatDateTime(record.failed_at)}</TableCell>
                          <TableCell className="tabular-nums">{formatNumber(record.release_attempts)}</TableCell>
                          <TableCell>{record.release_source ?? "-"}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}
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

function InfoItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 min-h-6 text-sm font-medium">{value}</div>
    </div>
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
