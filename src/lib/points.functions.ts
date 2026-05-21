import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type PointType = "shopping" | "reward" | "discount";

async function ensureWallet(userId: string) {
  const { data } = await supabaseAdmin
    .from("member_points_wallet")
    .select("user_id, shopping_points, reward_points, discount_points")
    .eq("user_id", userId)
    .maybeSingle();
  if (data) return data;
  const { data: created } = await supabaseAdmin
    .from("member_points_wallet")
    .insert({ user_id: userId })
    .select("user_id, shopping_points, reward_points, discount_points")
    .single();
  return created!;
}

async function applyDelta(
  userId: string,
  type: PointType,
  delta: number,
  source: string,
  opts: { reference_id?: string | null; note?: string | null; created_by?: string | null } = {},
) {
  const wallet = await ensureWallet(userId);
  const col = type === "shopping" ? "shopping_points" : type === "reward" ? "reward_points" : "discount_points";
  const current = Number((wallet as any)[col] ?? 0);
  const after = current + delta;
  if (after < 0) throw new Error(`點數不足（${type}: ${current}）`);
  const upd: any = { updated_at: new Date().toISOString() };
  upd[col] = after;
  const { error: uErr } = await supabaseAdmin.from("member_points_wallet").update(upd).eq("user_id", userId);
  if (uErr) throw new Error(uErr.message);
  await supabaseAdmin.from("point_transactions").insert({
    user_id: userId,
    point_type: type,
    amount: delta,
    balance_after: after,
    source,
    reference_id: opts.reference_id ?? null,
    note: opts.note ?? null,
    created_by: opts.created_by ?? null,
  });
  return after;
}

// ---- 會員查詢自己錢包 ----
export const getMyWallet = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const w = await ensureWallet(context.userId);
    return {
      shopping_points: Number(w.shopping_points ?? 0),
      reward_points: Number(w.reward_points ?? 0),
      discount_points: Number(w.discount_points ?? 0),
    };
  });

export const getMyPointTx = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await supabaseAdmin
      .from("point_transactions")
      .select("*")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(100);
    return data ?? [];
  });

// ---- 管理員：充值/扣除/調整 ----
const adjustSchema = z.object({
  userId: z.string().uuid(),
  pointType: z.enum(["shopping", "reward", "discount"]),
  amount: z.number().int(),
  note: z.string().max(500).optional(),
  source: z.string().max(50).default("admin_adjust"),
});

async function assertAdmin(userId: string) {
  const { data } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r: any) => r.role);
  if (!roles.some((r) => ["super_admin", "finance", "sales", "admin"].includes(r))) {
    throw new Error("沒有權限");
  }
}

export const adminAdjustPoints = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => adjustSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const after = await applyDelta(data.userId, data.pointType, data.amount, data.source, {
      note: data.note,
      created_by: context.userId,
    });
    return { balance_after: after };
  });

// ---- 結帳：扣點 + 入點 ----
const redeemSchema = z.object({
  orderId: z.string().uuid(),
  shopping_redeem: z.number().int().min(0).default(0),
  reward_redeem: z.number().int().min(0).default(0),
  discount_redeem: z.number().int().min(0).default(0),
  reward_earn: z.number().int().min(0).default(0),
});

export const applyOrderPoints = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => redeemSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    if (data.shopping_redeem > 0)
      await applyDelta(userId, "shopping", -data.shopping_redeem, "order_redeem", { reference_id: data.orderId });
    if (data.reward_redeem > 0)
      await applyDelta(userId, "reward", -data.reward_redeem, "order_redeem", { reference_id: data.orderId });
    if (data.discount_redeem > 0)
      await applyDelta(userId, "discount", -data.discount_redeem, "order_redeem", { reference_id: data.orderId });
    if (data.reward_earn > 0)
      await applyDelta(userId, "reward", data.reward_earn, "order_earn", { reference_id: data.orderId });
    return { ok: true };
  });

