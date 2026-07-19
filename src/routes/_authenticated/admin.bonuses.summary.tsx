import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Loader2, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { useAuth, type AppRole } from "@/hooks/use-auth";
import { ForbiddenScreen } from "@/components/ForbiddenScreen";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { getBonusSummaryReport } from "@/lib/bonus.functions";
import { bonusStatusLabel, bonusTypeLabel, BONUS_STATUS_VARIANT, BONUS_TYPE_LABEL } from "@/lib/bonus-labels";
import { PRESET_OPTIONS, computePreset, type BonusDatePreset } from "@/lib/bonus-date-presets";

const ALLOWED: AppRole[] = ["super_admin", "admin", "finance"];
const STATUS_OPTIONS = [
  { value: "pending", label: "待結算" },
  { value: "waiting_release", label: "待發放" },
  { value: "released", label: "已成功發放" },
  { value: "failed", label: "發放失敗" },
  { value: "cancelled", label: "已取消" },
];
const TYPE_OPTIONS = Object.entries(BONUS_TYPE_LABEL).map(([value, label]) => ({ value, label }));

export const Route = createFileRoute("/_authenticated/admin/bonuses/summary")({ component: Guard });

function Guard() {
  const { roles, loading } = useAuth();
  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!roles.some((r) => ALLOWED.includes(r))) return <ForbiddenScreen requiredRoles={ALLOWED} pageName="獎金總表" />;
  return <Page />;
}

type Filters = {
  dateFrom: string; dateTo: string; bonusType: string; status: string;
  memberName: string; memberNo: string; settlementBatchId: string;
};
const EMPTY: Filters = { dateFrom: "", dateTo: "", bonusType: "", status: "", memberName: "", memberNo: "", settlementBatchId: "" };

