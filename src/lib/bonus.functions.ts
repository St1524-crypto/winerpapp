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
 *   - upgrade   ：依 dealer_tiers.daily_referral_rate 差額制往上各階分潤（日獎金推薦）
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

function isValidVipForBonus(profile: any, referenceDate = new Date()) {
  if (!profile?.is_vip || !profile?.vip_expires_at) return false;
  return new Date(profile.vip_expires_at) >= referenceDate;
}

function bonusYmFromDate(date?: string | Date) {
  const refDate = date ? new Date(date) : new Date();
  return `${refDate.getFullYear()}${String(refDate.getMonth() + 1).padStart(2, "0")}`;
}

function buildVipSnapshot(profile: any, referenceDate = new Date()) {
  return {
    is_vip: !!profile?.is_vip,
    vip_expires_at: profile?.vip_expires_at ?? null,
    valid_at: referenceDate.toISOString(),
    valid: isValidVipForBonus(profile, referenceDate),
  };
}

async function getMonthlyResponsibilitySnapshot(memberId: string, orderDate?: string) {
  const ym = bonusYmFromDate(orderDate);
  const [{ data: row }, { data: settings }] = await Promise.all([
    supabaseAdmin
      .from("monthly_responsibility_points")
      .select("points")
      .eq("member_id", memberId)
      .eq("ym", ym)
      .maybeSingle(),
    supabaseAdmin.from("bonus_settings").select("vip_required_points").order("created_at").limit(1).maybeSingle(),
  ]);
  const points = Number((row as any)?.points ?? 0);
  const requiredPoints = Number((settings as any)?.vip_required_points ?? 0);
  return {
    ym,
    points,
    required_points: requiredPoints,
    passed: points >= requiredPoints,
  };
}

async function getOrderGeneratedRewardPoints(orderId: string) {
  const { data: items, error } = await supabaseAdmin
    .from("sales_order_items")
    .select("product_id, quantity, tier_reward_points, bundle_id")
    .eq("sales_order_id", orderId);
  if (error) throw new Error(error.message);

  const rows = (items ?? []) as any[];
  const bundleRows = rows.filter((row) => row.bundle_id);
  const soloRows = rows.filter((row) => !row.bundle_id);
  let rewardPoints = 0;

  for (const row of soloRows) {
    const quantity = Math.max(0, Number(row.quantity ?? 0));
    let unitReward = Number(row.tier_reward_points ?? 0);
    if (unitReward <= 0 && row.product_id) {
      const { data: product } = await supabaseAdmin
        .from("products")
        .select("reward_points")
        .eq("id", row.product_id)
        .maybeSingle();
      unitReward = Number((product as any)?.reward_points ?? 0);
    }
    rewardPoints += unitReward * quantity;
  }

  if (bundleRows.length > 0) {
    const bundleIds = Array.from(new Set(bundleRows.map((row) => row.bundle_id as string)));
    const [{ data: bundles }, { data: bundleItems }] = await Promise.all([
      supabaseAdmin.from("repurchase_bundles").select("id, bundle_reward_points").in("id", bundleIds),
      supabaseAdmin.from("repurchase_bundle_items").select("bundle_id, product_id, quantity").in("bundle_id", bundleIds),
    ]);
    const bundleRewardMap = new Map<string, number>(
      (bundles ?? []).map((bundle: any) => [bundle.id, Number(bundle.bundle_reward_points ?? 0)]),
    );
    const bundleRequirements = new Map<string, Map<string, number>>();
    for (const item of (bundleItems ?? []) as any[]) {
      const bundleId = item.bundle_id as string;
      const productMap = bundleRequirements.get(bundleId) ?? new Map<string, number>();
      productMap.set(item.product_id as string, Number(item.quantity ?? 0));
      bundleRequirements.set(bundleId, productMap);
    }
    const rowsByBundle = new Map<string, Array<{ product_id: string; quantity: number }>>();
    for (const row of bundleRows) {
      const bundleId = row.bundle_id as string;
      const group = rowsByBundle.get(bundleId) ?? [];
      group.push({ product_id: row.product_id as string, quantity: Number(row.quantity ?? 0) });
      rowsByBundle.set(bundleId, group);
    }
    for (const [bundleId, group] of rowsByBundle) {
      const requirements = bundleRequirements.get(bundleId);
      const unitReward = bundleRewardMap.get(bundleId) ?? 0;
      if (!requirements || unitReward <= 0) continue;
      let copies = Number.POSITIVE_INFINITY;
      for (const [productId, requiredQty] of requirements) {
        if (requiredQty <= 0) continue;
        const orderedQty = group
          .filter((row) => row.product_id === productId)
          .reduce((sum, row) => sum + row.quantity, 0);
        copies = Math.min(copies, Math.floor(orderedQty / requiredQty));
      }
      if (Number.isFinite(copies) && copies > 0) {
        rewardPoints += unitReward * copies;
      }
    }
  }

  return Math.max(0, Math.floor(rewardPoints));
}

async function hasCompletedMonthlyResponsibility(memberId: string, orderDate?: string) {
  const snapshot = await getMonthlyResponsibilitySnapshot(memberId, orderDate);
  return snapshot.passed;
}

