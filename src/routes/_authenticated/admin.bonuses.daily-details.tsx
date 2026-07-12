import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Download, Loader2, RefreshCw, Search } from "lucide-react";
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
import { listDailyBonusDetails } from "@/lib/bonus.functions";
import { bonusStatusLabel, bonusTypeLabel, BONUS_STATUS_VARIANT, DAILY_BONUS_TYPE_OPTIONS } from "@/lib/bonus-labels";
import { PRESET_OPTIONS, computePreset, type BonusDatePreset } from "@/lib/bonus-date-presets";

const ALLOWED: AppRole[] = ["super_admin", "admin", "finance"];
const STATUS_OPTIONS = [
  { value: "pending", label: "待結算" },
  { value: "waiting_release", label: "待發放" },
  { value: "released", label: "已成功發放" },
  { value: "failed", label: "發放失敗" },
  { value: "cancelled", label: "已取消" },
];

export const Route = createFileRoute("/_authenticated/admin/bonuses/daily-details")({ component: Guard });

function Guard() {
  const { roles, loading } = useAuth();
  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!roles.some((r) => ALLOWED.includes(r))) return <ForbiddenScreen requiredRoles={ALLOWED} pageName="每日獎金明細表" />;
  return <Page />;
}

type Filters = {
  dateFrom: string; dateTo: string; bonusType: string; status: string;
  memberName: string; memberNo: string; settlementBatchId: string;
};
const EMPTY: Filters = { dateFrom: "", dateTo: "", bonusType: "", status: "", memberName: "", memberNo: "", settlementBatchId: "" };

