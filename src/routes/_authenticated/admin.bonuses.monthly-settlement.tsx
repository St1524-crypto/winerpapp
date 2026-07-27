import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2, Info, Users, Target, TrendingUp, Award, Landmark, Search } from "lucide-react";
import { toast } from "sonner";
import { useAuth, type AppRole } from "@/hooks/use-auth";
import { ForbiddenScreen } from "@/components/ForbiddenScreen";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listMonthlyBonusDetails } from "@/lib/bonus.functions";

const ALLOWED: AppRole[] = ["super_admin", "admin", "finance"];

export const Route = createFileRoute("/_authenticated/admin/bonuses/monthly-settlement")({
  component: Guard,
  head: () => ({ meta: [{ title: "月獎金結算明細 | 獎金營運中心" }] }),
});

function Guard() {
  const { roles, loading } = useAuth();
  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!roles.some((r) => ALLOWED.includes(r))) return <ForbiddenScreen requiredRoles={ALLOWED} pageName="月獎金結算明細" />;
  return <Page />;
}

function currentYyyymm() {
  const d = new Date();
  const tw = new Date(d.getTime() + 8 * 3600 * 1000);
  return `${tw.getUTCFullYear()}${String(tw.getUTCMonth() + 1).padStart(2, "0")}`;
}

function periodOf(yyyymm: string) {
  if (!/^\d{6}$/.test(yyyymm)) return null;
  const y = Number(yyyymm.slice(0, 4));
  const m = Number(yyyymm.slice(4, 6));
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return {
    from: `${yyyymm.slice(0, 4)}-${yyyymm.slice(4, 6)}-01`,
    to: `${yyyymm.slice(0, 4)}-${yyyymm.slice(4, 6)}-${String(last).padStart(2, "0")}`,
    label: `${yyyymm.slice(0, 4)}-${yyyymm.slice(4, 6)}`,
  };
}

const fmt = (n: unknown) => {
  const v = Number(n ?? 0);
  return Number.isFinite(v) ? v.toLocaleString() : "0";
};

function calcDetail(r: any) {
  const d = r?.calculation_detail && typeof r.calculation_detail === "object" ? r.calculation_detail : {};
  const num = (v: unknown, fb = 0) => {
    const p = Number(v ?? fb);
    return Number.isFinite(p) ? p : fb;
  };
  return {
    selfPoints: num(d.self_points ?? d.source_self_points),
    firstGenerationPoints: num(d.first_generation_points ?? d.source_first_generation_points),
    requiredPoints: num(d.required_points ?? d.source_required_points),
    totalBasePoints: num(d.total_base_points ?? d.source_total_base_points ?? r?.base_amount),
    excessPoints: num(d.excess_points ?? d.source_excess_points),
    tierCode: (d.tier_snapshot?.code ?? d.tier_code ?? "") as string,
  };
}

const INCOME_STATUSES = new Set(["waiting_release", "released", "pending"]);

