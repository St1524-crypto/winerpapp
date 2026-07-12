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

// ---- 歷史累計獎金（由管理員從 累計獎金.pdf 匯入到 profiles.legacy_bonus_total）----
export const getMyLegacyBonus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase
      .from("profiles")
      .select("legacy_bonus_total, member_no")
      .eq("id", context.userId)
      .maybeSingle();
    return {
      legacy_bonus_total: Number((data as any)?.legacy_bonus_total ?? 0),
      member_no: (data as any)?.member_no ?? null,
      source: "歷史匯入：累計獎金.pdf",
      imported_at: null as string | null,
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
      .limit(1000);
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

// ---- 新會員註冊贈送折扣點：設定管理 ----
export const getSignupDiscountBonus = createServerFn({ method: "GET" })
  .handler(async () => {
    const { data } = await supabaseAdmin
      .from("system_settings")
      .select("value")
      .eq("key", "guest_signup_discount_points")
      .maybeSingle();
    const raw = (data as any)?.value;
    const points = Math.max(
      0,
      Math.floor(Number(typeof raw === "number" ? raw : raw ?? 1000)) || 0,
    );
    return { points };
  });

export const setSignupDiscountBonus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ points: z.number().int().min(0).max(1000000) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("system_settings")
      .upsert(
        {
          key: "guest_signup_discount_points",
          value: data.points as any,
          description: "新會員（含訪客快速註冊）首次註冊贈送折扣點",
          updated_by: context.userId,
        },
        { onConflict: "key" },
      );
    if (error) throw new Error(error.message);
    return { ok: true, points: data.points };
  });

// ---- 結帳：扣點 + 入點（reward_earn 由伺服器依訂單實際商品計算，不接受客戶端輸入）----
const redeemSchema = z.object({
  orderId: z.string().uuid(),
  shopping_redeem: z.number().int().min(0).default(0),
  reward_redeem: z.number().int().min(0).default(0),
  discount_redeem: z.number().int().min(0).default(0),
});

