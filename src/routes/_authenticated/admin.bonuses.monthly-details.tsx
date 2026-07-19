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
import { Checkbox } from "@/components/ui/checkbox";
import { listMonthlyBonusDetails } from "@/lib/bonus.functions";
import { bonusStatusLabel, bonusTypeLabel, BONUS_STATUS_VARIANT, MONTHLY_BONUS_TYPE_OPTIONS } from "@/lib/bonus-labels";
import { computePreset, type BonusDatePreset } from "@/lib/bonus-date-presets";
import { BonusFiltersCard } from "@/components/admin/BonusFiltersCard";
import { MONTHLY_RULE_INTRO, bonusRuleMeta, vipStatusLabel, calculationNote } from "@/lib/bonus-rules";
import { BonusCalculationDetailDialog } from "@/components/admin/BonusCalculationDetailDialog";
import { BonusIncomeSummary, IncomeEmptyState } from "@/components/admin/BonusIncomeSummary";
import { filterIncome } from "@/lib/bonus-income";

const ALLOWED: AppRole[] = ["super_admin", "admin", "finance"];

export const Route = createFileRoute("/_authenticated/admin/bonuses/monthly-details")({ component: Guard });

function Guard() {
  const { roles, loading } = useAuth();
  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!roles.some((r) => ALLOWED.includes(r))) return <ForbiddenScreen requiredRoles={ALLOWED} pageName="月獎金明細" />;
  return <Page />;
}

type Filters = {
  dateFrom: string;
  dateTo: string;
  bonusType: string;
  status: string;
  memberName: string;
  memberNo: string;
  settlementBatchId: string;
};

const EMPTY: Filters = {
  dateFrom: "",
  dateTo: "",
  bonusType: "",
  status: "",
  memberName: "",
  memberNo: "",
  settlementBatchId: "",
};

