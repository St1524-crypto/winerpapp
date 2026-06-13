import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { settleMonthlyBonus } from "@/lib/monthly-settlement.server";

const ADMIN_ROLES = ["super_admin", "admin", "finance"];
const VIEW_ROLES = [...ADMIN_ROLES, "sales"];

async function assertRoles(userId: string, roles: string[]) {
  const { data } = await supabaseAdmin
    .from("user_roles").select("role").eq("user_id", userId);
  const list = (data ?? []).map((r: any) => r.role);
  if (!list.some((r) => roles.includes(r))) throw new Error("沒有權限");
  return list;
}

async function getSettings() {
  const { data } = await supabaseAdmin
    .from("bonus_settings").select("*").limit(1).maybeSingle();
  if (!data) throw new Error("bonus_settings 未初始化");
  return data as any;
}

/* ───────────── 設定：讀取 / 更新 ───────────── */
export const getBonusSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertRoles(context.userId, ADMIN_ROLES);
    const s = await getSettings();
    const { data: rb } = await supabaseAdmin
      .from("repurchase_bonus_settings").select("*").order("generation_level");
    const { data: rr } = await supabaseAdmin
      .from("rank_rebate_settings").select("*").order("sort_order");
    const { data: mt } = await supabaseAdmin
      .from("monthly_tier_bonus_settings").select("*").order("threshold_points");
    return { settings: s, repurchase: rb ?? [], rebate: rr ?? [], monthlyTiers: mt ?? [] };
  });


const updateSchema = z.object({
  daily_bonus_auto_enabled: z.boolean().optional(),
  daily_bonus_cycle_days: z.number().int().min(1).max(365).optional(),
  daily_next_settlement_at: z.string().optional(),
  monthly_bonus_mode: z.enum(["auto", "manual"]).optional(),
  monthly_bonus_settlement_day: z.number().int().min(1).max(28).optional(),
  vip_required_points: z.number().int().min(0).optional(),
  reward_release_days: z.number().int().min(0).max(365).optional(),
  reward_release_mode: z.enum(["auto", "manual"]).optional(),
});

