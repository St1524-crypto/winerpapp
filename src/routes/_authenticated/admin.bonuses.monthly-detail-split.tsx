import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2, Printer } from "lucide-react";
import { toast } from "sonner";
import { useAuth, type AppRole } from "@/hooks/use-auth";
import { ForbiddenScreen } from "@/components/ForbiddenScreen";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BonusFiltersCard, type BonusFilters } from "@/components/admin/BonusFiltersCard";
import { computePreset, type BonusDatePreset } from "@/lib/bonus-date-presets";
import { listMonthlyBonusDetails } from "@/lib/bonus.functions";
import { MONTHLY_BONUS_TYPE_OPTIONS } from "@/lib/bonus-labels";
import {
  aggregateMerged, MONTHLY_COLUMN_MAP, MONTHLY_TEMPLATE_COLUMNS,
  estimateTaxes, fmtN, type SummaryRow,
} from "@/lib/bonus-report-shared";

const ALLOWED: AppRole[] = ["super_admin", "admin", "finance"];
export const Route = createFileRoute("/_authenticated/admin/bonuses/monthly-detail-split")({ component: Guard });

function Guard() {
  const { roles, loading } = useAuth();
  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!roles.some((r) => ALLOWED.includes(r))) return <ForbiddenScreen requiredRoles={ALLOWED} pageName="月獎金明細（分開）" />;
  return <Page />;
}

const EMPTY: BonusFilters = { dateFrom: "", dateTo: "", bonusType: "", status: "", memberName: "", memberNo: "", settlementBatchId: "" };

function Page() {
  const [filters, setFilters] = useState<BonusFilters>(() => ({ ...EMPTY, ...computePreset("last_month")! }));
  const [preset, setPreset] = useState<BonusDatePreset>("last_month");
  const [loading, setLoading] = useState(false);
  const [payload, setPayload] = useState<any>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p: any = { limit: 2000 };
      Object.entries(filters).forEach(([k, v]) => { if (v) p[k] = v; });
      const res = await listMonthlyBonusDetails({ data: p });
      setPayload(res);
    } catch (e: any) { toast.error(e?.message ?? "查詢失敗"); }
    finally { setLoading(false); }
  }, [filters]);

  useEffect(() => { load(); }, []);

  const summaries: SummaryRow[] = useMemo(() => {
    if (!payload) return [];
    return aggregateMerged(payload.rows ?? [], payload.members ?? {}, MONTHLY_COLUMN_MAP, MONTHLY_TEMPLATE_COLUMNS);
  }, [payload]);

  const period = `${(filters.dateFrom || "").slice(0, 7)} ～ ${(filters.dateTo || "").slice(0, 7)}`;
  const rowsRaw: any[] = payload?.rows ?? [];
  const members: Record<string, any> = payload?.members ?? {};
  const orders: Record<string, any> = payload?.orders ?? {};

  return (
    <div className="mx-auto max-w-6xl space-y-6 print:max-w-none">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">月獎金明細（分開列印）</h1>
          <p className="mt-1 text-sm text-muted-foreground">一位會員一頁，格式對齊「月獎金明細分開.pdf」。列印時每位會員自動分頁。</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" />列印 / 匯出 PDF</Button>
          <Button asChild variant="outline"><Link to="/admin/bonuses"><ArrowLeft className="mr-2 h-4 w-4" />返回</Link></Button>
        </div>
      </div>

      <div className="print:hidden">
        <BonusFiltersCard
          filters={filters} setFilters={setFilters} preset={preset}
          setPreset={(v) => { setPreset(v); const p = computePreset(v); if (p) setFilters((f) => ({ ...f, ...p })); }}
          onLoad={load} loading={loading} typeOptions={MONTHLY_BONUS_TYPE_OPTIONS}
        />
      </div>


      {loading ? <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        : summaries.length === 0 ? <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">無資料</CardContent></Card>
        : summaries.map((s) => (
          <MemberDetailPage key={s.memberId} summary={s} period={period}
            memberRows={rowsRaw.filter((r) => r.member_id === s.memberId)}
            members={members} orders={orders} />
        ))}
    </div>
  );
}