function calcDetail(record: any) {
  const detail = record?.calculation_detail && typeof record.calculation_detail === "object"
    ? record.calculation_detail
    : {};
  const n = (value: unknown, fallback = 0) => {
    const parsed = Number(value ?? fallback);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const selfPoints = n(detail.self_points ?? detail.source_self_points);
  const firstGenerationPoints = n(detail.first_generation_points ?? detail.source_first_generation_points);
  const requiredPoints = n(detail.required_points ?? detail.source_required_points);
  const totalBasePoints = n(detail.total_base_points ?? detail.source_total_base_points ?? record?.base_amount);
  const excessPoints = n(detail.excess_points ?? detail.source_excess_points, Math.max(selfPoints - requiredPoints, 0));
  return { selfPoints, firstGenerationPoints, requiredPoints, totalBasePoints, excessPoints };
}

function fmt(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed.toLocaleString() : "0";
}

function Page() {
  const [filters, setFilters] = useState<Filters>(() => ({ ...EMPTY, ...computePreset("this_month")! }));
  const [preset, setPreset] = useState<BonusDatePreset>("this_month");
  const [loading, setLoading] = useState(false);
  const [payload, setPayload] = useState<any>(null);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p: any = { limit: 1000 };
      Object.entries(filters).forEach(([k, v]) => { if (v) p[k] = v; });
      const res = await listMonthlyBonusDetails({ data: p });
      setPayload(res);
    } catch (e: any) {
      toast.error(e?.message ?? "查詢失敗");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { load(); }, []);

  function applyPreset(value: BonusDatePreset) {
    setPreset(value);
    const next = computePreset(value);
    if (next) setFilters((current) => ({ ...current, ...next }));
  }

  function exportCsv() {
    const source = payload?.rows ?? [];
    const rows = showAll ? source : filterIncome(source);
    if (!rows.length) {
      toast.info("沒有資料可匯出");
      return;
    }
    const members = payload.members ?? {};
    const batches = payload.batches ?? {};
    const header = [
      "結算月份",
      "結算日期",
      "預計發放日",
      "實際發放時間",
      "會員名稱",
      "會員編號",
      "獎金類型",
      "自我消費",
      "第一代消費",
      "月達成基礎點數",
      "超額點數",
      "責任額",
      "是否達成",
      "比例%",
      "應發獎勵點",
      "實發獎勵點",
      "狀態",
      "失敗原因",
      "批次ID",
    ];
    const csv = rows.map((r: any) => {
      const m = members[r.member_id] ?? {};
      const b = batches[r.settlement_batch_id];
      const released = r.status === "released" ? r.bonus_points : 0;
      const detail = calcDetail(r);
      return [
        b?.period ?? (r.settlement_date ? String(r.settlement_date).slice(0, 7) : ""),
        r.settlement_date ?? "",
        r.release_date ?? "",
        r.released_at ?? "",
        m.name ?? "",
        m.member_no ?? "",
        bonusTypeLabel(r.bonus_type),
        detail.selfPoints,
        detail.firstGenerationPoints,
        detail.totalBasePoints,
        detail.excessPoints,
        detail.requiredPoints,
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
    const a = document.createElement("a");
    a.href = url;
    a.download = `monthly-bonus-${filters.dateFrom}_${filters.dateTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const allRows: any[] = payload?.rows ?? [];
  const rows: any[] = showAll ? allRows : filterIncome(allRows);
  const hiddenCount = allRows.length - rows.length;
  const members = payload?.members ?? {};
  const batches = payload?.batches ?? {};
  const tiers: Record<string, string> = payload?.tiers ?? {};
  const missingDetail = payload?.missingCalculationDetail ?? 0;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">月獎金明細</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            月達成 / 階級回饋 / 階級差額回饋，依 月達成獎金管理 與 VIP獎金參數管理 演算。
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/admin/bonuses"><ArrowLeft className="mr-2 h-4 w-4" />回獎金營運中心</Link>
        </Button>
      </div>

      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2"><Info className="h-4 w-4" />月結獎金演算規則</CardTitle>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground space-y-1">
          {MONTHLY_RULE_INTRO.map((line, i) => <div key={i}>{line}</div>)}
        </CardContent>
      </Card>

      <BonusFiltersCard
        filters={filters}
        setFilters={setFilters}
        preset={preset}
        setPreset={applyPreset}
        onLoad={load}
        loading={loading}
        onExport={exportCsv}
        typeOptions={MONTHLY_BONUS_TYPE_OPTIONS}
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
                UI 目前以 base_amount / bonus_rate / required_points_passed 推導呈現；
                精確的『自我消費 / 第一代消費 / 月達成基礎 / 超額點數 / 責任額門檻』需 Codex 於 settle_monthly_bonus RPC 寫入 calculation_detail JSON（建議：self_points、first_generation_points、total_base_points、excess_points、required_points、tier_snapshot、vip_snapshot），重新結算後才能完整還原。
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <BonusIncomeSummary rows={allRows} title="月獎金收入總表" />

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base">明細：{rows.length} 筆</CardTitle>
              <CardDescription>
                預設僅顯示「有收入」的獎金列（bonus_points &gt; 0 且狀態為已發放 / 待發放）。
                {hiddenCount > 0 && !showAll ? `　已隱藏 ${hiddenCount} 筆 0 點 / 已取消 / 失敗 / 未達成紀錄。` : ""}
              </CardDescription>
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <Checkbox checked={showAll} onCheckedChange={(v) => setShowAll(!!v)} />
              顯示 0 點 / 已取消紀錄（稽核用）
            </label>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : rows.length === 0 ? (
            <IncomeEmptyState />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>結算月份</TableHead>
                    <TableHead>結算日期</TableHead>
                    <TableHead>會員 / 編號</TableHead>
                    <TableHead>VIP階級</TableHead>
                    <TableHead>是否有效VIP</TableHead>
                    <TableHead>獎金類型</TableHead>
                    <TableHead>適用制度</TableHead>
                    <TableHead className="text-right">自我消費</TableHead>
                    <TableHead className="text-right">第一代消費</TableHead>
                    <TableHead className="text-right">自我+第一代</TableHead>
                    <TableHead className="text-right">月達成基礎</TableHead>
                    <TableHead className="text-right">超額點數</TableHead>
                    <TableHead className="text-right">責任額</TableHead>
                    <TableHead>是否達成</TableHead>
                    <TableHead className="text-right">比例%</TableHead>
                    <TableHead className="text-right">應發</TableHead>
                    <TableHead className="text-right">實發</TableHead>
                    <TableHead>狀態</TableHead>
                    <TableHead>計算說明</TableHead>
                    <TableHead>詳情</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r: any) => {
                    const m = members[r.member_id] ?? {};
                    const b = batches[r.settlement_batch_id];
                    const released = r.status === "released" ? Number(r.bonus_points ?? 0) : 0;
                    const detail = calcDetail(r);
                    const combined = detail.selfPoints + detail.firstGenerationPoints;
                    const vip = vipStatusLabel(m, r.settlement_date);
                    const meta = bonusRuleMeta(r.bonus_type);
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="whitespace-nowrap">{b?.period ?? (r.settlement_date ? String(r.settlement_date).slice(0, 7) : "—")}</TableCell>
                        <TableCell className="whitespace-nowrap">{r.settlement_date ?? "—"}</TableCell>
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
                        <TableCell className="text-right tabular-nums">{fmt(detail.selfPoints)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(detail.firstGenerationPoints)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(combined)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(detail.totalBasePoints)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(detail.excessPoints)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(detail.requiredPoints)}</TableCell>
                        <TableCell>
                          {r.required_points_passed === true ? <Badge>達成</Badge>
                            : r.required_points_passed === false ? <Badge variant="destructive">未達成</Badge>
                            : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{r.bonus_rate ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums font-semibold">{fmt(r.bonus_points)}</TableCell>
                        <TableCell className="text-right tabular-nums text-primary">{fmt(released)}</TableCell>
                        <TableCell><Badge variant={BONUS_STATUS_VARIANT[r.status] ?? "outline"}>{bonusStatusLabel(r.status)}</Badge></TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[240px] whitespace-normal">{calculationNote(r)}</TableCell>
                        <TableCell>
                          <BonusCalculationDetailDialog record={r} mode="monthly" members={members} tiers={tiers} />
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
