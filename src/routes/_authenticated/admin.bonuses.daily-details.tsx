import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Loader2, Info, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useAuth, type AppRole } from "@/hooks/use-auth";
import { ForbiddenScreen } from "@/components/ForbiddenScreen";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listDailyBonusDetails } from "@/lib/bonus.functions";
import { bonusStatusLabel, bonusTypeLabel, BONUS_STATUS_VARIANT, DAILY_BONUS_TYPE_OPTIONS } from "@/lib/bonus-labels";
import { computePreset, type BonusDatePreset } from "@/lib/bonus-date-presets";
import { BonusFiltersCard, type BonusFilters } from "@/components/admin/BonusFiltersCard";
import { DAILY_RULE_INTRO, bonusRuleMeta, vipStatusLabel, calculationNote } from "@/lib/bonus-rules";
import { BonusCalculationDetailDialog } from "@/components/admin/BonusCalculationDetailDialog";
import { exportPdfReport } from "@/lib/pdf-report";
import shopOgLogo from "@/assets/shop-share-logo-v2.jpg";
import { FileDown, FileText } from "lucide-react";

const ALLOWED: AppRole[] = ["super_admin", "admin", "finance"];

export const Route = createFileRoute("/_authenticated/admin/bonuses/daily-details")({ component: Guard });