function MemberDetailPage({ summary, period, memberRows, members, orders }: {
  summary: SummaryRow; period: string; memberRows: any[];
  members: Record<string, any>; orders: Record<string, any>;
}) {
  const tax = estimateTaxes(summary.total);
  const buckets: Record<string, any[]> = {
    "重消獎金明細": memberRows.filter((r) => r.bonus_type === "monthly_vip"),
    "超額獎金明細": memberRows.filter((r) => r.bonus_type === "rank_diff_rebate"),
    "達成分紅明細": memberRows.filter((r) => r.bonus_type === "rank_rebate"),
  };

  return (
    <Card className="break-inside-avoid print:shadow-none print:border-black" style={{ pageBreakAfter: "always" }}>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">
          月　獎　金　明　細　表　 <span className="text-sm font-normal text-muted-foreground">期別：{period}</span>
        </CardTitle>
        <div className="text-sm">會員：<span className="font-mono">{summary.member_no}</span>　{summary.name}</div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 表頭區：合計方塊 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm border rounded-md p-3 bg-muted/30">
          {MONTHLY_TEMPLATE_COLUMNS.map((c) => (
            <div key={c} className="flex justify-between border-b border-dashed py-1">
              <span className="text-muted-foreground">{c}</span>
              <span className="tabular-nums">{fmtN(summary.columns[c])}</span>
            </div>
          ))}
          <div className="flex justify-between py-1 col-span-2 md:col-span-4 border-t pt-2 mt-1">
            <span className="font-semibold">應發獎金</span>
            <span className="font-semibold tabular-nums">{fmtN(summary.total)}</span>
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>- 營業稅 (5%)</span><span className="tabular-nums">{fmtN(tax.t5)}</span>
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>- 10% 稅</span><span className="tabular-nums">{fmtN(tax.t10)}</span>
          </div>
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>- 健保費</span><span className="tabular-nums">{fmtN(tax.health)}</span>
          </div>
          <div className="flex justify-between py-1 col-span-2 md:col-span-4 border-t pt-2 mt-1 text-primary">
            <span className="font-semibold">實領獎金</span>
            <span className="font-semibold tabular-nums">{fmtN(tax.subtotal)}</span>
          </div>
        </div>

        {/* 子表 */}
        {Object.entries(buckets).map(([title, list]) => (
          <div key={title}>
            <div className="text-sm font-semibold mb-1">{title}（{list.length} 筆，小計 {fmtN(list.reduce((s, r) => s + Number(r.bonus_points ?? 0), 0))}）</div>
            {list.length === 0 ? <div className="text-xs text-muted-foreground">—</div> : (
              <div className="overflow-x-auto border rounded">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="p-1.5 text-left">會員名稱</th>
                      <th className="p-1.5 text-left">會員編號</th>
                      <th className="p-1.5 text-right">PV</th>
                      <th className="p-1.5 text-right">獎金%</th>
                      <th className="p-1.5 text-right">代數</th>
                      <th className="p-1.5 text-right">獎金</th>
                      <th className="p-1.5 text-left">訂單編號</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((r: any) => {
                      const src = members[r.source_member_id] ?? {};
                      const o = orders[r.source_order_id] ?? {};
                      return (
                        <tr key={r.id} className="border-t">
                          <td className="p-1.5">{src.name ?? "—"}</td>
                          <td className="p-1.5 font-mono">{src.member_no ?? "—"}</td>
                          <td className="p-1.5 text-right tabular-nums">{fmtN(r.base_amount)}</td>
                          <td className="p-1.5 text-right tabular-nums">{r.bonus_rate ?? "—"}</td>
                          <td className="p-1.5 text-right tabular-nums">{r.generation_level ?? r.layer_level ?? "—"}</td>
                          <td className="p-1.5 text-right tabular-nums font-semibold">{fmtN(r.bonus_points)}</td>
                          <td className="p-1.5 font-mono">{o.order_no ?? (r.source_order_id ? r.source_order_id.slice(0, 8) : "—")}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
