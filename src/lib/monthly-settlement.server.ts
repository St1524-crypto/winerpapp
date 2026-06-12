import { supabaseAdmin } from "@/integrations/supabase/client.server";

type MonthlySettlementSource = "admin" | "cron";

type MonthlySettlementInput = {
  yyyymm?: string;
  createdBy?: string | null;
  source?: MonthlySettlementSource;
};

type ExistingBatch = {
  id: string;
  status: string;
  total_members: number | null;
  total_bonus_points: number | null;
};

function monthParts(yyyymm?: string) {
  const now = new Date();
  const ym = yyyymm ?? `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  if (!/^\d{6}$/.test(ym)) throw new Error("Invalid settlement month");

  const year = Number(ym.slice(0, 4));
  const month = Number(ym.slice(4, 6));
  if (month < 1 || month > 12) throw new Error("Invalid settlement month");

  const periodStart = new Date(Date.UTC(year, month - 1, 1));
  const periodEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59));

  return {
    ym,
    periodStart,
    periodEnd,
    startStr: periodStart.toISOString().slice(0, 10),
    endStr: periodEnd.toISOString().slice(0, 10),
  };
}

async function getSettings() {
  const { data, error } = await supabaseAdmin
    .from("bonus_settings")
    .select("*")
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("bonus_settings not found");
  return data as any;
}

async function findActiveMonthlyBatch(startStr: string, endStr: string): Promise<ExistingBatch | null> {
  const { data, error } = await supabaseAdmin
    .from("bonus_settlement_batches")
    .select("id, status, total_members, total_bonus_points")
    .eq("settlement_type", "monthly")
    .eq("settlement_period_start", startStr)
    .eq("settlement_period_end", endStr)
    .in("status", ["processing", "completed"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as ExistingBatch | null) ?? null;
}

function isUniqueViolation(error: { code?: string; message?: string } | null) {
  return error?.code === "23505" || /duplicate key|unique/i.test(error?.message ?? "");
}

export async function settleMonthlyBonus({
  yyyymm,
  createdBy = null,
  source = "admin",
}: MonthlySettlementInput = {}) {
  const { ym, periodEnd, startStr, endStr } = monthParts(yyyymm);
  const existing = await findActiveMonthlyBatch(startStr, endStr);
  if (existing) {
    return {
      ok: true,
      skipped: true,
      reason: existing.status === "completed" ? "already_settled" : "already_processing",
      yyyymm: ym,
      count: Number(existing.total_members ?? 0),
      points: Number(existing.total_bonus_points ?? 0),
      batch_id: existing.id,
    };
  }

  const s = await getSettings();
  const settleDate = endStr;
  const releaseDate = new Date(periodEnd.getTime() + Number(s.reward_release_days) * 86400000)
    .toISOString()
    .slice(0, 10);

  const { data: batch, error: batchError } = await supabaseAdmin
    .from("bonus_settlement_batches")
    .insert({
      settlement_type: "monthly",
      settlement_period_start: startStr,
      settlement_period_end: endStr,
      status: "processing",
      created_by: createdBy,
      notes: `${source} monthly settlement ${ym}`,
    })
    .select("id")
    .single();

  if (batchError) {
    if (isUniqueViolation(batchError)) {
      const current = await findActiveMonthlyBatch(startStr, endStr);
      return {
        ok: true,
        skipped: true,
        reason: current?.status === "completed" ? "already_settled" : "already_processing",
        yyyymm: ym,
        count: Number(current?.total_members ?? 0),
        points: Number(current?.total_bonus_points ?? 0),
        batch_id: current?.id ?? null,
      };
    }
    throw new Error(batchError.message);
  }

  const batchId = (batch as any).id as string;

  try {
    const { data: vips, error: vipError } = await supabaseAdmin
      .from("profiles")
      .select("id, is_vip, vip_expires_at, member_no, name");
    if (vipError) throw new Error(vipError.message);

    const activeVips = (vips ?? []).filter((p: any) => {
      if (!p.is_vip) return false;
      if (!p.vip_expires_at) return true;
      return new Date(p.vip_expires_at) >= periodEnd;
    });

    const { data: rankRules, error: rankError } = await supabaseAdmin
      .from("rank_rebate_settings")
      .select("*")
      .eq("enabled", true)
      .order("sort_order");
    if (rankError) throw new Error(rankError.message);
    const defaultRank = (rankRules ?? [])[0] as any;

    const { data: tiersRaw, error: tierError } = await supabaseAdmin
      .from("monthly_tier_bonus_settings")
      .select("*")
      .eq("enabled", true)
      .order("threshold_points");
    if (tierError) throw new Error(tierError.message);
    const tiers = (tiersRaw ?? []) as Array<{ threshold_points: number; bonus_rate: number }>;

    const { data: allMrp, error: mrpError } = await supabaseAdmin
      .from("monthly_responsibility_points")
      .select("member_id, points")
      .eq("ym", ym);
    if (mrpError) throw new Error(mrpError.message);
    const mrpMap: Record<string, number> = {};
    (allMrp ?? []).forEach((r: any) => {
      mrpMap[r.member_id] = Number(r.points ?? 0);
    });

    const { data: refRows, error: refError } = await supabaseAdmin
      .from("profiles")
      .select("id, referred_by")
      .not("referred_by", "is", null);
    if (refError) throw new Error(refError.message);
    const childrenMap: Record<string, string[]> = {};
    (refRows ?? []).forEach((p: any) => {
      const up = p.referred_by as string;
      (childrenMap[up] ||= []).push(p.id);
    });

    let granted = 0;
    let totalPts = 0;

    function pickTierRate(amount: number): number {
      let rate = 0;
      for (const t of tiers) {
        if (amount >= Number(t.threshold_points)) rate = Number(t.bonus_rate);
      }
      return rate;
    }

    async function insertMonthlyRecord(record: Record<string, any>) {
      const { error } = await supabaseAdmin.from("bonus_records").insert(record);
      if (error) throw new Error(error.message);
    }

    for (const vip of activeVips) {
      const vipId = (vip as any).id as string;
      const selfPts = mrpMap[vipId] ?? 0;
      const firstGen = childrenMap[vipId] ?? [];
      const firstGenPts = firstGen.reduce((sum, cid) => sum + (mrpMap[cid] ?? 0), 0);
      const totalBase = selfPts + firstGenPts;

      const rule = defaultRank;
      const required = Number(rule?.required_points ?? s.vip_required_points ?? 200);
      const passed = totalBase >= required;
      const tierRate = passed ? pickTierRate(totalBase) : 0;
      const bonusPoints = passed && tierRate > 0 ? Math.floor(totalBase * tierRate / 100) : 0;

      await insertMonthlyRecord({
        member_id: vipId,
        bonus_type: "monthly_vip",
        base_amount: totalBase,
        bonus_rate: tierRate,
        bonus_points: bonusPoints,
        required_points_checked: true,
        required_points_passed: passed,
        fail_reason: passed
          ? (tierRate === 0 ? `No monthly tier matched (${totalBase})` : null)
          : `Monthly responsibility not met: ${totalBase}/${required}`,
        status: passed && bonusPoints > 0 ? "waiting_release" : "cancelled",
        settlement_batch_id: batchId,
        settlement_date: settleDate,
        release_date: passed && bonusPoints > 0 ? releaseDate : null,
      });

      if (passed && bonusPoints > 0) {
        granted++;
        totalPts += bonusPoints;
      }

      if (passed && rule && selfPts > required && Number(rule.exceeded_rebate_rate) > 0) {
        const excess = selfPts - required;
        const rebate = Math.floor(excess * Number(rule.exceeded_rebate_rate) / 100);
        if (rebate > 0) {
          await insertMonthlyRecord({
            member_id: vipId,
            bonus_type: "rank_rebate",
            base_amount: excess,
            bonus_rate: rule.exceeded_rebate_rate,
            bonus_points: rebate,
            required_points_checked: true,
            required_points_passed: true,
            status: "waiting_release",
            settlement_batch_id: batchId,
            settlement_date: settleDate,
            release_date: releaseDate,
          });
          granted++;
          totalPts += rebate;
        }
      }
    }

    const { error: completeError } = await supabaseAdmin
      .from("bonus_settlement_batches")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        total_members: granted,
        total_bonus_points: totalPts,
      })
      .eq("id", batchId);
    if (completeError) throw new Error(completeError.message);

    return { ok: true, skipped: false, yyyymm: ym, count: granted, batch_id: batchId, points: totalPts };
  } catch (error: any) {
    await supabaseAdmin.from("bonus_records").delete().eq("settlement_batch_id", batchId);
    await supabaseAdmin
      .from("bonus_settlement_batches")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        notes: `${source} monthly settlement ${ym} failed: ${error.message}`,
      })
      .eq("id", batchId);
    throw error;
  }
}