export const updateBonusSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => updateSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertRoles(context.userId, ADMIN_ROLES);
    const s = await getSettings();
    const { error } = await supabaseAdmin
      .from("bonus_settings").update(data).eq("id", s.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ───────────── 復購比例設定 ───────────── */
export const upsertRepurchaseRate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      generation_level: z.number().int().min(1).max(20),
      bonus_rate: z.number().min(0).max(100),
      enabled: z.boolean().default(true),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertRoles(context.userId, ADMIN_ROLES);
    const { error } = await supabaseAdmin
      .from("repurchase_bonus_settings")
      .upsert(data, { onConflict: "generation_level" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ───────────── 位階回饋設定 ───────────── */
export const upsertRankRebate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      rank_code: z.string().min(1).max(32),
      rank_name: z.string().min(1).max(64),
      required_points: z.number().int().min(0),
      exceeded_rebate_rate: z.number().min(0).max(100),
      enabled: z.boolean().default(true),
      sort_order: z.number().int().default(0),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertRoles(context.userId, ADMIN_ROLES);
    const { error } = await supabaseAdmin
      .from("rank_rebate_settings")
      .upsert(data, { onConflict: "rank_code" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteRankRebate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertRoles(context.userId, ADMIN_ROLES);
    await supabaseAdmin.from("rank_rebate_settings").delete().eq("id", data.id);
    return { ok: true };
  });

/* ───────────── 月達成獎金階梯設定 ───────────── */
export const upsertMonthlyTier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid().optional(),
      threshold_points: z.number().int().min(0),
      bonus_rate: z.number().min(0).max(100),
      sort_order: z.number().int().default(0),
      enabled: z.boolean().default(true),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertRoles(context.userId, ADMIN_ROLES);
    const { error } = await supabaseAdmin
      .from("monthly_tier_bonus_settings")
      .upsert(data, { onConflict: "threshold_points" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteMonthlyTier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertRoles(context.userId, ADMIN_ROLES);
    await supabaseAdmin.from("monthly_tier_bonus_settings").delete().eq("id", data.id);
    return { ok: true };
  });


/* ───────────── 訂單付款 → 自動產生獎金 + 累計責任額 ─────────────
 * 依 sales_orders.order_type 判斷：
 *   - repurchase：上線 1/2 代復購獎金 + 買家月度責任額累計
 *   - upgrade   ：依 dealer_tiers.upgrade_referral_rate 差額制往上各階分潤
 *   - normal    ：不處理
 */
async function addMonthlyResponsibility(memberId: string, points: number, orderId: string) {
  if (points <= 0) return;
  const now = new Date();
  const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const { data: existing } = await supabaseAdmin
    .from("monthly_responsibility_points")
    .select("id, points, source_order_ids")
    .eq("member_id", memberId).eq("ym", ym).maybeSingle();
  if (existing) {
    const ids = ((existing as any).source_order_ids ?? []) as string[];
    if (ids.includes(orderId)) return;
    await supabaseAdmin.from("monthly_responsibility_points")
      .update({
        points: Number((existing as any).points ?? 0) + points,
        source_order_ids: [...ids, orderId],
      })
      .eq("id", (existing as any).id);
  } else {
    await supabaseAdmin.from("monthly_responsibility_points").insert({
      member_id: memberId, ym, points, source_order_ids: [orderId],
    });
  }
}

async function processRepurchase(orderId: string, buyerId: string, base: number) {
  if (base <= 0) return { inserted: 0, monthly: 0 };
  const { data: rates } = await supabaseAdmin
    .from("repurchase_bonus_settings").select("*").eq("enabled", true)
    .order("generation_level");
  const maxLevel = (rates ?? []).reduce((m, r: any) => Math.max(m, r.generation_level), 0);
  let currentId: string | null = buyerId;
  let inserted = 0;
  for (let level = 1; level <= maxLevel; level++) {
    if (!currentId) break;
    const { data: cur } = await supabaseAdmin
      .from("profiles").select("referred_by").eq("id", currentId).maybeSingle();
    const upline = (cur as any)?.referred_by as string | null;
    if (!upline) break;
    const rate = Number((rates ?? []).find((r: any) => r.generation_level === level)?.bonus_rate ?? 0);
    if (rate > 0) {
      const pts = Math.floor(base * rate / 100);
      if (pts > 0) {
        const { data: dup } = await supabaseAdmin.from("bonus_records")
          .select("id").eq("source_order_id", orderId)
          .eq("generation_level", level).eq("bonus_type", "repurchase").maybeSingle();
        if (!dup) {
          await supabaseAdmin.from("bonus_records").insert({
            member_id: upline, source_member_id: buyerId, source_order_id: orderId,
            bonus_type: "repurchase", generation_level: level,
            base_amount: base, bonus_rate: rate, bonus_points: pts, status: "pending",
          });
          inserted++;
        }
      }
    }
    currentId = upline;
  }
  await addMonthlyResponsibility(buyerId, base, orderId);
  return { inserted, monthly: base };
}

async function processUpgrade(orderId: string, buyerId: string, base: number) {
  if (base <= 0) return { inserted: 0 };
  const { data: tiers } = await supabaseAdmin
    .from("dealer_tiers")
    .select("code, upgrade_referral_rate")
    .gt("upgrade_referral_rate", 0);
  const tierMap = new Map<string, number>(
    (tiers ?? []).map((t: any) => [t.code, Number(t.upgrade_referral_rate)]),
  );
  const { data: statuses } = await supabaseAdmin
    .from("dealer_tier_status").select("user_id, current_tier");
  const userTier = new Map<string, string>(
    (statuses ?? []).map((s: any) => [s.user_id, s.current_tier]),
  );

  let currentId: string | null = buyerId;
  let paidRate = 0;
  let inserted = 0;
  const guard = new Set<string>([buyerId]);
  for (let i = 0; i < 20; i++) {
    if (!currentId) break;
    const { data: cur } = await supabaseAdmin
      .from("profiles").select("referred_by").eq("id", currentId).maybeSingle();
    const upline = (cur as any)?.referred_by as string | null;
    if (!upline || guard.has(upline)) break;
    guard.add(upline);

    const tierCode = userTier.get(upline);
    const tierRate = tierCode ? (tierMap.get(tierCode) ?? 0) : 0;
    if (tierRate > paidRate) {
      const diff = tierRate - paidRate;
      const pts = Math.floor(base * diff / 100);
      if (pts > 0) {
        const { data: dup } = await supabaseAdmin.from("bonus_records")
          .select("id").eq("source_order_id", orderId)
          .eq("member_id", upline).eq("bonus_type", "referral").maybeSingle();
        if (!dup) {
          await supabaseAdmin.from("bonus_records").insert({
            member_id: upline, source_member_id: buyerId, source_order_id: orderId,
            bonus_type: "referral", generation_level: i + 1,
            base_amount: base, bonus_rate: diff, bonus_points: pts, status: "pending",
          });
          inserted++;
        }
      }
      paidRate = tierRate;
    }
    currentId = upline;
  }
  return { inserted };
}

async function processOrderPaymentBonusInternal(orderId: string) {
  const { data: order } = await supabaseAdmin
    .from("sales_orders")
    .select("id, order_no, user_id, subtotal, payment_status, order_type, created_at")
    .eq("id", orderId).maybeSingle();
  if (!order) throw new Error("訂單不存在");
  if ((order as any).payment_status !== "paid") throw new Error("訂單未付款");
  const buyerId = (order as any).user_id as string | null;
  if (!buyerId) return { ok: true, skipped: "無買家" };
  const base = Number((order as any).subtotal ?? 0);
  const type = (order as any).order_type as string;

  if (type === "repurchase") {
    const r = await processRepurchase(orderId, buyerId, base);
    return { ok: true, type, ...r };
  }
  if (type === "upgrade") {
    const r = await processUpgrade(orderId, buyerId, base);
    return { ok: true, type, ...r };
  }
  return { ok: true, type, skipped: "一般訂單不發獎金" };
}

export const processOrderPaymentBonus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertRoles(context.userId, ADMIN_ROLES);
    return processOrderPaymentBonusInternal(data.orderId);
  });

export const generateRepurchaseForOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertRoles(context.userId, ADMIN_ROLES);
    return processOrderPaymentBonusInternal(data.orderId);
  });