async function processRepurchase(orderId: string, buyerId: string, base: number, orderDate?: string) {
  if (base <= 0) return { inserted: 0, monthly: 0 };

  // 買家若為經銷商：自己不領獎勵點，個人月責任額全數歸屬推薦人
  const { data: buyer } = await supabaseAdmin
    .from("profiles").select("is_dealer, referred_by").eq("id", buyerId).maybeSingle();
  const buyerIsDealer = !!(buyer as any)?.is_dealer;
  const buyerReferrer = (buyer as any)?.referred_by as string | null;
  const monthlyRecipient = buyerIsDealer ? (buyerReferrer ?? null) : buyerId;

  const { data: rates } = await supabaseAdmin
    .from("repurchase_bonus_settings").select("*").eq("enabled", true)
    .order("generation_level");
  const maxLevel = (rates ?? []).reduce((m, r: any) => Math.max(m, r.generation_level), 0);
  // 經銷商買家：跳過自己，從推薦人開始計算 1/2 代
  let currentId: string | null = buyerIsDealer ? (buyerReferrer ?? null) : buyerId;
  let inserted = 0;
  for (let level = 1; level <= maxLevel; level++) {
    if (!currentId) break;
    const { data: cur } = await supabaseAdmin
      .from("profiles").select("referred_by").eq("id", currentId).maybeSingle();
    const upline = (cur as any)?.referred_by as string | null;
    if (!upline) break;
    const rateRow = (rates ?? []).find((r: any) => r.generation_level === level) as any;
    const rate = Number(rateRow?.bonus_rate ?? 0);
    if (rate > 0) {
      const pts = Math.floor(base * rate / 100);
      if (pts > 0) {
        const { data: dup } = await supabaseAdmin.from("bonus_records")
          .select("id").eq("source_order_id", orderId)
          .eq("generation_level", level).eq("bonus_type", "repurchase").maybeSingle();
        if (!dup) {
          const { data: uplineProfile } = await supabaseAdmin
            .from("profiles")
            .select("id, is_vip, vip_expires_at")
            .eq("id", upline)
            .maybeSingle();
          const referenceDate = orderDate ? new Date(orderDate) : new Date();
          const validVip = isValidVipForBonus(uplineProfile, referenceDate);
          const responsibilitySnapshot = validVip
            ? await getMonthlyResponsibilitySnapshot(upline, orderDate)
            : {
                ym: bonusYmFromDate(orderDate),
                points: 0,
                required_points: 0,
                passed: false,
              };
          const responsibilityPassed = validVip && responsibilitySnapshot.passed;
          const failReason = validVip
            ? (responsibilityPassed ? null : "monthly responsibility not completed")
            : "vip expired or missing vip_expires_at";
          const status = responsibilityPassed ? "pending" : "cancelled";
          await supabaseAdmin.from("bonus_records").insert({
            member_id: upline, source_member_id: buyerId, source_order_id: orderId,
            bonus_type: "repurchase", generation_level: level,
            base_amount: base, bonus_rate: rate,
            bonus_points: responsibilityPassed ? pts : 0,
            required_points_checked: true,
            required_points_passed: validVip && responsibilityPassed,
            fail_reason: failReason,
            status,
            calculation_detail: {
              schema_version: 1,
              calculation_kind: "daily_repurchase",
              created_from: "processRepurchase",
              source_order_id: orderId,
              source_member_id: buyerId,
              recipient_id: upline,
              generation_level: level,
              source_reward_points: base,
              base_amount: base,
              bonus_rate: rate,
              calculated_points_before_eligibility: pts,
              bonus_points: responsibilityPassed ? pts : 0,
              status_decision: status,
              fail_reason: failReason,
              rule_table: "repurchase_bonus_settings",
              rule_id: rateRow?.id ?? null,
              vip_snapshot: buildVipSnapshot(uplineProfile, referenceDate),
              responsibility_snapshot: responsibilitySnapshot,
              buyer_snapshot: {
                is_dealer: buyerIsDealer,
                referred_by: buyerReferrer,
              },
              monthly_responsibility_recipient: monthlyRecipient,
              order_date: orderDate ?? null,
            },
          });
          inserted++;
        }
      }
    }
    currentId = upline;
  }
  if (monthlyRecipient) {
    await addMonthlyResponsibility(monthlyRecipient, base, orderId);
  }
  return { inserted, monthly: monthlyRecipient ? base : 0 };
}


