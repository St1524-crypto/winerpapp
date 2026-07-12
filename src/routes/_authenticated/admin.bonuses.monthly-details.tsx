import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Download, Loader2, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { useAuth, type AppRole } from "@/hooks/use-auth";
import { ForbiddenScreen } from "@/components/ForbiddenScreen";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listMonthlyBonusDetails } from "@/lib/bonus.functions";
import { bonusStatusLabel, bonusTypeLabel, BONUS_STATUS_VARIANT, MONTHLY_BONUS_TYPE_OPTIONS } from "@/lib/bonus-labels";
import { computePreset, type BonusDatePreset } from "@/lib/bonus-date-presets";
import { FiltersCard } from "./admin.bonuses.daily-details";

const ALLOWED: AppRole[] = ["super_admin", "admin", "finance"];

export const Route = createFileRoute("/_authenticated/admin/bonuses/monthly-details")({ component: Guard });

function Guard() {
  const { roles, loading } = useAuth();
  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!roles.some((r) => ALLOWED.includes(r))) return <ForbiddenScreen requiredRoles={ALLOWED} pageName="月獎金明細表" />;
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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p: any = { limit: 1000 };
      Object.entries(filters).forEach(([k, v]) => { if (v) p[k] = v; });
      const res = await listMonthlyBonusDetails({ data: p });
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

  function exportCsv() {
    const rows = payload?.rows ?? [];
    if (!rows.length) { toast.info("無資料可匯出"); return; }
    const members = payload.members ?? {};
    const batches = payload.batches ?? {};
    const header = ["結算月份","結算日期","發放日期","實際發放時間","會員名稱","會員編號","獎金類型","責任額","是否達成","比例%","應發獎勵點","實際發放獎勵點","狀態","失敗原因","批次ID"];
    const csv = rows.map((r: any) => {
      const m = members[r.member_id] ?? {};
      const b = batches[r.settlement_batch_id];
      const released = r.status === "released" ? r.bonus_points : 0;
      return [
        b?.period ?? (r.settlement_date ? String(r.settlement_date).slice(0, 7) : ""),
        r.settlement_date ?? "",
        r.release_date ?? "",
        r.released_at ?? "",
        m.name ?? "",
        m.member_no ?? "",
        bonusTypeLabel(r.bonus_type),
        r.base_amount ?? "",
        r.required_points_passed === true ? "是" : r.required_points_passed === false ? "否" : "",
        r.bonus_rate ?? "",
        r.bonus_points ?? 0,
        released,
        bonusStatusLabel(r.status),
        r.fail_reason ?? "",
        r.settlement_batch_id ?? "",
      ].map((x) => `"${String(x).replace(/"/g, '""')}"`).join(",");
    });
    const blob = new Blob(["\uFEFF" + [header.join(","), ...csv].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `monthly-bonus-${filters.dateFrom}_${filters.dateTo}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const rows: any[] = payload?.rows ?? [];
  const members = payload?.members ?? {};
  const batches = payload?.batches ?? {};

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">月獎金明細表</h1>
          <p className="mt-1 text-sm text-muted-foreground">月 VIP 獎勵 / 階級回饋 / 階級差額回饋，依結算日期篩選。</p>
        </div>
        <Button asChild variant="outline">
          <Link to="/admin/bonuses"><ArrowLeft className="mr-2 h-4 w-4" />返回獎金營運中心</Link>
        </Button>
      </div>

      <FiltersCard
        filters={filters} setFilters={setFilters} preset={preset} setPreset={applyPreset}
        onLoad={load} loading={loading} onExport={exportCsv}
        typeOptions={MONTHLY_BONUS_TYPE_OPTIONS}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">明細（{rows.length} 筆）</CardTitle>
          <CardDescription>自我消費 / 一代消費 / 超額點數目前由核心結算 job 寫入 base_amount；此頁面唯讀顯示。</CardDescription>
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
                    <TableHead>結算月份</TableHead>
                    <TableHead>結算日期</TableHead>
                    <TableHead>發放日期</TableHead>
                    <TableHead>會員</TableHead>
                    <TableHead>獎金類型</TableHead>
                    <TableHead className="text-right">責任額</TableHead>
                    <TableHead>是否達成</TableHead>
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
                    const b = batches[r.settlement_batch_id];
                    const released = r.status === "released" ? Number(r.bonus_points ?? 0) : 0;
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="whitespace-nowrap">{b?.period ?? (r.settlement_date ? String(r.settlement_date).slice(0, 7) : "—")}</TableCell>
                        <TableCell className="whitespace-nowrap">{r.settlement_date ?? "—"}</TableCell>
                        <TableCell className="whitespace-nowrap">{r.release_date ?? "—"}</TableCell>
                        <TableCell>
                          <div className="font-medium">{m.name ?? "—"}</div>
                          <div className="text-xs text-muted-foreground">{m.member_no ?? "—"}</div>
                        </TableCell>
                        <TableCell>{bonusTypeLabel(r.bonus_type)}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.base_amount ?? "—"}</TableCell>
                        <TableCell>
                          {r.required_points_passed === true ? <Badge>達成</Badge>
                            : r.required_points_passed === false ? <Badge variant="destructive">未達</Badge>
                            : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{r.bonus_rate ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums font-semibold">{Number(r.bonus_points ?? 0).toLocaleString()}</TableCell>
                        <TableCell className="text-right tabular-nums text-primary">{released.toLocaleString()}</TableCell>
                        <TableCell><Badge variant={BONUS_STATUS_VARIANT[r.status] ?? "outline"}>{bonusStatusLabel(r.status)}</Badge></TableCell>
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