function Page() {
  const [yyyymm, setYyyymm] = useState(currentYyyymm());
  const [loading, setLoading] = useState(false);
  const [payload, setPayload] = useState<any>(null);

  const period = useMemo(() => periodOf(yyyymm), [yyyymm]);

  const load = useCallback(async () => {
    if (!period) { toast.error("月份格式錯誤，請輸入 6 碼 YYYYMM"); return; }
    setLoading(true);
    try {
      const res = await listMonthlyBonusDetails({
        data: { dateFrom: period.from, dateTo: period.to, limit: 5000 } as any,
      });
      setPayload(res);
    } catch (e: any) {
      toast.error(e?.message ?? "查詢失敗");
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const view = useMemo(() => {
    const rows: any[] = payload?.rows ?? [];
    const members: Record<string, any> = payload?.members ?? {};
    const tiers: Record<string, string> = payload?.tiers ?? {};

    // 月末（作為 VIP 有效性判定基準）
    const monthEnd = period ? new Date(`${period.to}T23:59:59+08:00`) : null;
    const vipStatus = (mid: string): { eligible: boolean; label: string } => {
      const m = members[mid];
      if (!m) return { eligible: false, label: "無 profile" };
      if (!m.is_vip) return { eligible: false, label: "非 VIP" };
      if (!m.vip_expires_at) return { eligible: true, label: "VIP 永久" };
      const exp = new Date(m.vip_expires_at);
      if (monthEnd && exp < monthEnd) {
        return { eligible: false, label: `VIP 到期 ${String(m.vip_expires_at).slice(0, 10)}` };
      }
      return { eligible: true, label: `至 ${String(m.vip_expires_at).slice(0, 10)}` };
    };

    const reasonOf = (r: any): string => {
      const d = r?.calculation_detail && typeof r.calculation_detail === "object" ? r.calculation_detail : {};
      return (
        r?.blocked_reason ??
        d?.blocked_reason ??
        d?.cap_reason ??
        d?.skip_reason ??
        d?.reason ??
        ""
      );
    };

    const capHit = (r: any): { hit: boolean; note: string } => {
      const d = r?.calculation_detail && typeof r.calculation_detail === "object" ? r.calculation_detail : {};
      const cap = Number(d?.cap_amount ?? d?.monthly_cap ?? d?.cap ?? 0);
      const paid = Number(d?.payable_amount ?? r?.bonus_points ?? 0);
      const requested = Number(d?.requested_amount ?? d?.raw_amount ?? 0);
      if (r?.status === "cancelled" || r?.status === "failed") {
        const reason = reasonOf(r);
        if (reason) return { hit: true, note: reason };
      }
      if (cap > 0 && requested > paid) {
        return { hit: true, note: `達上限 ${fmt(cap)}（原始 ${fmt(requested)} → 實發 ${fmt(paid)}）` };
      }
      if (cap > 0 && Number(d?.cumulative_amount ?? 0) >= cap) {
        return { hit: true, note: `已達累計上限 ${fmt(cap)}` };
      }
      return { hit: false, note: "" };
    };

    // 責任額達成情況（以 monthly_vip 記錄為主，其擁有 required_points_passed 快照）
    const monthly = rows.filter((r) => r.bonus_type === "monthly_vip");
    const passedMembers = new Set<string>();
    const failedMembers = new Set<string>();
    let sumSelf = 0, sumFirstGen = 0, sumRequired = 0, sumExcess = 0, sumMonthlyIncome = 0;
    for (const r of monthly) {
      const d = calcDetail(r);
      if (r.required_points_passed === true) passedMembers.add(r.member_id);
      else if (r.required_points_passed === false) failedMembers.add(r.member_id);
      sumSelf += d.selfPoints;
      sumFirstGen += d.firstGenerationPoints;
      sumRequired += d.requiredPoints;
      sumExcess += d.excessPoints;
      if (INCOME_STATUSES.has(r.status)) sumMonthlyIncome += Number(r.bonus_points ?? 0);
    }

    // 超額回饋（rank_rebate = 個人超額回饋）
    const rebate = rows.filter((r) => r.bonus_type === "rank_rebate");
    const rebateIncome = rebate.filter((r) => INCOME_STATUSES.has(r.status));
    const rebateSum = rebateIncome.reduce((s, r) => s + Number(r.bonus_points ?? 0), 0);
    const rebateByTier = new Map<string, { count: number; excess: number; points: number; members: Set<string> }>();
    for (const r of rebateIncome) {
      const d = calcDetail(r);
      const tier = tiers[r.member_id] || d.tierCode || "—";
      const b = rebateByTier.get(tier) ?? { count: 0, excess: 0, points: 0, members: new Set<string>() };
      b.count += 1;
      b.excess += d.excessPoints;
      b.points += Number(r.bonus_points ?? 0);
      b.members.add(r.member_id);
      rebateByTier.set(tier, b);
    }

    // 推薦級差（rank_diff_rebate = 上線級差回饋）
    const diff = rows.filter((r) => r.bonus_type === "rank_diff_rebate");
    const diffIncome = diff.filter((r) => INCOME_STATUSES.has(r.status));
    const diffBlocked = diff.filter((r) => !INCOME_STATUSES.has(r.status));
    const diffSum = diffIncome.reduce((s, r) => s + Number(r.bonus_points ?? 0), 0);
    const diffByTier = new Map<string, { count: number; points: number; members: Set<string> }>();
    for (const r of diffIncome) {
      const tier = tiers[r.member_id] || calcDetail(r).tierCode || "—";
      const b = diffByTier.get(tier) ?? { count: 0, points: 0, members: new Set<string>() };
      b.count += 1;
      b.points += Number(r.bonus_points ?? 0);
      b.members.add(r.member_id);
      diffByTier.set(tier, b);
    }

    // 建立每筆接收人卡片
    const buildRecipient = (r: any) => {
      const m = members[r.member_id] ?? {};
      const d = calcDetail(r);
      const tier = tiers[r.member_id] || d.tierCode || "—";
      const vip = vipStatus(r.member_id);
      const cap = capHit(r);
      const src = members[r.source_member_id] ?? {};
      return {
        id: r.id,
        member_id: r.member_id,
        name: m.name ?? "—",
        member_no: m.member_no ?? "—",
        tier,
        points: Number(r.bonus_points ?? 0),
        status: r.status as string,
        vipEligible: vip.eligible,
        vipLabel: vip.label,
        capHit: cap.hit,
        capNote: cap.note,
        reason: reasonOf(r),
        sourceName: src.name ?? null,
        sourceNo: src.member_no ?? null,
      };
    };
    const diffRecipients = diff.map(buildRecipient).sort((a, b) => b.points - a.points);

    // 全國分紅（STAR5~DIRECTOR，月結）
    const national = rows.filter((r) => r.bonus_type === "national_share");
    const nationalByTier = new Map<string, { members: Set<string>; released: number; waiting: number; blocked: number; poolAmount: number }>();
    for (const r of national) {
      const d = calcDetail(r);
      const tier = d.tierCode || tiers[r.member_id] || "—";
      const b = nationalByTier.get(tier) ?? { members: new Set<string>(), released: 0, waiting: 0, blocked: 0, poolAmount: 0 };
      b.members.add(r.member_id);
      const pts = Number(r.bonus_points ?? 0);
      if (r.status === "released") b.released += pts;
      else if (r.status === "waiting_release" || r.status === "pending") b.waiting += pts;
      else b.blocked += pts;
      const pa = Number((r.calculation_detail as any)?.pool_amount ?? 0);
      if (pa > b.poolAmount) b.poolAmount = pa;
      nationalByTier.set(tier, b);
    }
    const nationalRecipients = national.map(buildRecipient).sort((a, b) => {
      if (a.tier !== b.tier) return a.tier.localeCompare(b.tier);
      return b.points - a.points;
    });

    // 未達成明細（cancelled 且 required_points_passed=false）
    const failedList = monthly
      .filter((r) => r.required_points_passed === false)
      .map((r) => {
        const m = members[r.member_id] ?? {};
        const d = calcDetail(r);
        return {
          id: r.id,
          name: m.name ?? "—",
          member_no: m.member_no ?? "—",
          tier: tiers[r.member_id] ?? "—",
          selfPoints: d.selfPoints,
          required: d.requiredPoints,
          gap: Math.max(d.requiredPoints - d.selfPoints, 0),
        };
      })
      .sort((a, b) => b.gap - a.gap);

    return {
      passedCount: passedMembers.size,
      failedCount: failedMembers.size,
      sumSelf, sumFirstGen, sumRequired, sumExcess, sumMonthlyIncome,
      rebateSum, rebateMemberCount: new Set(rebateIncome.map((r) => r.member_id)).size,
      rebateByTier: Array.from(rebateByTier.entries()).map(([tier, v]) => ({ tier, ...v, memberCount: v.members.size })),
      diffSum, diffMemberCount: new Set(diffIncome.map((r) => r.member_id)).size, diffRecordCount: diffIncome.length,
      diffBlockedCount: diffBlocked.length,
      diffByTier: Array.from(diffByTier.entries()).map(([tier, v]) => ({ tier, ...v, memberCount: v.members.size })),
      diffRecipients,
      nationalByTier: Array.from(nationalByTier.entries()).map(([tier, v]) => ({
        tier, memberCount: v.members.size, released: v.released, waiting: v.waiting, blocked: v.blocked, poolAmount: v.poolAmount,
      })).sort((a, b) => a.tier.localeCompare(b.tier)),
      nationalRecipients,
      failedList,
      totalRecords: rows.length,
    };
  }, [payload, period]);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">月獎金結算明細</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            以「結算月份」彙整責任額達成、超額回饋、推薦級差與全國分紅的計算依據與人數分配。
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/admin/bonuses"><ArrowLeft className="mr-2 h-4 w-4" />回獎金營運中心</Link>
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">結算月份</CardTitle>
          <CardDescription className="text-xs">選擇要檢視的月份（YYYYMM），資料來源：<code>bonus_records</code>（月結類型）。</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label>月份 (YYYYMM)</Label>
            <Input inputMode="numeric" maxLength={6} className="w-40"
              value={yyyymm}
              onChange={(e) => setYyyymm(e.target.value.replace(/[^\d]/g, "").slice(0, 6))}
              placeholder="例如：202607" />
            <div className="text-xs text-muted-foreground">
              {period ? `對應期間：${period.from} ~ ${period.to}` : "格式錯誤"}
            </div>
          </div>
          <Button onClick={load} disabled={loading || !period}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
            查詢
          </Button>
          {period && (
            <Button asChild variant="outline">
              <Link to="/admin/bonuses/monthly-details"
                search={{ dateFrom: period.from, dateTo: period.to } as any}>
                跳轉：月獎金明細
              </Link>
            </Button>
          )}
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      ) : !payload ? null : view.totalRecords === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">此月份尚無月結獎金紀錄。</CardContent></Card>
      ) : (
        <>
          {/* Section 1: 責任額達成 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Target className="h-4 w-4 text-primary" />1. 責任額達成情況（月 VIP）</CardTitle>
              <CardDescription className="text-xs">
                資料來源：<code>bonus_type = monthly_vip</code>。責任額 = 該會員 VIP 位階對應之 <code>vip_required_points</code>；
                月達成基礎 = 自我消費（第一代累計採 <code>monthly_responsibility_points</code>）。
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-4">
              <Metric icon={<Users className="h-4 w-4" />} label="達成人數" value={view.passedCount} accent="text-green-600" />
              <Metric icon={<Users className="h-4 w-4" />} label="未達成人數" value={view.failedCount} accent="text-destructive" />
              <Metric label="自我消費總計" value={view.sumSelf} suffix="點" />
              <Metric label="第一代消費總計" value={view.sumFirstGen} suffix="點" />
              <Metric label="責任額門檻加總" value={view.sumRequired} suffix="點" />
              <Metric label="超額點數（人月加總）" value={view.sumExcess} suffix="點" />
              <Metric label="月 VIP 實發獎勵點" value={view.sumMonthlyIncome} suffix="點" accent="text-primary" />
              <Metric label="紀錄筆數" value={view.totalRecords} suffix="筆" />
            </CardContent>
            {view.failedList.length > 0 && (
              <CardContent>
                <div className="text-sm font-semibold mb-2">未達成名單（前 20 位差距最大）</div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>會員</TableHead><TableHead>編號</TableHead><TableHead>位階</TableHead>
                      <TableHead className="text-right">自我消費</TableHead>
                      <TableHead className="text-right">責任額</TableHead>
                      <TableHead className="text-right">差距</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {view.failedList.slice(0, 20).map((r) => (
                        <TableRow key={r.id}>
                          <TableCell>{r.name}</TableCell>
                          <TableCell className="font-mono text-xs">{r.member_no}</TableCell>
                          <TableCell><Badge variant="secondary">{r.tier}</Badge></TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(r.selfPoints)}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(r.required)}</TableCell>
                          <TableCell className="text-right tabular-nums text-destructive">{fmt(r.gap)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            )}
          </Card>

          {/* Section 2: 超額回饋 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4 text-primary" />2. 超額回饋（個人超額）</CardTitle>
              <CardDescription className="text-xs">
                資料來源：<code>bonus_type = rank_rebate</code>；計算依據：當月超過責任額之點數 × 位階 <code>exceeded_rebate_rate</code>（rank_rebate_settings）。
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-3">
              <Metric label="領取人數" value={view.rebateMemberCount} icon={<Users className="h-4 w-4" />} />
              <Metric label="實發獎勵點" value={view.rebateSum} suffix="點" accent="text-primary" />
              <Metric label="紀錄筆數" value={view.rebateByTier.reduce((s, x) => s + x.count, 0)} suffix="筆" />
            </CardContent>
            <CardContent>
              {view.rebateByTier.length === 0 ? (
                <div className="text-xs text-muted-foreground">本月無超額回饋。</div>
              ) : (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>位階</TableHead>
                    <TableHead className="text-right">領取人數</TableHead>
                    <TableHead className="text-right">超額點數合計</TableHead>
                    <TableHead className="text-right">回饋合計</TableHead>
                    <TableHead className="text-right">平均每人</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {view.rebateByTier.sort((a, b) => b.points - a.points).map((r) => (
                      <TableRow key={r.tier}>
                        <TableCell><Badge>{r.tier}</Badge></TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(r.memberCount)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(r.excess)}</TableCell>
                        <TableCell className="text-right tabular-nums font-semibold">{fmt(r.points)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(r.memberCount ? Math.round(r.points / r.memberCount) : 0)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Section 3: 推薦級差 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Award className="h-4 w-4 text-primary" />3. 推薦級差回饋（上線差額）</CardTitle>
              <CardDescription className="text-xs">
                資料來源：<code>bonus_type = rank_diff_rebate</code>；計算依據：下線超額 × (上線 rate − 下線 rate)，遇到不合格 VIP 跳過但不遞延。
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-3">
              <Metric label="領取人數" value={view.diffMemberCount} icon={<Users className="h-4 w-4" />} />
              <Metric label="實發獎勵點" value={view.diffSum} suffix="點" accent="text-primary" />
              <Metric label="紀錄筆數" value={view.diffRecordCount} suffix="筆" />
            </CardContent>
            <CardContent>
              {view.diffByTier.length === 0 ? (
                <div className="text-xs text-muted-foreground">本月無推薦級差回饋。</div>
              ) : (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>接收人位階</TableHead>
                    <TableHead className="text-right">領取人數</TableHead>
                    <TableHead className="text-right">紀錄筆數</TableHead>
                    <TableHead className="text-right">回饋合計</TableHead>
                    <TableHead className="text-right">平均每人</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {view.diffByTier.sort((a, b) => b.points - a.points).map((r) => (
                      <TableRow key={r.tier}>
                        <TableCell><Badge>{r.tier}</Badge></TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(r.memberCount)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(r.count)}</TableCell>
                        <TableCell className="text-right tabular-nums font-semibold">{fmt(r.points)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(r.memberCount ? Math.round(r.points / r.memberCount) : 0)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
            <CardContent>
              <RecipientList
                title="推薦級差 個別分配名單"
                emptyText="本月無級差分配紀錄。"
                caliber="口徑：僅列出實際落到接收人身上的級差紀錄；上線若 VIP 不合格或已到期，該筆狀態會為 cancelled 並附原因。「上限 / 取消原因」欄取自 calculation_detail.blocked_reason / cap_reason。"
                items={view.diffRecipients}
                showSource
              />
            </CardContent>
          </Card>


          {/* Section 4: 全國分紅 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Landmark className="h-4 w-4 text-primary" />4. 全國分紅（月結 STAR5~DIRECTOR）</CardTitle>
              <CardDescription className="text-xs">
                資料來源：<code>bonus_type = national_share</code>；每級 pool = 當月營業總獎勵點 × <code>national_bonus_pool_settings.pool_rate</code>，
                按該級有效人數平均分配，超過每月累計上限者停發並記錄 <code>blocked_reason</code>。
              </CardDescription>
            </CardHeader>
            <CardContent>
              {view.nationalByTier.length === 0 ? (
                <div className="text-xs text-muted-foreground">本月尚無全國分紅紀錄（月結尚未執行或無合格對象）。</div>
              ) : (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>星階</TableHead>
                    <TableHead className="text-right">合格人數</TableHead>
                    <TableHead className="text-right">Pool 金額</TableHead>
                    <TableHead className="text-right">已發放</TableHead>
                    <TableHead className="text-right">待發放</TableHead>
                    <TableHead className="text-right">已封鎖 / 取消</TableHead>
                    <TableHead className="text-right">平均每人</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {view.nationalByTier.map((r) => {
                      const total = r.released + r.waiting;
                      return (
                        <TableRow key={r.tier}>
                          <TableCell><Badge>{r.tier}</Badge></TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(r.memberCount)}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(r.poolAmount)}</TableCell>
                          <TableCell className="text-right tabular-nums text-primary">{fmt(r.released)}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(r.waiting)}</TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">{fmt(r.blocked)}</TableCell>
                          <TableCell className="text-right tabular-nums">{fmt(r.memberCount ? Math.round(total / r.memberCount) : 0)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
            <CardContent>
              <RecipientList
                title="全國分紅 個別分配名單"
                emptyText="本月尚無全國分紅接收人。"
                caliber="口徑：VIP 有效判定 = profile.is_vip=true 且 vip_expires_at ≥ 月底 23:59 (UTC+8)；每人平均分配額 = 該級 pool_amount ÷ 合格人數，若達每月累計上限（STAR5 20 萬 / STAR6 30 萬 / STAR7 40 萬 / DIRECTOR 50 萬）將截斷或停發並顯示原因。"
                items={view.nationalRecipients}
              />
            </CardContent>
          </Card>


          <Card className="border-primary/20 bg-primary/5">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm"><Info className="h-4 w-4" />備註</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground space-y-1">
              <div>‧ 各欄「實發 / 領取」僅計入狀態為 <code>released / waiting_release / pending</code> 的紀錄。</div>
              <div>‧ 位階分類優先使用 <code>calculation_detail.tier_snapshot.code</code> 快照，缺失時退回 <code>dealer_tier_status</code>。</div>
              <div>‧ 若「未達成」名單顯示為空，代表本月所有 monthly_vip 記錄皆已完成責任額或尚未寫入 <code>required_points_passed</code>。</div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function Metric({ icon, label, value, suffix, accent }: { icon?: React.ReactNode; label: string; value: number | string; suffix?: string; accent?: string }) {
  return (
    <div className="rounded-md border p-3 bg-background">
      <div className="text-xs text-muted-foreground flex items-center gap-1">{icon}{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${accent ?? ""}`}>
        {typeof value === "number" ? fmt(value) : value}
        {suffix && <span className="ml-1 text-xs font-normal text-muted-foreground">{suffix}</span>}
      </div>
    </div>
  );
}

type Recipient = {
  id: string;
  member_id: string;
  name: string;
  member_no: string;
  tier: string;
  points: number;
  status: string;
  vipEligible: boolean;
  vipLabel: string;
  capHit: boolean;
  capNote: string;
  reason: string;
  sourceName?: string | null;
  sourceNo?: string | null;
};

function statusBadge(s: string) {
  if (s === "released") return <Badge className="bg-green-600 hover:bg-green-600">已發放</Badge>;
  if (s === "waiting_release") return <Badge>待發放</Badge>;
  if (s === "pending") return <Badge variant="secondary">待處理</Badge>;
  if (s === "cancelled") return <Badge variant="outline" className="text-muted-foreground">已取消</Badge>;
  if (s === "failed") return <Badge variant="destructive">失敗</Badge>;
  return <Badge variant="secondary">{s}</Badge>;
}

function RecipientList({
  title,
  emptyText,
  caliber,
  items,
  showSource,
}: {
  title: string;
  emptyText: string;
  caliber: string;
  items: Recipient[];
  showSource?: boolean;
}) {
  const [showAll, setShowAll] = useState(false);
  const [onlyIncome, setOnlyIncome] = useState(false);
  const filtered = onlyIncome
    ? items.filter((x) => ["released", "waiting_release", "pending"].includes(x.status))
    : items;
  const visible = showAll ? filtered : filtered.slice(0, 50);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold">{title}（{filtered.length} 筆）</div>
        <div className="flex items-center gap-2 text-xs">
          <label className="flex items-center gap-1 cursor-pointer">
            <input type="checkbox" checked={onlyIncome} onChange={(e) => setOnlyIncome(e.target.checked)} />
            只看有收入
          </label>
          {filtered.length > 50 && (
            <Button variant="ghost" size="sm" onClick={() => setShowAll((v) => !v)}>
              {showAll ? "收合" : `顯示全部（+${filtered.length - 50}）`}
            </Button>
          )}
        </div>
      </div>
      <div className="rounded-md border bg-muted/30 p-2 text-xs text-muted-foreground">{caliber}</div>
      {filtered.length === 0 ? (
        <div className="text-xs text-muted-foreground py-4 text-center">{emptyText}</div>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>接收人</TableHead>
                <TableHead>編號</TableHead>
                <TableHead>位階</TableHead>
                <TableHead>VIP 狀態</TableHead>
                <TableHead>發放狀態</TableHead>
                <TableHead className="text-right">獎勵點</TableHead>
                {showSource && <TableHead>來源會員</TableHead>}
                <TableHead>上限 / 取消原因</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-nowrap">{r.name}</TableCell>
                  <TableCell className="font-mono text-xs">{r.member_no}</TableCell>
                  <TableCell><Badge variant="secondary">{r.tier}</Badge></TableCell>
                  <TableCell className="text-xs">
                    {r.vipEligible ? (
                      <span className="text-green-700 dark:text-green-400">合格 · {r.vipLabel}</span>
                    ) : (
                      <span className="text-destructive">不合格 · {r.vipLabel}</span>
                    )}
                  </TableCell>
                  <TableCell>{statusBadge(r.status)}</TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">{fmt(r.points)}</TableCell>
                  {showSource && (
                    <TableCell className="text-xs text-muted-foreground">
                      {r.sourceName ? `${r.sourceName}${r.sourceNo ? ` (${r.sourceNo})` : ""}` : "—"}
                    </TableCell>
                  )}
                  <TableCell className="text-xs">
                    {r.capHit ? (
                      <span className="text-amber-700 dark:text-amber-400">{r.capNote || r.reason || "已達上限"}</span>
                    ) : r.reason ? (
                      <span className="text-muted-foreground">{r.reason}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

}