async function processUpgrade(orderId: string, buyerId: string, base: number) {
  if (base <= 0) return { inserted: 0 };
  const { data: tiers } = await supabaseAdmin
    .from("dealer_tiers")
    .select("code, daily_referral_rate")
    .gt("daily_referral_rate", 0);
  const tierMap = new Map<string, number>(
    (tiers ?? []).map((t: any) => [t.code, Number(t.daily_referral_rate)]),
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
          const { data: uplineProfile } = await supabaseAdmin
            .from("profiles")
            .select("id, is_vip, vip_expires_at")
            .eq("id", upline)
            .maybeSingle();
          const referenceDate = new Date();
          await supabaseAdmin.from("bonus_records").insert({
            member_id: upline, source_member_id: buyerId, source_order_id: orderId,
            bonus_type: "referral", generation_level: i + 1,
            base_amount: base, bonus_rate: diff, bonus_points: pts, status: "pending",
            calculation_detail: {
              schema_version: 1,
              calculation_kind: "daily_referral_upgrade",
              created_from: "processUpgrade",
              source_order_id: orderId,
              source_member_id: buyerId,
              recipient_id: upline,
              generation_level: i + 1,
              source_reward_points: base,
              base_amount: base,
              bonus_rate: diff,
              calculated_points_before_eligibility: pts,
              bonus_points: pts,
              rule_table: "dealer_tiers",
              rule_id: tierCode ?? null,
              tier_snapshot: {
                recipient_tier_code: tierCode ?? null,
                recipient_tier_rate: tierRate,
                paid_rate_before: paidRate,
                applied_diff_rate: diff,
              },
              vip_snapshot: buildVipSnapshot(uplineProfile, referenceDate),
            },
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
  const base = await getOrderGeneratedRewardPoints(orderId);
  const type = (order as any).order_type as string;

  if (type === "repurchase") {
    const r = await processRepurchase(orderId, buyerId, base, (order as any).created_at);
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
    const { data: pendingRaw } = await supabaseAdmin
      .from("bonus_records")
      .select("id, member_id, bonus_points")
      .in("bonus_type", ["referral", "repurchase", "rank_rebate"])
      .eq("status", "pending")
      .limit(5000);
    const pending = (pendingRaw ?? []) as Array<{ id: string; member_id: string; bonus_points: number }>;

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
    if (bErr) throw new Error((bErr as any).message);

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

    // 只允許結算「已結束」的月份：本月尚未過完最後一天前，不可執行本月月結算
    const nowTw = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Taipei" }));
    const targetYm = data.yyyymm ?? `${nowTw.getFullYear()}${String(nowTw.getMonth() + 1).padStart(2, "0")}`;
    const ty = Number(targetYm.slice(0, 4));
    const tm = Number(targetYm.slice(4, 6));
    // 該月最後一日 23:59:59（台灣時間）
    const targetMonthEnd = new Date(ty, tm, 0, 23, 59, 59);
    if (nowTw < targetMonthEnd) {
      throw new Error(`月結算尚未開放：${ty}/${String(tm).padStart(2, "0")} 需於 ${tm}/${new Date(ty, tm, 0).getDate()} 當日結束後才可執行`);
    }

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
    if (bErr) throw new Error((bErr as any).message);

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
  const { data: listRaw } = recordIds
    ? await query.in("id", recordIds as readonly string[])
    : await query.lte("release_date", new Date().toISOString().slice(0, 10));
  const list = (listRaw ?? []) as Array<any>;

  if (list.length === 0) return { released: 0, points: 0 };

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
      .select("id, status, fail_reason, release_attempts")
      .eq("status", "failed")
      .in("id", data.recordIds);
    if (fetchError) throw new Error(fetchError.message);

    const rows = failedRows ?? [];
    const ids = rows.map((row: any) => row.id);
    if (ids.length === 0) return { retried: 0, released: 0, points: 0 };
    const originalById = new Map(rows.map((row: any) => [row.id, row]));

    try {
      const now = new Date().toISOString();
      const releaseDate = now.slice(0, 10);

      for (const row of rows as any[]) {
        const { error: prepareError } = await supabaseAdmin
          .from("bonus_records")
          .update({
            status: "waiting_release",
            fail_reason: null,
            release_attempts: Number(row.release_attempts ?? 0) + 1,
            release_source: "retry",
            release_date: releaseDate,
            updated_at: now,
          })
          .eq("id", row.id)
          .eq("status", "failed");
        if (prepareError) throw new Error(prepareError.message);
      }

      const releaseResult = await releaseRecords(ids);
      const { data: releasedRows, error: releasedFetchError } = await supabaseAdmin
        .from("bonus_records")
        .select("id, status, released_at")
        .in("id", ids);
      if (releasedFetchError) throw new Error(releasedFetchError.message);

      const releasedIds = new Set((releasedRows ?? [])
        .filter((row: any) => row.status === "released")
        .map((row: any) => row.id));
      const unreleasedIds = ids.filter((id: string) => !releasedIds.has(id));
      if (unreleasedIds.length > 0) {
        await restoreFailedBonusRetries(unreleasedIds, originalById, "Retry did not release the bonus record");
        await writeBonusRetryAudit(context.userId, "bonus_retry_failed", unreleasedIds, originalById, {
          reason: "Retry did not release the bonus record",
        });
      }

      const successIds = ids.filter((id: string) => releasedIds.has(id));
      if (successIds.length > 0) {
        await writeBonusRetryAudit(context.userId, "bonus_retry_success", successIds, originalById, releaseResult ?? {});
      }

      return {
        retried: ids.length,
        ...(releaseResult ?? {}),
        released: successIds.length,
        failed: unreleasedIds.length,
      };
    } catch (error: any) {
      const reason = error?.message ?? "Retry release failed";
      await restoreFailedBonusRetries(ids, originalById, reason);
      await writeBonusRetryAudit(context.userId, "bonus_retry_failed", ids, originalById, { reason });
      throw error;
    }
  });

/* ───────────── 失敗重試稽核輔助 ───────────── */
async function restoreFailedBonusRetries(ids: string[], originalById: Map<string, any>, reason: string) {
  const failedAt = new Date().toISOString();

  for (const id of ids) {
    const original = originalById.get(id);
    const originalReason = original?.fail_reason ? String(original.fail_reason) : "";
    const retryReason = `Retry failed: ${reason}`;
    const failReason = originalReason.includes(retryReason)
      ? originalReason
      : [originalReason, retryReason].filter(Boolean).join("\n");

    const { error } = await supabaseAdmin
      .from("bonus_records")
      .update({
        status: "failed",
        fail_reason: failReason,
        failed_at: failedAt,
        release_source: "retry",
        updated_at: failedAt,
      })
      .eq("id", id)
      .neq("status", "released");
    if (error) throw new Error(error.message);
  }
}

async function writeBonusRetryAudit(
  userId: string,
  action: "bonus_retry_success" | "bonus_retry_failed",
  ids: string[],
  originalById: Map<string, any>,
  details: Record<string, unknown>,
) {
  const rows = ids.map((id) => {
    const original = originalById.get(id);
    return {
      user_id: userId,
      action,
      entity: "bonus_record",
      entity_id: id,
      metadata: {
        original_status: original?.status ?? null,
        original_fail_reason: original?.fail_reason ?? null,
        original_release_attempts: original?.release_attempts ?? 0,
        release_source: "retry",
        ...details,
      },
    };
  });

  const { error } = await supabaseAdmin.from("audit_logs").insert(rows);
  if (error) throw new Error(error.message);
}

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
export const getSettlementBatchDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ batchId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertRoles(context.userId, VIEW_ROLES);

    const { data: batch, error: batchError } = await supabaseAdmin
      .from("bonus_settlement_batches")
      .select("*")
      .eq("id", data.batchId)
      .maybeSingle();
    if (batchError) throw new Error(batchError.message);
    if (!batch) throw new Error("Settlement batch not found");

    const { data: records, error: recordsError } = await supabaseAdmin
      .from("bonus_records")
      .select("*")
      .eq("settlement_batch_id", data.batchId)
      .order("created_at", { ascending: false });
    if (recordsError) throw new Error(recordsError.message);

    const rows = records ?? [];
    const members = await getMemberMapForBonusRows(rows);

    return {
      batch,
      records: rows,
      members,
      summary: {
        waitingRelease: rows.filter((row: any) => row.status === "waiting_release").length,
        released: rows.filter((row: any) => row.status === "released").length,
        failed: rows.filter((row: any) => row.status === "failed").length,
        totalPoints: rows.reduce((sum: number, row: any) => sum + Number(row.bonus_points ?? 0), 0),
      },
    };
  });

export const getBonusRecordDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ recordId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertRoles(context.userId, VIEW_ROLES);

    const { data: record, error: recordError } = await supabaseAdmin
      .from("bonus_records")
      .select("*")
      .eq("id", data.recordId)
      .maybeSingle();
    if (recordError) throw new Error(recordError.message);
    if (!record) throw new Error("Bonus record not found");

    const [memberResult, batchResult, rewardLogsResult, pointTransactionsResult] = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("id, name, member_no, email")
        .eq("id", (record as any).member_id)
        .maybeSingle(),
      (record as any).settlement_batch_id
        ? supabaseAdmin
          .from("bonus_settlement_batches")
          .select("*")
          .eq("id", (record as any).settlement_batch_id)
          .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      supabaseAdmin
        .from("reward_wallet_logs")
        .select("*")
        .eq("bonus_record_id", data.recordId)
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("point_transactions")
        .select("*")
        .eq("reference_id", data.recordId)
        .order("created_at", { ascending: false }),
    ]);

    const errors = [
      memberResult.error,
      batchResult.error,
      rewardLogsResult.error,
      pointTransactionsResult.error,
    ].filter(Boolean);
    if (errors.length > 0) throw new Error(errors[0]!.message);

    return {
      record,
      member: memberResult.data ?? null,
      settlementBatch: batchResult.data ?? null,
      rewardWalletLogs: rewardLogsResult.data ?? [],
      pointTransactions: pointTransactionsResult.data ?? [],
    };
  });

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