function Guard() {
  const { roles, loading } = useAuth();
  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!roles.some((r) => ALLOWED.includes(r))) return <ForbiddenScreen requiredRoles={ALLOWED} pageName="每日獎金明細表" />;
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
    const orders = payload.orders ?? {};
    const tiers = payload.tiers ?? {};
    const header = [
      "結算日期","發放日期","實際發放時間","會員名稱","會員編號","VIP階級","是否有效VIP",
      "來源會員","來源訂單","獎金類型","適用制度","獎勵點來源","原始訂單獎勵點","代數","適用比例%",
      "應發獎勵點","實際發放獎勵點","實際領取人","改發原因","狀態","計算說明","批次ID",
    ];
    const csvRows = rows.map((r: any) => {
      const m = members[r.member_id] ?? {};
      const src = members[r.source_member_id] ?? {};
      const rec = members[r.released_member_id] ?? {};
      const o = orders[r.source_order_id] ?? {};
      const released = r.status === "released" ? r.bonus_points : 0;
      const vip = vipStatusLabel(m, r.settlement_date);
      const meta = bonusRuleMeta(r.bonus_type);
      return [
        r.settlement_date ?? "", r.release_date ?? "", r.released_at ?? "",
        m.name ?? "", m.member_no ?? "", tiers[r.member_id] ?? "—", vip.label,
        src.name ? `${src.name}(${src.member_no ?? ""})` : "",
        o.order_no ?? r.source_order_id ?? "",
        bonusTypeLabel(r.bonus_type), meta.rule, meta.source,
        r.base_amount ?? "", r.generation_level ?? r.layer_level ?? "",
        r.bonus_rate ?? "", r.bonus_points ?? 0, released,
        rec.name ? `${rec.name}(${rec.member_no ?? ""})` : "",
        r.release_redirect_reason ?? "",
        bonusStatusLabel(r.status), calculationNote(r),
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
  const orders = payload?.orders ?? {};
  const tiers: Record<string, string> = payload?.tiers ?? {};
  const missingDetail = payload?.missingCalculationDetail ?? 0;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">每日獎金明細表</h1>
          <p className="mt-1 text-sm text-muted-foreground">推薦獎勵 / 復購獎勵每日結算明細，依 VIP獎金參數管理 與 月達成獎金管理 演算。</p>
        </div>
        <Button asChild variant="outline">
          <Link to="/admin/bonuses"><ArrowLeft className="mr-2 h-4 w-4" />返回獎金營運中心</Link>
        </Button>
      </div>

      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><Info className="h-4 w-4" />日結獎金演算規則</CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground space-y-1">
          {DAILY_RULE_INTRO.map((line, i) => <div key={i}>{line}</div>)}
        </CardContent>
      </Card>

      <BonusFiltersCard
        filters={filters} setFilters={setFilters} preset={preset} setPreset={applyPreset}
        onLoad={load} loading={loading} onExport={exportCsv}
        typeOptions={DAILY_BONUS_TYPE_OPTIONS}
      />

      {missingDetail > 0 && (
        <Card className="border-amber-500/50 bg-amber-500/10">
          <CardContent className="py-3 flex items-start gap-2 text-sm">
            <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-600 shrink-0" />
            <div>
              <div className="font-medium text-amber-900 dark:text-amber-200">
                有 {missingDetail} 筆記錄缺少 calculation_detail 快照。
              </div>
              <div className="text-xs text-amber-800 dark:text-amber-300 mt-0.5">
                UI 目前以現有欄位（base_amount / bonus_rate / required_points_passed / release_redirect_reason）推導呈現；
                精細演算來源需 Codex 於 processRepurchase / processUpgrade / daily_bonus_tick 補寫 calculation_detail JSON（建議欄位：source_reward_points、tier_snapshot、rule_id、vip_snapshot、responsibility_snapshot），並重新結算後才能完整還原。
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">明細（{rows.length} 筆）</CardTitle>
          <CardDescription>依 bonus_records 之 settlement_date 排序，逐筆呈現制度來源與演算資訊。</CardDescription>
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
                    <TableHead>會員 / 編號</TableHead>
                    <TableHead>VIP階級</TableHead>
                    <TableHead>是否有效VIP</TableHead>
                    <TableHead>獎金類型</TableHead>
                    <TableHead>適用制度</TableHead>
                    <TableHead>獎勵點來源</TableHead>
                    <TableHead>來源會員 / 訂單</TableHead>
                    <TableHead className="text-right">代數</TableHead>
                    <TableHead className="text-right">原始訂單獎勵點</TableHead>
                    <TableHead className="text-right">比例%</TableHead>
                    <TableHead className="text-right">應發</TableHead>
                    <TableHead className="text-right">實發</TableHead>
                    <TableHead>實際領取人</TableHead>
                    <TableHead>狀態</TableHead>
                    <TableHead>計算說明</TableHead>
                    <TableHead>詳情</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r: any) => {
                    const m = members[r.member_id] ?? {};
                    const src = members[r.source_member_id];
                    const rec = members[r.released_member_id];
                    const o = orders[r.source_order_id];
                    const released = r.status === "released" ? Number(r.bonus_points ?? 0) : 0;
                    const vip = vipStatusLabel(m, r.settlement_date);
                    const meta = bonusRuleMeta(r.bonus_type);
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="whitespace-nowrap">{r.settlement_date ?? "—"}</TableCell>
                        <TableCell className="whitespace-nowrap">{r.release_date ?? "—"}</TableCell>
                        <TableCell>
                          <div className="font-medium">{m.name ?? "—"}</div>
                          <div className="text-xs text-muted-foreground">{m.member_no ?? "—"}</div>
                        </TableCell>
                        <TableCell className="text-xs">{tiers[r.member_id] ?? "—"}</TableCell>
                        <TableCell>
                          <Badge variant={vip.valid ? "default" : "destructive"} title={vip.reason}>{vip.label}</Badge>
                        </TableCell>
                        <TableCell>{bonusTypeLabel(r.bonus_type)}</TableCell>
                        <TableCell className="text-xs max-w-[180px]">{meta.rule}</TableCell>
                        <TableCell className="text-xs max-w-[180px]">{meta.source}</TableCell>
                        <TableCell className="text-xs">
                          {src ? <div className="font-medium">{src.name}<span className="text-muted-foreground"> ({src.member_no})</span></div> : "—"}
                          <div className="font-mono text-muted-foreground">{o?.order_no ?? (r.source_order_id ? r.source_order_id.slice(0, 8) : "—")}</div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{r.generation_level ?? r.layer_level ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtN(r.base_amount)}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.bonus_rate ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums font-semibold">{fmtN(r.bonus_points)}</TableCell>
                        <TableCell className="text-right tabular-nums text-primary">{fmtN(released)}</TableCell>
                        <TableCell className="text-xs">
                          {rec ? <>{rec.name}<div className="text-muted-foreground">{rec.member_no}</div></> : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={BONUS_STATUS_VARIANT[r.status] ?? "outline"}>{bonusStatusLabel(r.status)}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[240px] whitespace-normal">{calculationNote(r)}</TableCell>
                        <TableCell>
                          <BonusCalculationDetailDialog record={r} mode="daily" members={members} orders={orders} tiers={tiers} />
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
    </div>
  );
}

function fmtN(v: any) { return Number(v ?? 0).toLocaleString(); }
