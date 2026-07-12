import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2, Search, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useAuth, type AppRole } from "@/hooks/use-auth";
import { ForbiddenScreen } from "@/components/ForbiddenScreen";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listMemberBonusDetails, getBonusRecordDetail } from "@/lib/bonus.functions";
import {
  bonusStatusLabel, bonusTypeLabel, BONUS_STATUS_VARIANT,
  DAILY_BONUS_TYPE_OPTIONS, MONTHLY_BONUS_TYPE_OPTIONS,
} from "@/lib/bonus-labels";

const ALLOWED_ROLES: AppRole[] = ["super_admin", "admin", "finance"];

type Category = "daily" | "monthly";

const STATUS_OPTIONS = [
  { value: "pending", label: "待結算" },
  { value: "waiting_release", label: "待發放" },
  { value: "released", label: "已成功發放" },
  { value: "failed", label: "發放失敗" },
  { value: "cancelled", label: "已取消" },
];

export const Route = createFileRoute("/_authenticated/admin/bonuses/member-details")({
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
  if (!roles.some((r) => ALLOWED_ROLES.includes(r))) {
    return <ForbiddenScreen requiredRoles={ALLOWED_ROLES} pageName="會員獎金明細" />;
  }
  return <MemberBonusDetailsPage />;
}

type Filters = {
  memberName: string;
  memberNo: string;
  memberId: string;
  bonusType: string;
  status: string;
  settlementBatchId: string;
  dateFrom: string;
  dateTo: string;
};

const EMPTY_FILTERS: Filters = {
  memberName: "", memberNo: "", memberId: "",
  bonusType: "", status: "", settlementBatchId: "",
  dateFrom: "", dateTo: "",
};

function MemberBonusDetailsPage() {
  const [tab, setTab] = useState<Category>("daily");

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">會員獎金明細</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            按制度分組顯示日獎金 / 月獎金產生的獎勵點，並依會員、狀態、批次或日期區間篩選。
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/admin/bonuses"><ArrowLeft className="mr-2 h-4 w-4" />返回獎金營運中心</Link>
        </Button>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Category)}>
        <TabsList>
          <TabsTrigger value="daily">日獎金明細</TabsTrigger>
          <TabsTrigger value="monthly">月獎金明細</TabsTrigger>
        </TabsList>
        <TabsContent value="daily" className="mt-4">
          <DetailSection category="daily" />
        </TabsContent>
        <TabsContent value="monthly" className="mt-4">
          <DetailSection category="monthly" />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function DetailSection({ category }: { category: Category }) {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [loading, setLoading] = useState(false);
  const [payload, setPayload] = useState<any>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const typeOptions = category === "daily" ? DAILY_BONUS_TYPE_OPTIONS : MONTHLY_BONUS_TYPE_OPTIONS;
  const isDaily = category === "daily";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p: any = { category, limit: 500 };
      if (filters.memberName.trim()) p.memberName = filters.memberName.trim();
      if (filters.memberNo.trim()) p.memberNo = filters.memberNo.trim();
      if (filters.memberId.trim()) p.memberId = filters.memberId.trim();
      if (filters.bonusType) p.bonusType = filters.bonusType;
      if (filters.status) p.status = filters.status;
      if (filters.settlementBatchId.trim()) p.settlementBatchId = filters.settlementBatchId.trim();
      if (filters.dateFrom) p.dateFrom = filters.dateFrom;
      if (filters.dateTo) p.dateTo = filters.dateTo;
      const res = await listMemberBonusDetails({ data: p });
      setPayload(res);
    } catch (e: any) {
      toast.error(e?.message ?? "查詢獎金明細失敗");
    } finally {
      setLoading(false);
    }
  }, [category, filters]);

  useEffect(() => {
    setPayload(null);
    setFilters(EMPTY_FILTERS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  const records: any[] = payload?.records ?? [];
  const members: Record<string, any> = payload?.members ?? {};
  const batches: Record<string, any> = payload?.batches ?? {};
  const summary = payload?.summary;
  const groupedByBonusType: any[] = payload?.groupedByBonusType ?? [];
  const groupedByStatus: any[] = payload?.groupedByStatus ?? [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">搜尋條件</CardTitle>
          <CardDescription>可組合多個條件；未填寫欄位不參與篩選。總計會依當前結果即時計算。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Field label="會員名稱">
              <Input value={filters.memberName}
                onChange={(e) => setFilters({ ...filters, memberName: e.target.value })}
                placeholder="模糊搜尋姓名" />
            </Field>
            <Field label="會員編號">
              <Input value={filters.memberNo}
                onChange={(e) => setFilters({ ...filters, memberNo: e.target.value })}
                placeholder="member_no" />
            </Field>
            <Field label="member_id">
              <Input className="font-mono" value={filters.memberId}
                onChange={(e) => setFilters({ ...filters, memberId: e.target.value })}
                placeholder="profiles.id" />
            </Field>
            <Field label="獎金制度">
              <Select value={filters.bonusType || "all"}
                onValueChange={(v) => setFilters({ ...filters, bonusType: v === "all" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="全部" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部</SelectItem>
                  {typeOptions.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="狀態">
              <Select value={filters.status || "all"}
                onValueChange={(v) => setFilters({ ...filters, status: v === "all" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="全部" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部</SelectItem>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="結算批次 ID">
              <Input className="font-mono" value={filters.settlementBatchId}
                onChange={(e) => setFilters({ ...filters, settlementBatchId: e.target.value })}
                placeholder="bonus_settlement_batches.id" />
            </Field>
            <Field label="結算日期起">
              <Input type="date" value={filters.dateFrom}
                onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })} />
            </Field>
            <Field label="結算日期迄">
              <Input type="date" value={filters.dateTo}
                onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })} />
            </Field>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={load} disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
              查詢
            </Button>
            <Button variant="outline" onClick={() => setFilters(EMPTY_FILTERS)} disabled={loading}>
              重設
            </Button>
            <Button variant="outline" onClick={load} disabled={loading}>
              <RefreshCw className="mr-2 h-4 w-4" />重新整理
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── 總覽卡片 ── */}
      <SummaryCards category={category} summary={summary} loading={loading} />

      {/* ── 制度分組表 ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {isDaily ? "日獎金制度分組" : "月獎金制度分組"}
          </CardTitle>
          <CardDescription>依 bonus_type 統計各制度產生的獎勵點與狀態分佈。</CardDescription>
        </CardHeader>
        <CardContent>
          {groupedByBonusType.length === 0 ? (
            <EmptyRow loading={loading} />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>制度</TableHead>
                    <TableHead className="text-right">筆數</TableHead>
                    <TableHead className="text-right">總計應發</TableHead>
                    <TableHead className="text-right">已成功發放</TableHead>
                    <TableHead className="text-right">待發放</TableHead>
                    <TableHead className="text-right">發放失敗</TableHead>
                    <TableHead className="text-right">涉及會員</TableHead>
                    <TableHead className="text-right">涉及批次</TableHead>
                    {!isDaily && <TableHead>結算期間</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {groupedByBonusType.map((g) => (
                    <TableRow key={g.bonus_type}>
                      <TableCell>
                        <div className="font-medium">{bonusTypeLabel(g.bonus_type)}</div>
                        <div className="text-xs text-muted-foreground font-mono">{g.bonus_type}</div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(g.count)}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">{fmt(g.total_points)}</TableCell>
                      <TableCell className="text-right tabular-nums text-primary">{fmt(g.released_points)}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmt(g.waiting_release_points + g.pending_points)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-destructive">{fmt(g.failed_points)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(g.member_count)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(g.batch_count)}</TableCell>
                      {!isDaily && (
                        <TableCell className="text-xs">
                          {g.periods?.length ? g.periods.join(", ") : "—"}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── 狀態分布 ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">狀態分布</CardTitle>
        </CardHeader>
        <CardContent>
          {groupedByStatus.length === 0 ? (
            <EmptyRow loading={loading} />
          ) : (
            <div className="flex flex-wrap gap-3">
              {groupedByStatus.map((s) => (
                <div key={s.status} className="rounded-md border px-3 py-2 text-sm">
                  <Badge variant={BONUS_STATUS_VARIANT[s.status] ?? "outline"} className="mr-2">
                    {bonusStatusLabel(s.status)}
                  </Badge>
                  <span className="text-muted-foreground">{fmt(s.count)} 筆 / </span>
                  <span className="font-semibold tabular-nums">{fmt(s.points)}</span>
                  <span className="text-muted-foreground"> 點</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── 明細表格 ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {isDaily ? "日獎金明細" : "月獎金明細"}
          </CardTitle>
          <CardDescription>
            {isDaily
              ? "顯示 bonus_records 中屬於日獎金類型之紀錄。"
              : "顯示 bonus_records 中屬於月獎金類型之紀錄。"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : records.length === 0 ? (
            <div className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
              尚無符合條件的資料
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>會員</TableHead>
                    <TableHead>獎金制度</TableHead>
                    <TableHead className="text-right">點數</TableHead>
                    <TableHead>狀態</TableHead>
                    <TableHead>{isDaily ? "結算日期" : "結算月份"}</TableHead>
                    <TableHead>結算批次</TableHead>
                    <TableHead>預計發放日</TableHead>
                    <TableHead>實際發放時間</TableHead>
                    <TableHead>重試 / 來源</TableHead>
                    <TableHead>來源會員</TableHead>
                    <TableHead>失敗原因</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.map((r) => {
                    const m = members[r.member_id];
                    const batch = batches[r.settlement_batch_id];
                    const releasedMember = r.released_member_id && members[r.released_member_id];
                    const originalMember = r.original_member_id && members[r.original_member_id];
                    return (
                      <TableRow key={r.id}>
                        <TableCell>
                          <div className="font-medium">{m?.name ?? "—"}</div>
                          <div className="text-xs text-muted-foreground">{m?.member_no ?? shortId(r.member_id)}</div>
                        </TableCell>
                        <TableCell>
                          <div>{bonusTypeLabel(r.bonus_type)}</div>
                          <div className="text-xs text-muted-foreground font-mono">{r.bonus_type}</div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(r.bonus_points)}</TableCell>
                        <TableCell>
                          <Badge variant={BONUS_STATUS_VARIANT[r.status] ?? "outline"}>
                            {bonusStatusLabel(r.status)}
                          </Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {isDaily
                            ? fmtDate(r.settlement_date ?? batch?.settlement_date)
                            : (batch?.period ?? fmtMonth(r.settlement_date ?? batch?.settlement_date))}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {r.settlement_batch_id ? shortId(r.settlement_batch_id) : "—"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{fmtDate(r.release_date)}</TableCell>
                        <TableCell className="whitespace-nowrap">{fmtDateTime(r.released_at)}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">
                          <div>重試 {r.release_attempts ?? 0} 次</div>
                          <div className="text-muted-foreground">{r.release_source ?? "—"}</div>
                        </TableCell>
                        <TableCell className="text-xs">
                          {releasedMember && (
                            <div>已發: {releasedMember.name}（{releasedMember.member_no}）</div>
                          )}
                          {originalMember && (
                            <div className="text-muted-foreground">原: {originalMember.name}（{originalMember.member_no}）</div>
                          )}
                          {!releasedMember && !originalMember && "—"}
                        </TableCell>
                        <TableCell className="max-w-[220px] truncate text-xs text-destructive" title={r.failed_reason ?? ""}>
                          {r.failed_reason ?? "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="outline" size="sm" onClick={() => setDetailId(r.id)}>明細</Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <RecordDetailDialog
        recordId={detailId}
        onOpenChange={(o) => !o && setDetailId(null)}
        members={members}
      />
    </div>
  );
}

function SummaryCards({
  category, summary, loading,
}: { category: Category; summary: any; loading: boolean }) {
  const isDaily = category === "daily";
  const label = isDaily ? "日獎金" : "月獎金";
  const s = summary ?? {
    total_count: 0, total_points: 0,
    waiting_release_points: 0, pending_points: 0,
    released_points: 0, failed_points: 0,
    member_count: 0, batch_count: 0,
  };
  const waiting = (s.waiting_release_points ?? 0) + (s.pending_points ?? 0);
  const items = [
    { label: `${label}總筆數`, value: fmt(s.total_count) },
    { label: `${label}總計應發獎勵點`, value: fmt(s.total_points), strong: true },
    { label: `${label}已成功發放`, value: fmt(s.released_points), color: "text-primary" },
    { label: `${label}待發放`, value: fmt(waiting) },
    { label: `${label}發放失敗`, value: fmt(s.failed_points), color: "text-destructive" },
    { label: "涉及會員", value: fmt(s.member_count) },
    { label: "涉及批次", value: fmt(s.batch_count) },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
      {items.map((it) => (
        <div key={it.label} className="rounded-lg border bg-card p-3">
          <div className="text-xs text-muted-foreground">{it.label}</div>
          <div className={`mt-1 text-xl tabular-nums ${it.strong ? "font-bold" : "font-semibold"} ${it.color ?? ""}`}>
            {loading ? "…" : it.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function EmptyRow({ loading }: { loading: boolean }) {
  return (
    <div className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
      {loading ? "載入中…" : "尚無資料"}
    </div>
  );
}

function RecordDetailDialog({
  recordId, onOpenChange, members,
}: {
  recordId: string | null;
  onOpenChange: (o: boolean) => void;
  members: Record<string, any>;
}) {
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<any | null>(null);

  useEffect(() => {
    if (!recordId) { setDetail(null); return; }
    let cancelled = false;
    setLoading(true);
    getBonusRecordDetail({ data: { recordId } })
      .then((d) => { if (!cancelled) setDetail(d); })
      .catch((e: any) => toast.error(e?.message ?? "讀取獎金明細失敗"))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [recordId]);

  const rec = detail?.record ?? detail;

  return (
    <Dialog open={!!recordId} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>獎金紀錄明細</DialogTitle>
          <DialogDescription>{recordId ? `record: ${recordId}` : ""}</DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : !detail ? (
          <div className="py-6 text-center text-sm text-muted-foreground">無資料</div>
        ) : (
          <div className="max-h-[70vh] overflow-auto space-y-4 text-sm">
            {rec && (
              <div className="grid gap-2 sm:grid-cols-2">
                <KV k="制度" v={`${bonusTypeLabel(rec.bonus_type)}（${rec.bonus_type}）`} />
                <KV k="狀態" v={bonusStatusLabel(rec.status)} />
                <KV k="點數" v={fmt(rec.bonus_points)} />
                <KV k="結算批次" v={rec.settlement_batch_id ?? "—"} mono />
                <KV k="結算日期" v={fmtDate(rec.settlement_date)} />
                <KV k="預計發放日" v={fmtDate(rec.release_date)} />
                <KV k="實際發放時間" v={fmtDateTime(rec.released_at)} />
                <KV k="release_source" v={rec.release_source ?? "—"} />
                <KV k="release_attempts" v={String(rec.release_attempts ?? 0)} />
                <KV k="失敗原因" v={rec.failed_reason ?? "—"} />
                <KV
                  k="original_member_id"
                  v={renderMember(rec.original_member_id, members)}
                  mono
                />
                <KV
                  k="released_member_id"
                  v={renderMember(rec.released_member_id, members)}
                  mono
                />
                <KV k="release_redirect_reason" v={rec.release_redirect_reason ?? "—"} />
              </div>
            )}
            <details className="rounded-md border">
              <summary className="cursor-pointer px-3 py-2 text-xs text-muted-foreground">原始 JSON</summary>
              <pre className="rounded-b-md bg-muted p-3 text-xs overflow-x-auto">
{JSON.stringify(detail, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function renderMember(id: string | null | undefined, members: Record<string, any>) {
  if (!id) return "—";
  const m = members[id];
  if (!m) return id;
  return `${m.name ?? "?"}（${m.member_no ?? shortId(id)}） · ${id}`;
}

function KV({ k, v, mono }: { k: string; v: React.ReactNode; mono?: boolean }) {
  return (
    <div className="rounded-md border p-2">
      <div className="text-xs text-muted-foreground">{k}</div>
      <div className={`mt-0.5 text-sm ${mono ? "font-mono break-all" : ""}`}>{v}</div>
    </div>
  );
}

function fmt(n: number | null | undefined) {
  return Number(n ?? 0).toLocaleString("zh-TW");
}
function fmtDate(s: string | null | undefined) {
  if (!s) return "—";
  try { return new Date(s).toLocaleDateString("zh-TW"); } catch { return s; }
}
function fmtDateTime(s: string | null | undefined) {
  if (!s) return "—";
  try { return new Date(s).toLocaleString("zh-TW"); } catch { return s; }
}
function fmtMonth(s: string | null | undefined) {
  if (!s) return "—";
  try {
    const d = new Date(s);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  } catch { return s; }
}
function shortId(id: string | null | undefined) {
  if (!id) return "—";
  return id.slice(0, 8);
}