function getBonusRecalculationBlockReason(profile: any, referenceDate: string) {
  if (!profile) return "會員資料不存在，重新計算後不發放獎勵點";

  const status = String(profile.member_status ?? "").trim();
  if (status && status !== "active" && status !== "正式會員") {
    return "會員狀態已停用，重新計算後不發放獎勵點";
  }

  const frozenCode = String(profile.frozen_code ?? "").trim().toUpperCase();
  if (frozenCode && frozenCode !== "N") {
    return "會員已凍結，重新計算後不發放獎勵點";
  }

  if (!profile.is_vip) return "會員不是有效 VIP，重新計算後不發放獎勵點";

  if (!profile.vip_expires_at) {
    return "VIP vip_expires_at is missing; treat as expired and block reward release";
  }

  if (profile.vip_expires_at) {
    const releaseAt = referenceDate.includes("T")
      ? new Date(referenceDate)
      : new Date(`${referenceDate}T23:59:59+08:00`);
    const vipExpiresAt = new Date(profile.vip_expires_at);
    if (vipExpiresAt < releaseAt) {
      return "VIP 年費已到期，重新計算後不發放獎勵點";
    }
  }

  return null;
}

export const recalculateWaitingBonusRecords = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ recordIds: z.array(z.string().uuid()).min(1).max(100) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertRoles(context.userId, ["super_admin"]);

    const uniqueIds = Array.from(new Set(data.recordIds));
    const { data: rows, error } = await supabaseAdmin
      .from("bonus_records")
      .select("id, status, member_id, bonus_type, base_amount, bonus_rate, bonus_points, settlement_batch_id, settlement_date, release_date, released_at")
      .in("id", uniqueIds);
    if (error) throw new Error(error.message);

    const records = rows ?? [];
    if (records.length !== uniqueIds.length) {
      throw new Error("部分獎金紀錄不存在，已停止重新計算");
    }

    const invalid = records.find((record: any) => record.status !== "waiting_release" || record.released_at);
    if (invalid) {
      throw new Error("只能重新計算尚未發放的獎金紀錄");
    }

    const memberIds = Array.from(
      new Set(records.map((record: any) => record.member_id).filter(Boolean)),
    );
    const { data: profiles, error: profileError } = memberIds.length
      ? await supabaseAdmin
          .from("profiles")
          .select("id, is_vip, vip_expires_at, member_status, frozen_code")
          .in("id", memberIds)
      : { data: [], error: null };
    if (profileError) throw new Error(profileError.message);

    const profileById = new Map((profiles ?? []).map((profile: any) => [profile.id, profile]));
    const now = new Date().toISOString();
    const FLAT_POINT_BONUS_TYPES = new Set(["referral", "repurchase", "rank_rebate"]);
    const updates = records.map((record: any) => {
      const baseAmount = Number(record.base_amount ?? 0);
      const bonusRate = Number(record.bonus_rate ?? 0);
      const oldPoints = Number(record.bonus_points ?? 0);
      const referenceDate = String(record.release_date ?? record.settlement_date ?? now);
      const blockReason = getBonusRecalculationBlockReason(profileById.get(record.member_id), referenceDate);
      // Flat-point bonuses (referral / repurchase / rank_rebate) are issued with
      // base_amount=0 and bonus_rate=0; recalculating base*rate would zero them.
      // Preserve the originally granted amount and only apply the VIP-status block.
      const isFlatPoint =
        FLAT_POINT_BONUS_TYPES.has(String(record.bonus_type ?? "")) ||
        (baseAmount === 0 && bonusRate === 0 && oldPoints > 0);
      const recalculatedPoints = isFlatPoint
        ? oldPoints
        : Math.max(0, Math.floor((baseAmount * bonusRate) / 100));
      const newPoints = blockReason ? 0 : recalculatedPoints;
      const newStatus = blockReason ? "cancelled" : "waiting_release";
      return {
        ...record,
        oldPoints,
        newPoints,
        newStatus,
        blockReason,
        recalculatedPoints,
        isFlatPoint,
      };
    });


    for (const record of updates) {
      const { error: updateError } = await supabaseAdmin
        .from("bonus_records")
        .update({
          bonus_points: record.newPoints,
          status: record.newStatus,
          fail_reason: record.blockReason,
          required_points_checked: true,
          required_points_passed: !record.blockReason,
          updated_at: now,
        })
        .eq("id", record.id)
        .eq("status", "waiting_release")
        .is("released_at", null);
      if (updateError) throw new Error(updateError.message);
    }

    const auditRows = updates.map((record: any) => ({
      user_id: context.userId,
      action: "bonus_recalculated_before_release",
      entity: "bonus_record",
      entity_id: record.id,
      metadata: {
        old_bonus_points: record.oldPoints,
        new_bonus_points: record.newPoints,
        recalculated_bonus_points: record.recalculatedPoints,
        old_status: record.status,
        new_status: record.newStatus,
        block_reason: record.blockReason,
        base_amount: record.base_amount,
        bonus_rate: record.bonus_rate,
        bonus_type: record.bonus_type,
        settlement_batch_id: record.settlement_batch_id,
        settlement_date: record.settlement_date,
        release_date: record.release_date,
      },
    }));
    const { error: auditError } = await supabaseAdmin.from("audit_logs").insert(auditRows);
    if (auditError) throw new Error(auditError.message);

    return {
      ok: true,
      recalculated: updates.length,
      changed: updates.filter((record) => record.oldPoints !== record.newPoints).length,
      cancelled: updates.filter((record) => record.newStatus === "cancelled").length,
      totalBefore: updates.reduce((sum, record) => sum + record.oldPoints, 0),
      totalAfter: updates.reduce((sum, record) => sum + record.newPoints, 0),
    };
  });