/* ───────────── 推薦獎勵：產生 pending（不檢查責任額） ───────────── */
/** 由「綁定推薦人 + 首筆訂單 paid」或註冊獎勵呼叫；這裡提供管理員手動觸發。 */
export const generateReferralBonus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      referrerId: z.string().uuid(),
      sourceMemberId: z.string().uuid(),
      points: z.number().int().min(1),
      note: z.string().max(200).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertRoles(context.userId, ADMIN_ROLES);
    const { error } = await supabaseAdmin.from("bonus_records").insert({
      member_id: data.referrerId,
      source_member_id: data.sourceMemberId,
      bonus_type: "referral",
      base_amount: 0,
      bonus_rate: 0,
      bonus_points: data.points,
      status: "pending",
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ───────────── 日結算 ───────────── */
export const runDailySettlement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertRoles(context.userId, ADMIN_ROLES);
    const { data, error } = await (supabaseAdmin as any).rpc("settle_daily_bonus", {
      _created_by: context.userId,
      _advance_next: false,
    });
    if (error) throw new Error(error.message);
    return data;

    const s = await getSettings();

    const today = new Date();
    const todayStr = today.toISOString().slice(0, 10);
    const releaseDate = new Date(today.getTime() + s.reward_release_days * 86400000)
      .toISOString().slice(0, 10);

    // 撈取 pending 的日獎金（推薦 / 復購 / 位階回饋）
    const { data: pending } = await supabaseAdmin
      .from("bonus_records")
      .select("id, member_id, bonus_points")
      .in("bonus_type", ["referral", "repurchase", "rank_rebate"])
      .eq("status", "pending")
      .limit(5000);

    if (!pending || pending.length === 0) {
      return { ok: true, count: 0, batch_id: null };
    }

    const totalPoints = pending.reduce((s, r: any) => s + Number(r.bonus_points ?? 0), 0);
    const members = new Set(pending.map((r: any) => r.member_id)).size;

    const { data: batch, error: bErr } = await supabaseAdmin
      .from("bonus_settlement_batches").insert({
        settlement_type: "daily",
        settlement_period_start: todayStr,
        settlement_period_end: todayStr,
        total_members: members,
        total_bonus_points: totalPoints,
        status: "processing",
        created_by: context.userId,
      }).select("id").single();
    if (bErr) throw new Error(bErr.message);

    const ids = pending.map((r: any) => r.id);
    await supabaseAdmin
      .from("bonus_records")
      .update({
        status: "waiting_release",
        settlement_batch_id: (batch as any).id,
        settlement_date: todayStr,
        release_date: releaseDate,
      })
      .in("id", ids);

    await supabaseAdmin.from("bonus_settlement_batches")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", (batch as any).id);

    // 推進下次結算日期
    const next = new Date(today.getTime() + s.daily_bonus_cycle_days * 86400000);
    await supabaseAdmin.from("bonus_settings")
      .update({ daily_next_settlement_at: next.toISOString() })
      .eq("id", s.id);

    return { ok: true, count: pending.length, batch_id: (batch as any).id, points: totalPoints };
  });