function Page() {
  const [filters, setFilters] = useState<Filters>(() => ({ ...EMPTY, ...computePreset("this_month")! }));
  const [preset, setPreset] = useState<BonusDatePreset>("this_month");
  const [loading, setLoading] = useState(false);
  const [payload, setPayload] = useState<any>(null);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p: any = {};
      Object.entries(filters).forEach(([k, v]) => { if (v) p[k] = v; });
      const res = await getBonusSummaryReport({ data: p });
      setPayload(res);
    } catch (e: any) { toast.error(e?.message ?? "查詢失敗"); }
    finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { load(); }, []);

  function applyPreset(v: BonusDatePreset) {
    setPreset(v);
    const p = computePreset(v);
    if (p) setFilters((f) => ({ ...f, ...p }));
  }

  const totals = payload?.totals ?? {};
  const counts = payload?.counts ?? {};
  const byTypeAll: any[] = payload?.byType ?? [];
  const byStatusAll: any[] = payload?.byStatus ?? [];

  // 收入判斷：只計 released + waiting_release，排除 cancelled / failed / pending / 0 點。
  const INCOME_STATUS = new Set(["released", "waiting_release"]);
  const byStatus = showAll ? byStatusAll : byStatusAll.filter((s) => INCOME_STATUS.has(s.status) && (s.points ?? 0) > 0);
  const byType = showAll
    ? byTypeAll
    : byTypeAll
        .map((r: any) => ({
          ...r,
          incomePoints: Number(r.released ?? 0) + Number(r.waiting ?? 0),
        }))
        .filter((r: any) => r.incomePoints > 0);

  const incomeTotal = (totals.released ?? 0) + (totals.waiting_release ?? 0);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">獎金總表</h1>
          <p className="mt-1 text-sm text-muted-foreground">依期間、獎金類型、狀態、會員或批次彙總日/月獎金點數。</p>
        </div>
        <Button asChild variant="outline">
          <Link to="/admin/bonuses"><ArrowLeft className="mr-2 h-4 w-4" />返回獎金營運中心</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">查詢條件</CardTitle>
          <CardDescription>使用結算日期作為期間篩選；空白欄位不參與過濾。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-1">
              <Label>快捷期間</Label>
              <Select value={preset} onValueChange={(v) => applyPreset(v as BonusDatePreset)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PRESET_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>起始日期</Label>
              <Input type="date" value={filters.dateFrom} onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })} /></div>
            <div className="space-y-1"><Label>結束日期</Label>
              <Input type="date" value={filters.dateTo} onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })} /></div>
            <div className="space-y-1">
              <Label>獎金類型</Label>
              <Select value={filters.bonusType || "all"} onValueChange={(v) => setFilters({ ...filters, bonusType: v === "all" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="全部" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部</SelectItem>
                  {TYPE_OPTIONS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>狀態</Label>
              <Select value={filters.status || "all"} onValueChange={(v) => setFilters({ ...filters, status: v === "all" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="全部" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部</SelectItem>
                  {STATUS_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>會員名稱</Label>
              <Input value={filters.memberName} onChange={(e) => setFilters({ ...filters, memberName: e.target.value })} /></div>
            <div className="space-y-1"><Label>會員編號</Label>
              <Input value={filters.memberNo} onChange={(e) => setFilters({ ...filters, memberNo: e.target.value })} /></div>
            <div className="space-y-1"><Label>批次 ID</Label>
              <Input className="font-mono" value={filters.settlementBatchId} onChange={(e) => setFilters({ ...filters, settlementBatchId: e.target.value })} /></div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={load} disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}查詢
            </Button>
            <Button variant="outline" onClick={load} disabled={loading}><RefreshCw className="mr-2 h-4 w-4" />重新整理</Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center justify-end">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Checkbox checked={showAll} onCheckedChange={(v) => setShowAll(!!v)} />
          顯示 0 點 / 已取消 / 失敗紀錄（稽核用，預設關閉）
        </label>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Metric title="收入獎金合計（已發放 + 待發放）" value={incomeTotal} tone="primary" />
        <Metric title="已發放" value={totals.released} tone="primary" />
        <Metric title="待發放" value={totals.waiting_release} tone="secondary" />
        <Metric title="會員數 / 批次數" value={`${counts.members ?? 0} / ${counts.batches ?? 0}`} />
        {showAll && (
          <>
            <Metric title="日獎金總點數" value={totals.daily} />
            <Metric title="月獎金總點數" value={totals.monthly} />
            <Metric title="待結算 pending" value={totals.pending} tone="secondary" />
            <Metric title="已取消" value={totals.cancelled} />
            <Metric title="發放失敗" value={totals.failed} tone="danger" />
          </>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">依獎金類型{showAll ? "" : "（僅收入）"}</CardTitle>
        </CardHeader>
        <CardContent>
          {byType.length === 0 ? (
            <div className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
              {showAll ? "尚無資料" : "此期間無可收入獎金"}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>獎金類型</TableHead>
                    <TableHead className="text-right">筆數</TableHead>
                    <TableHead className="text-right">{showAll ? "總點數" : "收入合計"}</TableHead>
                    <TableHead className="text-right">已發放</TableHead>
                    <TableHead className="text-right">待發放</TableHead>
                    {showAll && <TableHead className="text-right">失敗</TableHead>}
                    {showAll && <TableHead className="text-right">取消</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {byType.map((r: any) => (
                    <TableRow key={r.bonus_type}>
                      <TableCell>{bonusTypeLabel(r.bonus_type)}</TableCell>
                      <TableCell className="text-right tabular-nums">{Number(r.count ?? 0).toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">
                        {(showAll ? Number(r.points ?? 0) : Number(r.incomePoints ?? 0)).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-primary">{Number(r.released ?? 0).toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums">{(Number(r.waiting ?? 0) + (showAll ? Number(r.pending ?? 0) : 0)).toLocaleString()}</TableCell>
                      {showAll && <TableCell className="text-right tabular-nums text-destructive">{Number(r.failed ?? 0).toLocaleString()}</TableCell>}
                      {showAll && <TableCell className="text-right tabular-nums">{Number(r.cancelled ?? 0).toLocaleString()}</TableCell>}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">依狀態{showAll ? "" : "（僅收入）"}</CardTitle></CardHeader>
        <CardContent>
          {byStatus.length === 0 ? (
            <div className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
              {showAll ? "尚無資料" : "此期間無可收入獎金"}
            </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              {byStatus.map((s) => (
                <div key={s.status} className="rounded-md border px-3 py-2 text-sm">
                  <Badge variant={BONUS_STATUS_VARIANT[s.status] ?? "outline"} className="mr-2">{bonusStatusLabel(s.status)}</Badge>
                  <span className="text-muted-foreground">{s.count} 筆 / </span>
                  <span className="font-semibold tabular-nums">{s.points.toLocaleString()}</span>
                  <span className="text-muted-foreground"> 點</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ title, value, tone }: { title: string; value: any; tone?: "primary" | "danger" | "secondary" }) {
  const color = tone === "primary" ? "text-primary" : tone === "danger" ? "text-destructive" : tone === "secondary" ? "text-muted-foreground" : "";
  const display = typeof value === "number" ? value.toLocaleString() : value ?? "—";
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-xs text-muted-foreground">{title}</div>
        <div className={`mt-1 text-2xl font-semibold tabular-nums ${color}`}>{display}</div>
      </CardContent>
    </Card>
  );
}