const recalculationDiagnosticsSchema = z.object({
  orderId: z.string().uuid().optional(),
  memberId: z.string().uuid().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
}).refine((data) => data.orderId || data.memberId, {
  message: "orderId or memberId is required",
});

function summarizeBonusRecords(rows: any[]) {
  const byStatus = rows.reduce((acc: Record<string, number>, row: any) => {
    const status = String(row.status ?? "unknown");
    acc[status] = (acc[status] ?? 0) + 1;
    return acc;
  }, {});

  return {
    total: rows.length,
    pending: byStatus.pending ?? 0,
    waiting_release: byStatus.waiting_release ?? 0,
    released: byStatus.released ?? 0,
    failed: byStatus.failed ?? 0,
    settled: byStatus.settled ?? 0,
    cancelled: byStatus.cancelled ?? 0,
    total_points: rows.reduce((sum: number, row: any) => sum + Number(row.bonus_points ?? 0), 0),
    by_status: byStatus,
  };
}

function findDuplicateBonusRisk(rows: any[]) {
  const seen = new Map<string, number>();
  for (const row of rows) {
    const key = [
      row.source_order_id ?? "",
      row.member_id ?? "",
      row.bonus_type ?? "",
      row.generation_level ?? 0,
    ].join("|");
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  return Array.from(seen.entries())
    .filter(([, count]) => count > 1)
    .map(([key, count]) => ({ key, count }));
}

function needsOrderBonusRecalculation(order: any, records: any[]) {
  if (!order) return false;
  if (order.payment_status !== "paid") return false;
  if (!order.user_id) return false;
  if (order.order_type === "normal") return false;
  return records.length === 0;
}

export const getBonusRecalculationDiagnostics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => recalculationDiagnosticsSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertRoles(context.userId, ADMIN_ROLES);

    const result: Record<string, any> = {};

    if (data.orderId) {
      const { data: order, error: orderError } = await supabaseAdmin
        .from("sales_orders")
        .select("id, order_no, user_id, customer_name, payment_status, order_status, order_type, subtotal, total_amount, created_at, updated_at")
        .eq("id", data.orderId)
        .maybeSingle();
      if (orderError) throw new Error(orderError.message);

      let orderRecordsQuery = supabaseAdmin
        .from("bonus_records")
        .select("*")
        .eq("source_order_id", data.orderId)
        .order("created_at", { ascending: false });
      if (data.dateFrom) orderRecordsQuery = orderRecordsQuery.gte("created_at", data.dateFrom);
      if (data.dateTo) orderRecordsQuery = orderRecordsQuery.lte("created_at", data.dateTo);

      const { data: orderRecords, error: orderRecordsError } = await orderRecordsQuery;
      if (orderRecordsError) throw new Error(orderRecordsError.message);

      const records = orderRecords ?? [];
      const duplicateRisks = findDuplicateBonusRisk(records);

      result.order = order
        ? {
          id: (order as any).id,
          order_no: (order as any).order_no,
          user_id: (order as any).user_id,
          customer_name: (order as any).customer_name,
          payment_status: (order as any).payment_status,
          order_status: (order as any).order_status,
          order_type: (order as any).order_type,
          subtotal: Number((order as any).subtotal ?? 0),
          total_amount: Number((order as any).total_amount ?? 0),
          created_at: (order as any).created_at,
          updated_at: (order as any).updated_at,
        }
        : null;
      result.orderDiagnostics = {
        has_bonus_records: records.length > 0,
        bonus_record_count: records.length,
        may_need_recalculation: needsOrderBonusRecalculation(order, records),
        duplicate_risk: duplicateRisks.length > 0,
        duplicate_risks: duplicateRisks,
        reason: !order
          ? "order_not_found"
          : (order as any).payment_status !== "paid"
            ? "order_not_paid"
            : !(order as any).user_id
              ? "order_has_no_member"
              : (order as any).order_type === "normal"
                ? "normal_order_not_bonus_eligible"
                : records.length > 0
                  ? "bonus_records_exist"
                  : "paid_bonus_eligible_order_has_no_bonus_records",
      };
      result.orderBonusRecords = records;
    }

    if (data.memberId) {
      const { data: member, error: memberError } = await supabaseAdmin
        .from("profiles")
        .select("id, name, member_no, email, is_vip, vip_expires_at, member_status, referred_by, created_at")
        .eq("id", data.memberId)
        .maybeSingle();
      if (memberError) throw new Error(memberError.message);

      let memberRecordsQuery = supabaseAdmin
        .from("bonus_records")
        .select("*")
        .eq("member_id", data.memberId)
        .order("created_at", { ascending: false })
        .limit(100);
      if (data.dateFrom) memberRecordsQuery = memberRecordsQuery.gte("created_at", data.dateFrom);
      if (data.dateTo) memberRecordsQuery = memberRecordsQuery.lte("created_at", data.dateTo);

      const { data: memberRecords, error: memberRecordsError } = await memberRecordsQuery;
      if (memberRecordsError) throw new Error(memberRecordsError.message);

      const records = memberRecords ?? [];
      const summary = summarizeBonusRecords(records);

      result.member = member ?? null;
      result.memberDiagnostics = {
        summary,
        recent_bonus_records: records.slice(0, 20),
        has_failed_records: summary.failed > 0,
        has_unreleased_records: summary.pending + summary.waiting_release + summary.settled > 0,
      };
    }

    return {
      ok: true,
      filters: {
        orderId: data.orderId ?? null,
        memberId: data.memberId ?? null,
        dateFrom: data.dateFrom ?? null,
        dateTo: data.dateTo ?? null,
      },
      ...result,
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

/* ───────────── VIP 個人日 / 月獎金明細 ───────────── */
const DAILY_BONUS_TYPES = ["referral", "repurchase"];
const MONTHLY_BONUS_TYPES = ["monthly_vip", "rank_rebate", "rank_diff_rebate"];

export const searchBonusMembers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ keyword: z.string().trim().min(1).max(120) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertRoles(context.userId, VIEW_ROLES);
    const kw = data.keyword.replace(/[%,]/g, " ").trim();
    const like = `%${kw}%`;
    const { data: rows, error } = await supabaseAdmin
      .from("profiles")
      .select("id, name, member_no, email, phone, is_vip, vip_expires_at")
      .or(`name.ilike.${like},member_no.ilike.${like},email.ilike.${like},phone.ilike.${like}`)
      .limit(30);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getMemberBonusBreakdown = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      memberId: z.string().uuid(),
      scope: z.enum(["all", "daily", "monthly"]).default("all"),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertRoles(context.userId, VIEW_ROLES);

    const { data: member, error: memberError } = await supabaseAdmin
      .from("profiles")
      .select("id, name, member_no, email, phone, is_vip, vip_expires_at")
      .eq("id", data.memberId)
      .maybeSingle();
    if (memberError) throw new Error(memberError.message);
    if (!member) throw new Error("找不到會員");

    let q = supabaseAdmin
      .from("bonus_records")
      .select("*")
      .eq("member_id", data.memberId)
      .order("created_at", { ascending: false })
      .limit(500);

    if (data.scope === "daily") q = q.in("bonus_type", DAILY_BONUS_TYPES);
    else if (data.scope === "monthly") q = q.in("bonus_type", MONTHLY_BONUS_TYPES);
    if (data.dateFrom) q = q.gte("created_at", `${data.dateFrom}T00:00:00Z`);
    if (data.dateTo) q = q.lte("created_at", `${data.dateTo}T23:59:59Z`);

    const { data: rows, error: rowsError } = await q;
    if (rowsError) throw new Error(rowsError.message);

    const records = rows ?? [];
    const sourceIds = Array.from(new Set(
      records.map((r: any) => r.source_member_id).filter(Boolean),
    ));
    let sourceMap: Record<string, any> = {};
    if (sourceIds.length > 0) {
      const { data: sources } = await supabaseAdmin
        .from("profiles").select("id, name, member_no").in("id", sourceIds);
      (sources ?? []).forEach((p: any) => { sourceMap[p.id] = p; });
    }

    const bucket = (types: string[]) => records.filter((r: any) => types.includes(r.bonus_type));
    const dailyRecords = bucket(DAILY_BONUS_TYPES);
    const monthlyRecords = bucket(MONTHLY_BONUS_TYPES);

    const summarize = (list: any[]) => {
      const byType: Record<string, { count: number; points: number; released: number; waiting: number; failed: number }> = {};
      let totalPoints = 0;
      let releasedPoints = 0;
      let waitingPoints = 0;
      let failedPoints = 0;
      for (const r of list) {
        const pts = Number(r.bonus_points ?? 0);
        totalPoints += pts;
        if (r.status === "released") releasedPoints += pts;
        else if (r.status === "waiting_release" || r.status === "pending") waitingPoints += pts;
        else if (r.status === "failed") failedPoints += pts;
        const key = r.bonus_type ?? "unknown";
        if (!byType[key]) byType[key] = { count: 0, points: 0, released: 0, waiting: 0, failed: 0 };
        byType[key].count += 1;
        byType[key].points += pts;
        if (r.status === "released") byType[key].released += pts;
        else if (r.status === "waiting_release" || r.status === "pending") byType[key].waiting += pts;
        else if (r.status === "failed") byType[key].failed += pts;
      }
      return { totalCount: list.length, totalPoints, releasedPoints, waitingPoints, failedPoints, byType };
    };

    return {
      member,
      records,
      sources: sourceMap,
      daily: { records: dailyRecords, summary: summarize(dailyRecords) },
      monthly: { records: monthlyRecords, summary: summarize(monthlyRecords) },
    };
  });