/* ───────────── 月結算（VIP 責任額 + 超額回饋） ───────────── */
export const runMonthlySettlement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ yyyymm: z.string().regex(/^\d{6}$/).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertRoles(context.userId, ADMIN_ROLES);
    return settleMonthlyBonus({
      yyyymm: data.yyyymm,
      createdBy: context.userId,
      source: "admin",
    });

    const s = await getSettings();

    const now = new Date();
    const ym = data.yyyymm ?? `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
    const year = Number(ym.slice(0, 4));
    const month = Number(ym.slice(4, 6));
    const periodStart = new Date(Date.UTC(year, month - 1, 1));
    const periodEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59));
    const startStr = periodStart.toISOString().slice(0, 10);
    const endStr = periodEnd.toISOString().slice(0, 10);
    const settleDate = endStr;
    const releaseDate = new Date(periodEnd.getTime() + s.reward_release_days * 86400000)
      .toISOString().slice(0, 10);

    // 撈 VIP 會員
    const { data: vips } = await supabaseAdmin
      .from("profiles")
      .select("id, is_vip, vip_expires_at, member_no, name");
    const activeVips = (vips ?? []).filter((p: any) => {
      if (!p.is_vip) return false;
      if (!p.vip_expires_at) return true;
      return new Date(p.vip_expires_at) >= periodEnd;
    });

    if (activeVips.length === 0) {
      return { ok: true, count: 0 };
    }

    // 撈位階回饋設定
    const { data: rankRules } = await supabaseAdmin
      .from("rank_rebate_settings").select("*").eq("enabled", true).order("sort_order");
    const defaultRank = (rankRules ?? [])[0] as any;

    // 撈月達成獎金階梯設定（依門檻由小到大）
    const { data: tiersRaw } = await supabaseAdmin
      .from("monthly_tier_bonus_settings").select("*").eq("enabled", true)
      .order("threshold_points");
    const tiers = (tiersRaw ?? []) as Array<{ threshold_points: number; bonus_rate: number }>;

    // 撈本月所有月度責任額（用於計算第一代下線消費）
    const { data: allMrp } = await supabaseAdmin
      .from("monthly_responsibility_points").select("member_id, points").eq("ym", ym);
    const mrpMap: Record<string, number> = {};
    (allMrp ?? []).forEach((r: any) => { mrpMap[r.member_id] = Number(r.points ?? 0); });

    // 撈所有 referred_by 對應，以建立 vip -> 第一代下線清單
    const { data: refRows } = await supabaseAdmin
      .from("profiles").select("id, referred_by").not("referred_by", "is", null);
    const childrenMap: Record<string, string[]> = {};
    (refRows ?? []).forEach((p: any) => {
      const up = p.referred_by as string;
      (childrenMap[up] ||= []).push(p.id);
    });

    const { data: batch, error: bErr } = await supabaseAdmin
      .from("bonus_settlement_batches").insert({
        settlement_type: "monthly",
        settlement_period_start: startStr,
        settlement_period_end: endStr,
        status: "processing",
        created_by: context.userId,
      }).select("id").single();
    if (bErr) throw new Error(bErr.message);

    let granted = 0;
    let totalPts = 0;

    function pickTierRate(amount: number): number {
      let rate = 0;
      for (const t of tiers) {
        if (amount >= Number(t.threshold_points)) rate = Number(t.bonus_rate);
      }
      return rate;
    }

    for (const vip of activeVips) {
      const vipId = (vip as any).id as string;
      const selfPts = mrpMap[vipId] ?? 0;
      const firstGen = childrenMap[vipId] ?? [];
      const firstGenPts = firstGen.reduce((sum, cid) => sum + (mrpMap[cid] ?? 0), 0);
      const totalBase = selfPts + firstGenPts;

      const rule = defaultRank;
      const required = rule?.required_points ?? s.vip_required_points;
      const passed = totalBase >= required;

      const tierRate = passed ? pickTierRate(totalBase) : 0;
      const bonusPoints = tierRate > 0 ? Math.floor(totalBase * tierRate / 100) : 0;

      await supabaseAdmin.from("bonus_records").insert({
        member_id: vipId,
        bonus_type: "monthly_vip",
        base_amount: totalBase,
        bonus_rate: tierRate,
        bonus_points: bonusPoints,
        required_points_checked: true,
        required_points_passed: passed,
        fail_reason: passed
          ? (tierRate === 0 ? `未達任一加發門檻 (${totalBase})` : null)
          : `當月自我+第一代 ${totalBase}/${required} 未達標`,
        status: passed && bonusPoints > 0 ? "waiting_release" : "cancelled",
        settlement_batch_id: (batch as any).id,
        settlement_date: settleDate,
        release_date: passed && bonusPoints > 0 ? releaseDate : null,
      }).then(() => {});

      if (passed && bonusPoints > 0) {
        granted++;
        totalPts += bonusPoints;
      }

      // 超額回饋（保留位階回饋機制，以個人責任額為基礎）
      if (passed && rule && selfPts > required && rule.exceeded_rebate_rate > 0) {
        const excess = selfPts - required;
        const rebate = Math.floor(excess * Number(rule.exceeded_rebate_rate) / 100);
        if (rebate > 0) {
          await supabaseAdmin.from("bonus_records").insert({
            member_id: vipId,
            bonus_type: "rank_rebate",
            base_amount: excess,
            bonus_rate: rule.exceeded_rebate_rate,
            bonus_points: rebate,
            required_points_checked: true,
            required_points_passed: true,
            status: "waiting_release",
            settlement_batch_id: (batch as any).id,
            settlement_date: settleDate,
            release_date: releaseDate,
          });
          granted++;
          totalPts += rebate;
        }
      }
    }


    await supabaseAdmin.from("bonus_settlement_batches")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        total_members: granted,
        total_bonus_points: totalPts,
      })
      .eq("id", (batch as any).id);

    return { ok: true, count: granted, batch_id: (batch as any).id, points: totalPts };
  });

/* ───────────── 發放（自動 / 手動） ───────────── */
async function releaseRecords(recordIds: string[] | null) {
  const { data, error } = await (supabaseAdmin as any).rpc("release_bonus_rewards", {
    _record_ids: recordIds,
    _limit: recordIds ? recordIds.length : 2000,
  });
  if (error) throw new Error(error.message);
  return data;

  const query = supabaseAdmin
    .from("bonus_records")
    .select("id, member_id, bonus_points, bonus_type")
    .eq("status", "waiting_release");
  const { data: list } = recordIds
    ? await query.in("id", recordIds)
    : await query.lte("release_date", new Date().toISOString().slice(0, 10));

  if (!list || list.length === 0) return { released: 0, points: 0 };

  let totalPts = 0;
  for (const r of list) {
    const pts = Number((r as any).bonus_points ?? 0);
    if (pts <= 0) {
      await supabaseAdmin.from("bonus_records")
        .update({ status: "released", released_at: new Date().toISOString() })
        .eq("id", (r as any).id);
      continue;
    }
    // 入錢包
    const { data: w0 } = await supabaseAdmin
      .from("member_points_wallet").select("reward_points").eq("user_id", (r as any).member_id).maybeSingle();
    if (!w0) {
      await supabaseAdmin.from("member_points_wallet").insert({ user_id: (r as any).member_id });
    }
    const current = Number((w0 as any)?.reward_points ?? 0);
    const after = current + pts;
    await supabaseAdmin.from("member_points_wallet")
      .update({ reward_points: after, updated_at: new Date().toISOString() })
      .eq("user_id", (r as any).member_id);
    await supabaseAdmin.from("point_transactions").insert({
      user_id: (r as any).member_id,
      point_type: "reward",
      amount: pts,
      balance_after: after,
      source: `bonus_${(r as any).bonus_type}`,
      reference_id: (r as any).id,
      note: `獎金發放 (${(r as any).bonus_type})`,
    });
    await supabaseAdmin.from("bonus_records")
      .update({ status: "released", released_at: new Date().toISOString() })
      .eq("id", (r as any).id);
    await supabaseAdmin.from("reward_wallet_logs").insert({
      member_id: (r as any).member_id,
      bonus_record_id: (r as any).id,
      points: pts,
      type: "earn",
      status: "success",
      description: `獎金發放 (${(r as any).bonus_type})`,
    });
    totalPts += pts;
  }
  return { released: list.length, points: totalPts };
}

export const releaseDueRewards = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertRoles(context.userId, ADMIN_ROLES);
    return releaseRecords(null);
  });

export const manualReleaseRewards = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ recordIds: z.array(z.string().uuid()).min(1).max(500) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertRoles(context.userId, ADMIN_ROLES);
    return releaseRecords(data.recordIds);
  });

export const retryFailedBonusRewards = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ recordIds: z.array(z.string().uuid()).min(1).max(500) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertRoles(context.userId, ADMIN_ROLES);

    const { data: failedRows, error: fetchError } = await supabaseAdmin
      .from("bonus_records")
      .select("id")
      .eq("status", "failed")
      .in("id", data.recordIds);
    if (fetchError) throw new Error(fetchError.message);

    const ids = (failedRows ?? []).map((row: any) => row.id);
    if (ids.length === 0) return { retried: 0, released: 0, points: 0 };

    const { error: updateError } = await supabaseAdmin
      .from("bonus_records")
      .update({
        status: "waiting_release",
        fail_reason: null,
        release_date: new Date().toISOString().slice(0, 10),
      })
      .in("id", ids);
    if (updateError) throw new Error(updateError.message);

    const releaseResult = await releaseRecords(ids);
    return { retried: ids.length, ...(releaseResult ?? {}) };
  });

/* ───────────── 列表查詢 ───────────── */
export const listSettlementBatches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertRoles(context.userId, VIEW_ROLES);
    const { data } = await supabaseAdmin
      .from("bonus_settlement_batches").select("*")
      .order("created_at", { ascending: false }).limit(100);
    return data ?? [];
  });

export const listBonusRecords = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      status: z.string().optional(),
      bonusType: z.string().optional(),
      memberId: z.string().uuid().optional(),
      limit: z.number().int().max(500).default(200),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertRoles(context.userId, VIEW_ROLES);
    let q = supabaseAdmin.from("bonus_records").select("*")
      .order("created_at", { ascending: false }).limit(data.limit);
    if (data.status) q = q.eq("status", data.status);
    if (data.bonusType) q = q.eq("bonus_type", data.bonusType);
    if (data.memberId) q = q.eq("member_id", data.memberId);
    const { data: rows } = await q;
    if (!rows || rows.length === 0) return { records: [], members: {} };

    const memberIds = Array.from(new Set(
      rows.flatMap((r: any) => [r.member_id, r.source_member_id]).filter(Boolean),
    ));
    const { data: profs } = await supabaseAdmin
      .from("profiles").select("id, name, member_no").in("id", memberIds);
    const memberMap: Record<string, any> = {};
    (profs ?? []).forEach((p: any) => { memberMap[p.id] = p; });
    return { records: rows, members: memberMap };
  });

/* ───────────── Admin：獎金營運中心查詢 ───────────── */
const OPERATIONS_BATCH_LIMIT = 50;
const OPERATIONS_RECORD_LIMIT = 200;

async function countBonusRecordsByStatus(status: string) {
  const { count, error } = await supabaseAdmin
    .from("bonus_records")
    .select("id", { count: "exact", head: true })
    .eq("status", status);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function countSettlementBatchesByType(settlementType: string) {
  const { count, error } = await supabaseAdmin
    .from("bonus_settlement_batches")
    .select("id", { count: "exact", head: true })
    .eq("settlement_type", settlementType);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function listOperationsBatches(settlementType: string) {
  const { data, error } = await supabaseAdmin
    .from("bonus_settlement_batches")
    .select("*")
    .eq("settlement_type", settlementType)
    .order("created_at", { ascending: false })
    .limit(OPERATIONS_BATCH_LIMIT);
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function listOperationsRecords(status: string) {
  const { data, error } = await supabaseAdmin
    .from("bonus_records")
    .select("*")
    .eq("status", status)
    .order("created_at", { ascending: false })
    .limit(OPERATIONS_RECORD_LIMIT);
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function listOperationsRecordsByType(bonusType: string) {
  const { data, error } = await supabaseAdmin
    .from("bonus_records")
    .select("*")
    .eq("bonus_type", bonusType)
    .order("created_at", { ascending: false })
    .limit(OPERATIONS_RECORD_LIMIT);
  if (error) throw new Error(error.message);
  return data ?? [];
}

async function getMemberMapForBonusRows(rows: any[]) {
  const memberIds = Array.from(new Set(
    rows.flatMap((row: any) => [row.member_id, row.source_member_id]).filter(Boolean),
  ));
  if (memberIds.length === 0) return {};

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, name, member_no")
    .in("id", memberIds);
  if (error) throw new Error(error.message);

  const memberMap: Record<string, any> = {};
  (data ?? []).forEach((profile: any) => { memberMap[profile.id] = profile; });
  return memberMap;
}

export const getBonusOperationsData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertRoles(context.userId, VIEW_ROLES);

    const [
      dailyBatchCount,
      monthlyBatchCount,
      waitingCount,
      releasedCount,
      failedCount,
      dailyBatches,
      monthlyBatches,
      waitingRecords,
      releasedRecords,
      failedRecords,
      referralRecords,
      repurchaseRecords,
      settings,
    ] = await Promise.all([
      countSettlementBatchesByType("daily"),
      countSettlementBatchesByType("monthly"),
      countBonusRecordsByStatus("waiting_release"),
      countBonusRecordsByStatus("released"),
      countBonusRecordsByStatus("failed"),
      listOperationsBatches("daily"),
      listOperationsBatches("monthly"),
      listOperationsRecords("waiting_release"),
      listOperationsRecords("released"),
      listOperationsRecords("failed"),
      listOperationsRecordsByType("referral"),
      listOperationsRecordsByType("repurchase"),
      getSettings(),
    ]);

    const members = await getMemberMapForBonusRows([
      ...waitingRecords,
      ...releasedRecords,
      ...failedRecords,
      ...referralRecords,
      ...repurchaseRecords,
    ]);

    return {
      summary: {
        dailyBatches: dailyBatchCount,
        monthlyBatches: monthlyBatchCount,
        waitingRelease: waitingCount,
        released: releasedCount,
        failed: failedCount,
      },
      batches: {
        daily: dailyBatches,
        monthly: monthlyBatches,
      },
      records: {
        waiting: waitingRecords,
        released: releasedRecords,
        failed: failedRecords,
        referral: referralRecords,
        repurchase: repurchaseRecords,
      },
      settings: {
        dailyBonusAutoEnabled: Boolean(settings.daily_bonus_auto_enabled),
        monthlyBonusMode: settings.monthly_bonus_mode,
        rewardReleaseDays: Number(settings.reward_release_days ?? 7),
        dailyNextSettlementAt: settings.daily_next_settlement_at,
        monthlyBonusSettlementDay: Number(settings.monthly_bonus_settlement_day ?? 1),
      },
      members,
    };
  });

/* ───────────── 會員端：我的獎勵點 ───────────── */
export const getMyBonusRecords = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: rows } = await supabaseAdmin
      .from("bonus_records").select("*")
      .eq("member_id", context.userId)
      .order("created_at", { ascending: false }).limit(300);
    const s = await getSettings();

    // 本月個人責任額 (來自復購訂單實付金額)
    const now = new Date();
    const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
    const { data: mrp } = await supabaseAdmin
      .from("monthly_responsibility_points").select("points")
      .eq("member_id", context.userId).eq("ym", ym).maybeSingle();
    const monthlyPts = Number((mrp as any)?.points ?? 0);

    return {
      records: rows ?? [],
      monthly_points: monthlyPts,
      vip_required_points: s.vip_required_points,
      reward_release_days: s.reward_release_days,
    };
  });