export const applyOrderPoints = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => redeemSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;

    // 驗證訂單歸屬與付款狀態
    const { data: order } = await supabaseAdmin
      .from("sales_orders")
      .select("id, user_id, payment_status")
      .eq("id", data.orderId)
      .maybeSingle();
    if (!order || (order as any).user_id !== userId) {
      throw new Error("訂單不存在或無權存取");
    }

    if (data.shopping_redeem > 0)
      await applyDelta(userId, "shopping", -data.shopping_redeem, "order_redeem", { reference_id: data.orderId });
    if (data.reward_redeem > 0)
      await applyDelta(userId, "reward", -data.reward_redeem, "order_redeem", { reference_id: data.orderId });
    if (data.discount_redeem > 0)
      await applyDelta(userId, "discount", -data.discount_redeem, "order_redeem", { reference_id: data.orderId });

    // reward_earn：伺服器端依訂單實際商品計算，僅在付款完成後發放
    if ((order as any).payment_status === "paid") {
      // 防止重複入點：檢查是否已產生過 order_earn 紀錄
      const { data: dup } = await supabaseAdmin
        .from("point_transactions")
        .select("id")
        .eq("reference_id", data.orderId)
        .eq("source", "order_earn")
        .maybeSingle();
      if (!dup) {
        const { data: items } = await supabaseAdmin
          .from("sales_order_items")
          .select("product_id, quantity")
          .eq("sales_order_id", data.orderId);
        const productIds = Array.from(new Set((items ?? []).map((i: any) => i.product_id).filter(Boolean)));
        let rewardEarn = 0;
        if (productIds.length > 0) {
          const { data: prods } = await supabaseAdmin
            .from("products")
            .select("id, reward_points")
            .in("id", productIds);
          const ptsMap = new Map<string, number>(
            (prods ?? []).map((p: any) => [p.id, Number(p.reward_points ?? 0)]),
          );
          for (const it of items ?? []) {
            rewardEarn += (ptsMap.get((it as any).product_id) ?? 0) * Number((it as any).quantity ?? 0);
          }
        }
        if (rewardEarn > 0) {
          const { data: prof } = await supabaseAdmin
            .from("profiles")
            .select("is_vip, vip_expires_at, referred_by")
            .eq("id", userId)
            .maybeSingle();
          const exp = (prof as any)?.vip_expires_at as string | null;
          const isVip = !!(prof as any)?.is_vip;
          const vipExpired = !!exp && new Date(exp) <= new Date();
          const buyerEligible = isVip && !vipExpired;
          if (buyerEligible) {
            // 買家為有效 VIP：獎勵點入自己帳戶
            await applyDelta(userId, "reward", rewardEarn, "order_earn", { reference_id: data.orderId });
          } else {
            // 訪客 / 到期 VIP：獎勵點歸屬推薦人，依 repurchase_bonus_settings 位階（第 1、2 代…）
            // 折算為獎勵點，發放到「有效 VIP」上線的獎勵點錢包，
            // 並依營業分紅比例與 VIP 升級分紅上限進行 cap 檢查（任一上限已滿則不可領）。
            const { data: rates } = await supabaseAdmin
              .from("repurchase_bonus_settings")
              .select("generation_level, bonus_rate, enabled")
              .eq("enabled", true)
              .order("generation_level");
            const rateRows = (rates ?? []) as any[];
            const maxLevel = rateRows.reduce((m, r) => Math.max(m, Number(r.generation_level ?? 0)), 0);
            let currentId: string | null = ((prof as any)?.referred_by as string | null) ?? null;
            const guard = new Set<string>([userId]);
            let totalDistributed = 0;
            const distributedTo: Array<{ level: number; amount: number; note?: string }> = [];
            for (let level = 1; level <= maxLevel && currentId && !guard.has(currentId); level++) {
              guard.add(currentId);
              const rate = Number(rateRows.find((r) => r.generation_level === level)?.bonus_rate ?? 0);
              const { data: up } = await supabaseAdmin
                .from("profiles")
                .select("id, is_vip, vip_expires_at, referred_by")
                .eq("id", currentId)
                .maybeSingle();
              const upId = (up as any)?.id as string | undefined;
              const upExp = (up as any)?.vip_expires_at as string | null;
              const upVipActive = !!(up as any)?.is_vip && (!upExp || new Date(upExp) > new Date());
              const basePoints = Math.floor((rewardEarn * rate) / 100);
              if (upId && upVipActive && basePoints > 0) {
                // 營業分紅比例 cap（依上線 VIP 位階）
                const { data: bizRow } = await (supabaseAdmin as any).rpc("record_business_bonus_release", {
                  _member_id: upId,
                  _bonus_amount: basePoints,
                  _source_member_id: userId,
                  _source_order_id: data.orderId,
                  _tier_code: null,
                  _dedupe_key: `order:${data.orderId}:biz:L${level}`,
                  _bonus_record_id: null,
                  _notes: `訂單復購獎勵（第 ${level} 代，${rate}%）— 買家非有效 VIP`,
                });
                // VIP 升級分紅上限 cap
                const { data: upgRow } = await (supabaseAdmin as any).rpc("record_upgrade_bonus_release", {
                  _member_id: upId,
                  _bonus_amount: basePoints,
                  _source_member_id: userId,
                  _source_order_id: data.orderId,
                  _tier_code: null,
                  _dedupe_key: `order:${data.orderId}:upg:L${level}`,
                  _bonus_record_id: null,
                  _notes: `訂單復購獎勵（第 ${level} 代，${rate}%）— 買家非有效 VIP`,
                });
                const bizPayable = Math.floor(Number((bizRow as any)?.payable_amount ?? 0));
                const upgPayable = Math.floor(Number((upgRow as any)?.payable_amount ?? 0));
                const payable = Math.max(0, Math.min(basePoints, bizPayable, upgPayable));
                const capReason: string[] = [];
                if (bizPayable < basePoints) capReason.push("營業分紅上限");
                if (upgPayable < basePoints) capReason.push("升級分紅上限");
                if (payable > 0) {
                  await applyDelta(upId, "reward", payable, "order_earn_referrer", {
                    reference_id: data.orderId,
                    note: `第 ${level} 代復購獎勵（${rate}%）— 來源會員 ${userId}`
                      + (capReason.length ? `（${capReason.join("、")}部分達上限）` : ""),
                    created_by: userId,
                  });
                }
                totalDistributed += payable;
                distributedTo.push({
                  level,
                  amount: payable,
                  note: capReason.length
                    ? (payable > 0 ? `部分達${capReason.join("、")}` : `已達${capReason.join("、")} 略過`)
                    : undefined,
                });
              } else if (upId && !upVipActive && basePoints > 0) {
                distributedTo.push({ level, amount: 0, note: "上線非有效 VIP 略過" });
              }
              currentId = ((up as any)?.referred_by as string | null) ?? null;
            }
            // 於訂單留下標記（0 點）：訂單詳情可顯示「本次獎勵點已轉推薦人獎勵點錢包」
            await supabaseAdmin.from("point_transactions").insert({
              user_id: userId,
              point_type: "reward",
              amount: 0,
              balance_after: 0,
              source: "order_earn_referrer",
              reference_id: data.orderId,
              note: `買家非有效 VIP，${rewardEarn} 獎勵點依復購位階折算 ${totalDistributed} 點發放至推薦人獎勵點錢包`
                + (distributedTo.length
                  ? `（${distributedTo.map((d) => `L${d.level} +${d.amount} 點${d.note ? `（${d.note}）` : ""}`).join(", ")}）`
                  : "（無有效 VIP 上線可接收）"),
              created_by: userId,
            });
          }
        }
      }
    }
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
  .inputValidator((d) => z.object({ planId: z.string().uuid(), targetUserId: z.string().uuid().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const callerId = context.userId;

    // 僅管理員/財務可手動開通 VIP；一般會員需透過已付款的升級訂單由系統自動開通。
    const { data: rolesData } = await supabaseAdmin
      .from("user_roles").select("role").eq("user_id", callerId);
    const roles = (rolesData ?? []).map((r: any) => r.role);
    const isAdmin = roles.some((r: string) => ["super_admin", "admin", "finance"].includes(r));
    if (!isAdmin) {
      throw new Error("VIP 開通需透過完成付款流程，或由管理員代為開通");
    }

    const userId = data.targetUserId ?? callerId;

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
      source: "admin",
      notes: `${(plan as any).name} (granted by ${callerId})`,
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