/* ───────────── Admin：會員日/月獎金明細查詢 ───────────── */
export const listMemberBonusDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      category: z.enum(["daily", "monthly"]),
      memberName: z.string().trim().optional(),
      memberNo: z.string().trim().optional(),
      memberId: z.string().uuid().optional(),
      bonusType: z.string().trim().optional(),
      status: z.string().trim().optional(),
      settlementBatchId: z.string().uuid().optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
      limit: z.number().int().min(1).max(1000).default(500),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    // 明細頁只允許 super_admin / admin / finance
    await assertRoles(context.userId, ADMIN_ROLES);

    const allowedTypes =
      data.category === "daily" ? DAILY_BONUS_TYPES : MONTHLY_BONUS_TYPES;

    let memberIdFilter: string[] | null = null;
    if (data.memberId) {
      memberIdFilter = [data.memberId];
    } else if (data.memberName || data.memberNo) {
      let pq = supabaseAdmin.from("profiles").select("id").limit(500);
      if (data.memberNo) pq = pq.eq("member_no", data.memberNo);
      if (data.memberName) pq = pq.ilike("name", `%${data.memberName}%`);
      const { data: profs, error: pErr } = await pq;
      if (pErr) throw new Error(pErr.message);
      memberIdFilter = (profs ?? []).map((p: any) => p.id);
      if (memberIdFilter.length === 0) return emptyDetailPayload();
    }

    let q = supabaseAdmin
      .from("bonus_records")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(data.limit);

    if (data.bonusType && allowedTypes.includes(data.bonusType)) {
      q = q.eq("bonus_type", data.bonusType);
    } else {
      q = q.in("bonus_type", allowedTypes);
    }
    if (data.status) q = q.eq("status", data.status);
    if (data.settlementBatchId) q = q.eq("settlement_batch_id", data.settlementBatchId);
    if (memberIdFilter) q = q.in("member_id", memberIdFilter);
    if (data.dateFrom) q = q.gte("settlement_date", data.dateFrom);
    if (data.dateTo) q = q.lte("settlement_date", data.dateTo);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const records = rows ?? [];
    if (records.length === 0) return emptyDetailPayload();

    const memberIds = Array.from(new Set(
      records.flatMap((r: any) => [
        r.member_id, r.source_member_id, r.released_member_id, r.original_member_id,
      ]).filter(Boolean),
    ));
    const batchIds = Array.from(new Set(
      records.map((r: any) => r.settlement_batch_id).filter(Boolean),
    ));

    const [profRes, batchRes] = await Promise.all([
      memberIds.length
        ? supabaseAdmin.from("profiles").select("id, name, member_no").in("id", memberIds)
        : Promise.resolve({ data: [], error: null }),
      batchIds.length
        ? supabaseAdmin.from("bonus_settlement_batches").select("*").in("id", batchIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    const members: Record<string, any> = {};
    (profRes.data ?? []).forEach((p: any) => { members[p.id] = p; });
    const batches: Record<string, any> = {};
    (batchRes.data ?? []).forEach((b: any) => { batches[b.id] = b; });

    // ── 統計：制度分組、狀態分布、總計 ──
    const num = (v: any) => Number(v ?? 0);
    const bucketBlank = () => ({
      count: 0, totalPoints: 0,
      pendingPoints: 0, waitingReleasePoints: 0,
      releasedPoints: 0, failedPoints: 0, cancelledPoints: 0,
      memberIds: new Set<string>(),
      batchIds: new Set<string>(),
      periods: new Set<string>(),
    });

    const typeBuckets: Record<string, ReturnType<typeof bucketBlank>> = {};
    const statusBuckets: Record<string, { count: number; points: number }> = {};

    let totalPoints = 0, pendingPoints = 0, waitingReleasePoints = 0,
      releasedPoints = 0, failedPoints = 0, cancelledPoints = 0;

    for (const r of records as any[]) {
      const pts = num(r.bonus_points);
      const t = r.bonus_type || "unknown";
      const s = r.status || "unknown";
      if (!typeBuckets[t]) typeBuckets[t] = bucketBlank();
      const b = typeBuckets[t];
      b.count += 1;
      b.totalPoints += pts;
      if (r.member_id) b.memberIds.add(r.member_id);
      if (r.settlement_batch_id) b.batchIds.add(r.settlement_batch_id);
      const batch = r.settlement_batch_id ? batches[r.settlement_batch_id] : null;
      const period = batch?.period
        ?? (r.settlement_date ? String(r.settlement_date).slice(0, 7) : null);
      if (period) b.periods.add(period);

      switch (s) {
        case "pending": b.pendingPoints += pts; pendingPoints += pts; break;
        case "waiting_release": b.waitingReleasePoints += pts; waitingReleasePoints += pts; break;
        case "released": b.releasedPoints += pts; releasedPoints += pts; break;
        case "failed": b.failedPoints += pts; failedPoints += pts; break;
        case "cancelled": b.cancelledPoints += pts; cancelledPoints += pts; break;
      }
      totalPoints += pts;

      if (!statusBuckets[s]) statusBuckets[s] = { count: 0, points: 0 };
      statusBuckets[s].count += 1;
      statusBuckets[s].points += pts;
    }

    const groupedByBonusType = Object.entries(typeBuckets).map(([bonus_type, v]) => ({
      bonus_type,
      count: v.count,
      total_points: v.totalPoints,
      pending_points: v.pendingPoints,
      waiting_release_points: v.waitingReleasePoints,
      released_points: v.releasedPoints,
      failed_points: v.failedPoints,
      cancelled_points: v.cancelledPoints,
      member_count: v.memberIds.size,
      batch_count: v.batchIds.size,
      periods: Array.from(v.periods).sort(),
    })).sort((a, b) => b.total_points - a.total_points);

    const groupedByStatus = Object.entries(statusBuckets).map(([status, v]) => ({
      status, count: v.count, points: v.points,
    })).sort((a, b) => b.points - a.points);

    const summary = {
      total_count: records.length,
      total_points: totalPoints,
      pending_points: pendingPoints,
      waiting_release_points: waitingReleasePoints,
      released_points: releasedPoints,
      failed_points: failedPoints,
      cancelled_points: cancelledPoints,
      member_count: new Set(records.map((r: any) => r.member_id).filter(Boolean)).size,
      batch_count: batchIds.length,
    };

    return {
      records, members, batches,
      summary, groupedByBonusType, groupedByStatus,
      totalPoints, releasedPoints, waitingReleasePoints, failedPoints,
    };
  });

function emptyDetailPayload() {
  return {
    records: [], members: {}, batches: {},
    summary: {
      total_count: 0, total_points: 0,
      pending_points: 0, waiting_release_points: 0,
      released_points: 0, failed_points: 0, cancelled_points: 0,
      member_count: 0, batch_count: 0,
    },
    groupedByBonusType: [] as any[],
    groupedByStatus: [] as any[],
    totalPoints: 0, releasedPoints: 0,
    waitingReleasePoints: 0, failedPoints: 0,
  };
}

/* ───────────── Admin：日/月獎金明細表 + 獎金總表（唯讀） ───────────── */

const detailFilterSchema = z.object({
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  bonusType: z.string().trim().optional(),
  status: z.string().trim().optional(),
  memberName: z.string().trim().optional(),
  memberNo: z.string().trim().optional(),
  settlementBatchId: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(2000).default(1000),
});

async function resolveMemberFilter(memberName?: string, memberNo?: string) {
  if (!memberName && !memberNo) return null;
  let pq = supabaseAdmin.from("profiles").select("id").limit(1000);
  if (memberNo) pq = pq.eq("member_no", memberNo);
  if (memberName) pq = pq.ilike("name", `%${memberName}%`);
  const { data, error } = await pq;
  if (error) throw new Error(error.message);
  return (data ?? []).map((p: any) => p.id);
}

async function fetchDetailRows(
  types: string[],
  data: z.infer<typeof detailFilterSchema>,
) {
  const memberIdFilter = await resolveMemberFilter(data.memberName, data.memberNo);
  if (memberIdFilter && memberIdFilter.length === 0) {
    return {
      rows: [] as any[],
      members: {} as Record<string, any>,
      batches: {} as Record<string, any>,
      orders: {} as Record<string, any>,
      tiers: {} as Record<string, string>,
      missingCalculationDetail: 0,
    };
  }
  let q = supabaseAdmin.from("bonus_records").select("*")
    .order("settlement_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(data.limit);
  if (data.bonusType && types.includes(data.bonusType)) q = q.eq("bonus_type", data.bonusType);
  else q = q.in("bonus_type", types);
  if (data.status) q = q.eq("status", data.status);
  if (data.settlementBatchId) q = q.eq("settlement_batch_id", data.settlementBatchId);
  if (memberIdFilter) q = q.in("member_id", memberIdFilter);
  if (data.dateFrom) q = q.gte("settlement_date", data.dateFrom);
  if (data.dateTo) q = q.lte("settlement_date", data.dateTo);
  const { data: rows, error } = await q;
  if (error) throw new Error(error.message);
  const list = rows ?? [];
  const memberIds = Array.from(new Set(list.flatMap((r: any) => [r.member_id, r.source_member_id, r.released_member_id, r.original_member_id]).filter(Boolean)));
  const batchIds = Array.from(new Set(list.map((r: any) => r.settlement_batch_id).filter(Boolean)));
  const orderIds = Array.from(new Set(list.map((r: any) => r.source_order_id).filter(Boolean)));
  const [profRes, batchRes, orderRes, tierRes] = await Promise.all([
    memberIds.length ? supabaseAdmin.from("profiles").select("id, name, member_no, is_vip, vip_expires_at").in("id", memberIds) : Promise.resolve({ data: [], error: null } as any),
    batchIds.length ? supabaseAdmin.from("bonus_settlement_batches").select("*").in("id", batchIds) : Promise.resolve({ data: [], error: null } as any),
    orderIds.length ? supabaseAdmin.from("sales_orders").select("id, order_no, total_amount, order_type").in("id", orderIds) : Promise.resolve({ data: [], error: null } as any),
    memberIds.length ? supabaseAdmin.from("dealer_tier_status").select("user_id, current_tier").in("user_id", memberIds) : Promise.resolve({ data: [], error: null } as any),
  ]);
  const members: Record<string, any> = {};
  (profRes.data ?? []).forEach((p: any) => { members[p.id] = p; });
  const batches: Record<string, any> = {};
  (batchRes.data ?? []).forEach((b: any) => { batches[b.id] = b; });
  const orders: Record<string, any> = {};
  (orderRes.data ?? []).forEach((o: any) => { orders[o.id] = o; });
  const tiers: Record<string, string> = {};
  (tierRes.data ?? []).forEach((t: any) => { if (t.current_tier) tiers[t.user_id] = t.current_tier; });
  const missingCalculationDetail = list.filter((r: any) => !r.calculation_detail).length;
  return { rows: list, members, batches, orders, tiers, missingCalculationDetail };
}

export const listDailyBonusDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => detailFilterSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertRoles(context.userId, ADMIN_ROLES);
    return await fetchDetailRows(DAILY_BONUS_TYPES, data);
  });

