import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2, Printer, FileSpreadsheet, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useAuth, type AppRole } from "@/hooks/use-auth";
import { ForbiddenScreen } from "@/components/ForbiddenScreen";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BonusFiltersCard, type BonusFilters } from "@/components/admin/BonusFiltersCard";
import { computePreset, type BonusDatePreset } from "@/lib/bonus-date-presets";
import { listDailyBonusDetails } from "@/lib/bonus.functions";
import { DAILY_BONUS_TYPE_OPTIONS } from "@/lib/bonus-labels";
import {
  aggregateMerged, DAILY_COLUMN_MAP, DAILY_TEMPLATE_COLUMNS,
  exportSummaryXls, fmtN, type SummaryRow,
} from "@/lib/bonus-report-shared";

const ALLOWED: AppRole[] = ["super_admin", "admin", "finance"];
export const Route = createFileRoute("/_authenticated/admin/bonuses/daily-summary-merged")({ component: Guard });

function Guard() {
  const { roles, loading } = useAuth();
  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!roles.some((r) => ALLOWED.includes(r))) return <ForbiddenScreen requiredRoles={ALLOWED} pageName="日獎金總表（合計）" />;
  return <Page />;
}

const EMPTY: BonusFilters = { dateFrom: "", dateTo: "", bonusType: "", status: "", memberName: "", memberNo: "", settlementBatchId: "" };

function Page() {
  const [filters, setFilters] = useState<BonusFilters>(() => ({ ...EMPTY, ...computePreset("this_month")! }));
  const [preset, setPreset] = useState<BonusDatePreset>("this_month");
  const [loading, setLoading] = useState(false);
  const [payload, setPayload] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p: any = { limit: 2000 };
      Object.entries(filters).forEach(([k, v]) => { if (v) p[k] = v; });
      const res = await listDailyBonusDetails({ data: p });
      setPayload(res);
    } catch (e: any) { toast.error(e?.message ?? "查詢失敗"); }
    finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { load(); }, []);

  const rows: SummaryRow[] = useMemo(() => {
    if (!payload) return [];
    return aggregateMerged(payload.rows ?? [], payload.members ?? {}, DAILY_COLUMN_MAP, DAILY_TEMPLATE_COLUMNS);
  }, [payload]);

  const period = `${filters.dateFrom || "…"} ～ ${filters.dateTo || "…"}`;

  function onExport() {
    if (!rows.length) { toast.info("無資料可匯出"); return; }
    exportSummaryXls({ periodLabel: period, templateCols: DAILY_TEMPLATE_COLUMNS, rows, filename: "日獎金總表-合計", scope: "daily" });
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 print:max-w-none">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">日獎金總表（合計）</h1>
          <p className="mt-1 text-sm text-muted-foreground">同會員同期間彙總為一列，欄位對齊「日獎金總表合計1.xls」。</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" />列印</Button>
          <Button variant="outline" onClick={onExport}><FileSpreadsheet className="mr-2 h-4 w-4" />匯出 XLS</Button>
          <Button asChild variant="outline"><Link to="/admin/bonuses"><ArrowLeft className="mr-2 h-4 w-4" />返回</Link></Button>
        </div>
      </div>

      <div className="print:hidden">
        <BonusFiltersCard
          filters={filters} setFilters={setFilters} preset={preset}
          setPreset={(v) => { setPreset(v); const p = computePreset(v); if (p) setFilters((f) => ({ ...f, ...p })); }}
          onLoad={load} loading={loading} typeOptions={DAILY_BONUS_TYPE_OPTIONS}
        />
      </div>

      <Card className="border-amber-500/50 bg-amber-500/10 print:hidden">
        <CardContent className="py-3 flex items-start gap-2 text-xs">
          <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-600 shrink-0" />
          <div>身份証號 / 地址 / 証號別欄位目前 DB 尚未儲存；稅額為報表估算，僅供對帳呈現，不影響實際發放。</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">獎金期間：{period}（共 {rows.length} 位會員）</CardTitle></CardHeader>
        <CardContent>
          {loading ? <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
            : rows.length === 0 ? <div className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">無資料</div>
            : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>會員編號</TableHead><TableHead>姓名</TableHead>
                      <TableHead>身份証號</TableHead><TableHead>証號別</TableHead>
                      {DAILY_TEMPLATE_COLUMNS.map((c) => <TableHead key={c} className="text-right">{c}</TableHead>)}
                      <TableHead className="text-right">獎金合計</TableHead>
                      <TableHead className="text-right">5%稅</TableHead>
                      <TableHead className="text-right">10%稅</TableHead>
                      <TableHead className="text-right">健保費</TableHead>
                      <TableHead className="text-right">小計</TableHead>
                      <TableHead>地址</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.memberId}>
                        <TableCell className="font-mono">{r.member_no}</TableCell>
                        <TableCell>{r.name}</TableCell>
                        <TableCell>—</TableCell>
                        <TableCell>本國個人</TableCell>
                        {DAILY_TEMPLATE_COLUMNS.map((c) => <TableCell key={c} className="text-right tabular-nums">{fmtN(r.columns[c])}</TableCell>)}
                        <TableCell className="text-right tabular-nums font-semibold">{fmtN(r.total)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtN(r.t5)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtN(r.t10)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtN(r.health)}</TableCell>
                        <TableCell className="text-right tabular-nums text-primary">{fmtN(r.subtotal)}</TableCell>
                        <TableCell>—</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
        </CardContent>
      </Card>
    </div>
  );
}