function Page() {
  const [filters, setFilters] = useState<Filters>(() => {
    const p = computePreset("this_month")!;
    return { ...EMPTY, ...p };
  });
  const [preset, setPreset] = useState<BonusDatePreset>("this_month");
  const [loading, setLoading] = useState(false);
  const [payload, setPayload] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p: any = { limit: 1000 };
      Object.entries(filters).forEach(([k, v]) => { if (v) p[k] = v; });
      const res = await listDailyBonusDetails({ data: p });
      setPayload(res);
    } catch (e: any) { toast.error(e?.message ?? "查詢失敗"); }
    finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { load(); /* initial */ }, []);

  function applyPreset(v: BonusDatePreset) {
    setPreset(v);
    const p = computePreset(v);
    if (p) setFilters((f) => ({ ...f, ...p }));
  }

  function exportCsv() {
    const rows = payload?.rows ?? [];
    if (!rows.length) { toast.info("無資料可匯出"); return; }
    const members = payload.members ?? {};
    const batches = payload.batches ?? {};
    const orders = payload.orders ?? {};
    const header = ["結算日期","發放日期","實際發放時間","會員名稱","會員編號","獎金類型","來源會員","來源訂單","代數","訂單金額","比例%","應發獎勵點","實際發放獎勵點","狀態","失敗原因","批次ID"];
    const csvRows = rows.map((r: any) => {
      const m = members[r.member_id] ?? {};
      const src = members[r.source_member_id] ?? {};
      const o = orders[r.source_order_id] ?? {};
      const released = r.status === "released" ? r.bonus_points : 0;
      return [
        r.settlement_date ?? "",
        r.release_date ?? "",
        r.released_at ?? "",
        m.name ?? "",
        m.member_no ?? "",
        bonusTypeLabel(r.bonus_type),
        src.name ? `${src.name}(${src.member_no ?? ""})` : "",
        o.order_no ?? r.source_order_id ?? "",
        r.generation_level ?? r.layer_level ?? "",
        r.base_amount ?? "",
        r.bonus_rate ?? "",
        r.bonus_points ?? 0,
        released,
        bonusStatusLabel(r.status),
        r.fail_reason ?? "",
        r.settlement_batch_id ?? "",
      ].map((x) => `"${String(x).replace(/"/g, '""')}"`).join(",");
    });
    const blob = new Blob(["\uFEFF" + [header.join(","), ...csvRows].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `daily-bonus-${filters.dateFrom}_${filters.dateTo}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const rows: any[] = payload?.rows ?? [];
  const members = payload?.members ?? {};
  const batches = payload?.batches ?? {};
  const orders = payload?.orders ?? {};

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">每日獎金明細表</h1>
          <p className="mt-1 text-sm text-muted-foreground">推薦獎勵 / 復購獎勵每日結算明細，依結算日期篩選。</p>
        </div>
        <Button asChild variant="outline">
          <Link to="/admin/bonuses"><ArrowLeft className="mr-2 h-4 w-4" />返回獎金營運中心</Link>
        </Button>
      </div>

      <FiltersCard
        filters={filters} setFilters={setFilters} preset={preset} setPreset={applyPreset}
        onLoad={load} loading={loading} onExport={exportCsv}
        typeOptions={DAILY_BONUS_TYPE_OPTIONS}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">明細（{rows.length} 筆）</CardTitle>
          <CardDescription>依 bonus_records 之 settlement_date 排序。</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : rows.length === 0 ? (
            <div className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">尚無符合條件的資料</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>結算日期</TableHead>
                    <TableHead>發放日期</TableHead>
                    <TableHead>會員</TableHead>
                    <TableHead>獎金類型</TableHead>
                    <TableHead>來源會員</TableHead>
                    <TableHead>來源訂單</TableHead>
                    <TableHead className="text-right">代數</TableHead>
                    <TableHead className="text-right">訂單金額</TableHead>
                    <TableHead className="text-right">比例%</TableHead>
                    <TableHead className="text-right">應發獎勵點</TableHead>
                    <TableHead className="text-right">實際發放</TableHead>
                    <TableHead>狀態</TableHead>
                    <TableHead>失敗原因</TableHead>
                    <TableHead>批次</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r: any) => {
                    const m = members[r.member_id] ?? {};
                    const src = members[r.source_member_id];
                    const o = orders[r.source_order_id];
                    const released = r.status === "released" ? Number(r.bonus_points ?? 0) : 0;
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="whitespace-nowrap">{r.settlement_date ?? "—"}</TableCell>
                        <TableCell className="whitespace-nowrap">{r.release_date ?? "—"}</TableCell>
                        <TableCell>
                          <div className="font-medium">{m.name ?? "—"}</div>
                          <div className="text-xs text-muted-foreground">{m.member_no ?? "—"}</div>
                        </TableCell>
                        <TableCell>{bonusTypeLabel(r.bonus_type)}</TableCell>
                        <TableCell className="text-xs">
                          {src ? <>{src.name}<div className="text-muted-foreground">{src.member_no}</div></> : "—"}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{o?.order_no ?? (r.source_order_id ? r.source_order_id.slice(0, 8) : "—")}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.generation_level ?? r.layer_level ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.base_amount ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.bonus_rate ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums font-semibold">{fmtN(r.bonus_points)}</TableCell>
                        <TableCell className="text-right tabular-nums text-primary">{fmtN(released)}</TableCell>
                        <TableCell>
                          <Badge variant={BONUS_STATUS_VARIANT[r.status] ?? "outline"}>{bonusStatusLabel(r.status)}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{r.fail_reason ?? "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{r.settlement_batch_id ? r.settlement_batch_id.slice(0, 8) : "—"}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function fmtN(v: any) { return Number(v ?? 0).toLocaleString(); }

export function FiltersCard({
  filters, setFilters, preset, setPreset, onLoad, loading, onExport, typeOptions,
}: {
  filters: Filters; setFilters: (f: Filters) => void;
  preset: BonusDatePreset; setPreset: (p: BonusDatePreset) => void;
  onLoad: () => void; loading: boolean; onExport?: () => void;
  typeOptions: { value: string; label: string }[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">查詢條件</CardTitle>
        <CardDescription>使用結算日期（settlement_date）作為期間篩選；空白欄位不參與過濾。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-1">
            <Label>快捷期間</Label>
            <Select value={preset} onValueChange={(v) => setPreset(v as BonusDatePreset)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PRESET_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
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
                {typeOptions.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
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
            <Input value={filters.memberName} onChange={(e) => setFilters({ ...filters, memberName: e.target.value })} placeholder="模糊搜尋" /></div>
          <div className="space-y-1"><Label>會員編號</Label>
            <Input value={filters.memberNo} onChange={(e) => setFilters({ ...filters, memberNo: e.target.value })} /></div>
          <div className="space-y-1"><Label>批次 ID</Label>
            <Input className="font-mono" value={filters.settlementBatchId} onChange={(e) => setFilters({ ...filters, settlementBatchId: e.target.value })} /></div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={onLoad} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}查詢
          </Button>
          <Button variant="outline" onClick={onLoad} disabled={loading}><RefreshCw className="mr-2 h-4 w-4" />重新整理</Button>
          {onExport && <Button variant="outline" onClick={onExport}><Download className="mr-2 h-4 w-4" />匯出 CSV</Button>}
        </div>
      </CardContent>
    </Card>
  );
}