export const listMonthlyBonusDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => detailFilterSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertRoles(context.userId, ADMIN_ROLES);
    return await fetchDetailRows(MONTHLY_BONUS_TYPES, data);
  });

export const getBonusSummaryReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => detailFilterSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertRoles(context.userId, ADMIN_ROLES);
    const memberIdFilter = await resolveMemberFilter(data.memberName, data.memberNo);
    if (memberIdFilter && memberIdFilter.length === 0) {
      return {
        totals: { total: 0, released: 0, waiting_release: 0, pending: 0, failed: 0, cancelled: 0, daily: 0, monthly: 0 },
        counts: { records: 0, members: 0, batches: 0 },
        byType: [] as any[],
        byStatus: [] as any[],
      };
    }
    let q = supabaseAdmin.from("bonus_records")
      .select("bonus_type,status,bonus_points,member_id,settlement_batch_id,settlement_date")
      .limit(50000);
    if (data.bonusType) q = q.eq("bonus_type", data.bonusType);
    if (data.status) q = q.eq("status", data.status);
    if (data.settlementBatchId) q = q.eq("settlement_batch_id", data.settlementBatchId);
    if (memberIdFilter) q = q.in("member_id", memberIdFilter);
    if (data.dateFrom) q = q.gte("settlement_date", data.dateFrom);
    if (data.dateTo) q = q.lte("settlement_date", data.dateTo);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const list = (rows ?? []) as any[];
    const totals = { total: 0, released: 0, waiting_release: 0, pending: 0, failed: 0, cancelled: 0, daily: 0, monthly: 0 };
    const typeMap = new Map<string, { count: number; points: number; released: number; waiting: number; failed: number; pending: number; cancelled: number }>();
    const statusMap = new Map<string, { count: number; points: number }>();
    const memberSet = new Set<string>();
    const batchSet = new Set<string>();
    for (const r of list) {
      const pts = Number(r.bonus_points ?? 0);
      totals.total += pts;
      if (DAILY_BONUS_TYPES.includes(r.bonus_type)) totals.daily += pts;
      else if (MONTHLY_BONUS_TYPES.includes(r.bonus_type)) totals.monthly += pts;
      if (r.status === "released") totals.released += pts;
      else if (r.status === "waiting_release") totals.waiting_release += pts;
      else if (r.status === "pending") totals.pending += pts;
      else if (r.status === "failed") totals.failed += pts;
      else if (r.status === "cancelled") totals.cancelled += pts;
      if (r.member_id) memberSet.add(r.member_id);
      if (r.settlement_batch_id) batchSet.add(r.settlement_batch_id);
      const t = typeMap.get(r.bonus_type) ?? { count: 0, points: 0, released: 0, waiting: 0, failed: 0, pending: 0, cancelled: 0 };
      t.count += 1; t.points += pts;
      if (r.status === "released") t.released += pts;
      else if (r.status === "waiting_release") t.waiting += pts;
      else if (r.status === "pending") t.pending += pts;
      else if (r.status === "failed") t.failed += pts;
      else if (r.status === "cancelled") t.cancelled += pts;
      typeMap.set(r.bonus_type, t);
      const s = statusMap.get(r.status) ?? { count: 0, points: 0 };
      s.count += 1; s.points += pts;
      statusMap.set(r.status, s);
    }
    return {
      totals,
      counts: { records: list.length, members: memberSet.size, batches: batchSet.size },
      byType: Array.from(typeMap.entries()).map(([bonus_type, v]) => ({ bonus_type, ...v })).sort((a, b) => b.points - a.points),
      byStatus: Array.from(statusMap.entries()).map(([status, v]) => ({ status, ...v })).sort((a, b) => b.points - a.points),
    };
  });