// ---- 推廣：註冊送獎勵點 ----
export const handleReferralSignup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ referralCode: z.string().min(4).max(16) }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const code = data.referralCode.trim().toUpperCase();
    // 找推薦人
    const { data: refUser } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("referral_code", code)
      .maybeSingle();
    if (!refUser || refUser.id === userId) return { ok: false, reason: "invalid_code" };
    // 已紀錄?
    const { data: existing } = await supabaseAdmin
      .from("referrals")
      .select("id")
      .eq("referred_user_id", userId)
      .maybeSingle();
    if (existing) return { ok: false, reason: "already_referred" };

    const SIGNUP_BONUS = 100;
    await supabaseAdmin.from("referrals").insert({
      referrer_id: refUser.id,
      referred_user_id: userId,
      referral_code: code,
      signup_reward_points: SIGNUP_BONUS,
      signup_rewarded_at: new Date().toISOString(),
    });
    await supabaseAdmin.from("profiles").update({ referred_by: refUser.id }).eq("id", userId);
    // 雙方都獲得獎勵點
    await applyDelta(userId, "reward", SIGNUP_BONUS, "referral", { note: `推薦碼 ${code} 註冊獎勵` });
    await applyDelta(refUser.id, "reward", SIGNUP_BONUS, "referral", {
      note: `推薦會員註冊獎勵`,
      reference_id: userId,
    });
    return { ok: true, bonus: SIGNUP_BONUS };
  });

// ---- VIP ----
export const getMyVip = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("is_vip, vip_expires_at")
      .eq("id", context.userId)
      .maybeSingle();
    const expires = (data as any)?.vip_expires_at as string | null;
    const active = !!(data as any)?.is_vip && (!expires || new Date(expires) > new Date());
    return {
      is_vip: active,
      vip_expires_at: expires,
    };
  });

export const upgradeVip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ planId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: plan } = await supabaseAdmin
      .from("vip_plans")
      .select("id, name, price, duration_days, bonus_points, status")
      .eq("id", data.planId)
      .maybeSingle();
    if (!plan || (plan as any).status !== "active") throw new Error("方案不存在或已停用");

    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("vip_expires_at")
      .eq("id", userId)
      .maybeSingle();
    const base = (prof as any)?.vip_expires_at && new Date((prof as any).vip_expires_at) > new Date()
      ? new Date((prof as any).vip_expires_at)
      : new Date();
    const newExpires = new Date(base.getTime() + (plan as any).duration_days * 86400000);

    await supabaseAdmin.from("vip_memberships").insert({
      user_id: userId,
      plan_id: (plan as any).id,
      expires_at: newExpires.toISOString(),
      amount_paid: (plan as any).price,
      source: "plan",
      notes: (plan as any).name,
    });
    await supabaseAdmin.from("profiles").update({
      is_vip: true,
      vip_expires_at: newExpires.toISOString(),
    }).eq("id", userId);

    if ((plan as any).bonus_points > 0) {
      await applyDelta(userId, "reward", (plan as any).bonus_points, "vip_bonus", {
        note: `VIP 開通獎勵：${(plan as any).name}`,
      });
    }

    return { ok: true, vip_expires_at: newExpires.toISOString() };
  });

// ---- 推廣紀錄查詢 ----
export const getMyReferralStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("referral_code")
      .eq("id", context.userId)
      .maybeSingle();
    const { data: refs } = await supabaseAdmin
      .from("referrals")
      .select("id, referred_user_id, signup_reward_points, created_at")
      .eq("referrer_id", context.userId)
      .order("created_at", { ascending: false });
    return {
      referral_code: (prof as any)?.referral_code ?? null,
      total: refs?.length ?? 0,
      total_points: (refs ?? []).reduce((s, r: any) => s + Number(r.signup_reward_points ?? 0), 0),
      records: refs ?? [],
    };
  });
