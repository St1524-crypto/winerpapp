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
import { listDailyBonusDetails } from "@/lib/bonus.functions";
import { bonusStatusLabel, bonusTypeLabel, BONUS_STATUS_VARIANT, DAILY_BONUS_TYPE_OPTIONS } from "@/lib/bonus-labels";
import { computePreset, type BonusDatePreset } from "@/lib/bonus-date-presets";
import { BonusFiltersCard, type BonusFilters } from "@/components/admin/BonusFiltersCard";
import { DAILY_RULE_INTRO, bonusRuleMeta, vipStatusLabel, calculationNote } from "@/lib/bonus-rules";
import { BonusCalculationDetailDialog } from "@/components/admin/BonusCalculationDetailDialog";
import { BonusIncomeSummary, IncomeEmptyState } from "@/components/admin/BonusIncomeSummary";
import { filterIncome } from "@/lib/bonus-income";
import { exportPdfReport } from "@/lib/pdf-report";
import { exportDailyBonusStatements } from "@/lib/bonus-daily-statement";
import logo from "@/assets/logo.jpg";
import { FileDown, FileText, Printer } from "lucide-react";

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
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async (override?: Partial<BonusFilters>) => {
    setLoading(true);
    try {
      const merged = { ...filters, ...(override ?? {}) };
      const p: any = { limit: 1000 };
      Object.entries(merged).forEach(([k, v]) => { if (v) p[k] = v; });
      const res = await listDailyBonusDetails({ data: p });
      setPayload(res);
    } catch (e: any) { toast.error(e?.message ?? "查詢失敗"); }
    finally { setLoading(false); }
  }, [filters]);

  function applyQuickDate(from: string, to: string) {
    setFilters((f) => ({ ...f, dateFrom: from, dateTo: to }));
    setPreset("custom");
    load({ dateFrom: from, dateTo: to });
  }

  function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  function yesterdayStr() {
    const d = new Date(); d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  useEffect(() => { load(); /* initial */ }, []);

  function applyPreset(v: BonusDatePreset) {
    setPreset(v);
    const p = computePreset(v);
    if (p) setFilters((f) => ({ ...f, ...p }));
  }

  function exportCsv() {
    const source = payload?.rows ?? [];
    const rows = showAll ? source : filterIncome(source);
    if (!rows.length) { toast.info("無資料可匯出"); return; }
    const members = payload.members ?? {};
    const orders = payload.orders ?? {};
    const tiers = payload.tiers ?? {};
    const header = [
      "結算日期","發放日期","實際發放時間","會員名稱","會員編號","VIP階級","是否有效VIP","VIP到期日",
      "來源會員","來源訂單","獎金類型","規則版本","適用制度","獎勵點來源","原始訂單獎勵點","代數","適用比例%",
      "責任額","是否完成責任額","應發貢獻點","實際發放貢獻點","實際領取人","改發原因","停發原因","狀態","計算說明","批次ID",
    ];
    const csvRows = rows.map((r: any) => {
      const m = members[r.member_id] ?? {};
      const src = members[r.source_member_id] ?? {};
      const rec = members[r.released_member_id] ?? {};
      const o = orders[r.source_order_id] ?? {};
      const released = r.status === "released" ? r.bonus_points : 0;
      const vip = vipStatusLabel(m, r.settlement_date);
      const meta = bonusRuleMeta(r.bonus_type);
      const d = r.calculation_detail ?? {};
      const req = d.required_points ?? d.daily_settlement?.responsibility_required_points ?? "";
      const passed = r.required_points_passed === true ? "是" : r.required_points_passed === false ? "否" : "";
      return [
        r.settlement_date ?? "", r.release_date ?? "", r.released_at ?? "",
        m.name ?? "", m.member_no ?? "", tiers[r.member_id] ?? "—", vip.label, m.vip_expires_at ?? "",
        src.name ? `${src.name}(${src.member_no ?? ""})` : "",
        o.order_no ?? r.source_order_id ?? "",
        bonusTypeLabel(r.bonus_type), d.rule_version ?? "", meta.rule, meta.source,
        r.base_amount ?? "", r.generation_level ?? r.layer_level ?? "",
        r.bonus_rate ?? "", req, passed, r.bonus_points ?? 0, released,
        rec.name ? `${rec.name}(${rec.member_no ?? ""})` : "",
        r.release_redirect_reason ?? "", r.fail_reason ?? "",
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

  // 依「實際領取人」聚合，只計入已成功發放（released）
  function aggregateRecipients() {
    const rows = payload?.rows ?? [];
    const members = payload?.members ?? {};
    const map = new Map<string, { member_no: string; name: string; income: number; count: number }>();
    for (const r of rows) {
      if (r.status !== "released") continue;
      const recipientId = r.released_member_id ?? r.member_id;
      const m = members[recipientId] ?? {};
      const key = recipientId ?? "unknown";
      const cur = map.get(key) ?? { member_no: m.member_no ?? "—", name: m.name ?? "—", income: 0, count: 0 };
      cur.income += Number(r.bonus_points ?? 0);
      cur.count += 1;
      map.set(key, cur);
    }
    return Array.from(map.values())
      .filter((x) => x.income > 0)
      .sort((a, b) => b.income - a.income);
  }

  function periodLabel() {
    if (filters.dateFrom && filters.dateTo && filters.dateFrom === filters.dateTo) return filters.dateFrom;
    return `${filters.dateFrom || "—"} ~ ${filters.dateTo || "—"}`;
  }

  function exportRecipientsCsv() {
    const data = aggregateRecipients();
    if (!data.length) { toast.info("此期間無已發放的收款人資料"); return; }
    const header = ["會員編號", "姓名", "收入貢獻點", "筆數"];
    const csvRows = data.map((r) => [r.member_no, r.name, r.income, r.count]
      .map((x) => `"${String(x ?? "").replace(/"/g, '""')}"`).join(","));
    const total = data.reduce((s, r) => s + r.income, 0);
    csvRows.push(["合計", "", total, data.reduce((s, r) => s + r.count, 0)]
      .map((x) => `"${x}"`).join(","));
    const blob = new Blob(["\uFEFF" + [header.join(","), ...csvRows].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `收款人明細-${periodLabel()}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  async function exportRecipientsPdf() {
    const data = aggregateRecipients();
    if (!data.length) { toast.info("此期間無已發放的收款人資料"); return; }
    const total = data.reduce((s, r) => s + r.income, 0);
    try {
      await exportPdfReport({
        title: "日結獎金收款人明細",
        subtitle: `期間：${periodLabel()}`,
        logoUrl: logo,
        filename: `收款人明細-${periodLabel()}.pdf`,
        meta: { 期間: periodLabel(), 收款人數: data.length, 合計貢獻點: total.toLocaleString() },
        columns: [
          { key: "member_no", label: "會員編號" },
          { key: "name", label: "姓名" },
          { key: "count", label: "筆數", align: "right" },
          { key: "income", label: "收入貢獻點", align: "right", format: (r: any) => Number(r.income).toLocaleString() },
        ],
        rows: data,
      });
    } catch (e: any) {
      toast.error(e?.message ?? "PDF 匯出失敗");
  }

  async function exportStatements() {
    const source = payload?.rows ?? [];
    const rows = filterIncome(source);
    if (!rows.length) { toast.info("此期間無可產出的獎金明細"); return; }
    try {
      const count = await exportDailyBonusStatements({
        rows, members: payload.members ?? {}, orders: payload.orders ?? {}, tiers: payload.tiers ?? {},
        filename: `日獎金明細表-${periodLabel()}.pdf`,
      });
      toast.success(`已產出 ${count} 張日獎金明細表`);
    } catch (e: any) { toast.error(e?.message ?? "產出失敗"); }
  }
  }

  const allRows: any[] = payload?.rows ?? [];
  const rows: any[] = showAll ? allRows : filterIncome(allRows);
  const hiddenCount = allRows.length - rows.length;
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
          <div className="pt-1 text-amber-700 dark:text-amber-400">
            ⚠ 全國分紅（national_share）已改為月結，日結明細不再提供該篩選；歷史日結資料顯示為「舊制全國分紅紀錄」，僅供追溯。月結結果請至「月獎金明細」查看。
          </div>
        </CardContent>
      </Card>


      <BonusFiltersCard
        filters={filters} setFilters={setFilters} preset={preset} setPreset={applyPreset}
        onLoad={load} loading={loading} onExport={exportCsv}
        typeOptions={DAILY_BONUS_TYPE_OPTIONS}
      />

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">收款人明細匯出</CardTitle>
          <CardDescription className="text-xs">
            依當前查詢期間，聚合每位「實際領取人」的已成功發放貢獻點（會員編號 / 姓名 / 收入 / 筆數）。點快速日期會自動套用起訖並重新查詢。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">快速日期：</span>
            <Button size="sm" variant="secondary" onClick={() => applyQuickDate(todayStr(), todayStr())} disabled={loading}>今天</Button>
            <Button size="sm" variant="secondary" onClick={() => applyQuickDate(yesterdayStr(), yesterdayStr())} disabled={loading}>昨天</Button>
            <Button size="sm" variant="secondary" onClick={() => applyQuickDate("2026-07-14", "2026-07-14")} disabled={loading}>7/14</Button>
            <Button size="sm" variant="secondary" onClick={() => applyQuickDate("2026-07-13", "2026-07-13")} disabled={loading}>7/13</Button>
            <Button size="sm" variant="secondary" onClick={() => applyQuickDate("2026-07-12", "2026-07-12")} disabled={loading}>7/12</Button>
            <div className="ml-auto text-xs text-muted-foreground">
              當前期間：<span className="font-mono">{periodLabel()}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={exportRecipientsCsv} disabled={loading}>
              <FileDown className="mr-2 h-4 w-4" />匯出收款人 CSV
            </Button>
            <Button variant="outline" onClick={exportRecipientsPdf} disabled={loading}>
              <FileText className="mr-2 h-4 w-4" />匯出收款人 PDF
            </Button>
          </div>
        </CardContent>
      </Card>


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

      <BonusIncomeSummary rows={allRows} title="日獎金收入總表" />

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base">明細（{rows.length} 筆）</CardTitle>
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
                    <TableHead>結算日期</TableHead>
                    <TableHead>發放日期</TableHead>
                    <TableHead>會員 / 編號</TableHead>
                    <TableHead>VIP階級</TableHead>
                    <TableHead>VIP有效 / 到期</TableHead>
                    <TableHead>獎金類型</TableHead>
                    <TableHead>規則</TableHead>
                    <TableHead>適用制度</TableHead>
                    <TableHead>來源會員 / 訂單</TableHead>
                    <TableHead className="text-right">代數</TableHead>
                    <TableHead className="text-right">原始獎勵點</TableHead>
                    <TableHead className="text-right">比例%</TableHead>
                    <TableHead className="text-right">責任額</TableHead>
                    <TableHead>已達成</TableHead>
                    <TableHead className="text-right">應發</TableHead>
                    <TableHead className="text-right">實發</TableHead>
                    <TableHead>實際領取人</TableHead>
                    <TableHead>改發 / 停發原因</TableHead>
                    <TableHead>狀態</TableHead>
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
                    const d = r.calculation_detail ?? {};
                    const req = d.required_points ?? d.daily_settlement?.responsibility_required_points ?? null;
                    const ruleV = d.rule_version ?? "—";
                    const stopReason = r.release_redirect_reason || r.fail_reason || d.block_reason || "—";
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="whitespace-nowrap">{r.settlement_date ?? "—"}</TableCell>
                        <TableCell className="whitespace-nowrap">{r.release_date ?? "—"}</TableCell>
                        <TableCell>
                          <div className="font-medium">{m.name ?? "—"}</div>
                          <div className="text-xs text-muted-foreground">{m.member_no ?? "—"}</div>
                        </TableCell>
                        <TableCell className="text-xs">{tiers[r.member_id] ?? "—"}</TableCell>
                        <TableCell className="text-xs">
                          <Badge variant={vip.valid ? "default" : "destructive"} title={vip.reason}>{vip.label}</Badge>
                          <div className="text-muted-foreground mt-0.5">{m.vip_expires_at ? String(m.vip_expires_at).slice(0, 10) : "—"}</div>
                        </TableCell>
                        <TableCell>
                          {r.bonus_type === "national_share"
                            ? <span title="全國分紅已改為月結，此為舊制日結歷史紀錄">舊制全國分紅紀錄</span>
                            : bonusTypeLabel(r.bonus_type)}
                        </TableCell>

                        <TableCell className="text-xs"><Badge variant="outline">{ruleV}</Badge></TableCell>
                        <TableCell className="text-xs max-w-[160px]">{meta.rule}</TableCell>
                        <TableCell className="text-xs">
                          {src ? <div className="font-medium">{src.name}<span className="text-muted-foreground"> ({src.member_no})</span></div> : "—"}
                          <div className="font-mono text-muted-foreground">{o?.order_no ?? (r.source_order_id ? r.source_order_id.slice(0, 8) : "—")}</div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{r.generation_level ?? r.layer_level ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmtN(r.base_amount)}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.bonus_rate ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">{req != null ? fmtN(req) : "—"}</TableCell>
                        <TableCell className="text-xs">
                          {r.required_points_passed === true ? <Badge>是</Badge>
                            : r.required_points_passed === false ? <Badge variant="destructive">否</Badge>
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-semibold">{fmtN(r.bonus_points)}</TableCell>
                        <TableCell className="text-right tabular-nums text-primary">{fmtN(released)}</TableCell>
                        <TableCell className="text-xs">
                          {rec ? <>{rec.name}<div className="text-muted-foreground">{rec.member_no}</div></> : "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[200px] whitespace-normal">{stopReason}</TableCell>
                        <TableCell>
                          <Badge variant={BONUS_STATUS_VARIANT[r.status] ?? "outline"}>{bonusStatusLabel(r.status)}</Badge>
                        </TableCell>
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
