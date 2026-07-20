import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  computeBasePoints,
  computeLevelPayable,
  formatBuyerMarkerNote,
  formatLevelNote,
  type LevelDistribution,
} from "./referrer-reward-distribution";

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
          .select("product_id, quantity, bundle_id, bundle_line_key")
          .eq("sales_order_id", data.orderId);
        // 分成 [套組列] 與 [非套組列]
        const bundleRows = (items ?? []).filter((i: any) => i.bundle_id);
        const soloRows = (items ?? []).filter((i: any) => !i.bundle_id);
        const productIds = Array.from(new Set(soloRows.map((i: any) => i.product_id).filter(Boolean)));
        let rewardEarn = 0;
        // ---- 非套組：沿用單品階梯／基礎每件獎勵點 ----
        if (productIds.length > 0) {
          const { data: prods } = await supabaseAdmin
            .from("products")
            .select("id, reward_points")
            .in("id", productIds);
          const baseRewardMap = new Map<string, number>(
            (prods ?? []).map((p: any) => [p.id, Number(p.reward_points ?? 0)]),
          );
          const { data: tiersData } = await supabaseAdmin
            .from("product_wholesale_tiers")
            .select("product_id, min_qty, max_qty, unit_reward_points")
            .in("product_id", productIds)
            .order("min_qty", { ascending: true });
          const tiersMap = new Map<string, Array<{ min_qty: number; max_qty: number | null; unit_reward_points: number }>>();
          for (const t of (tiersData ?? []) as any[]) {
            const pid = t.product_id as string;
            const arr = tiersMap.get(pid) ?? [];
            arr.push({
              min_qty: Number(t.min_qty ?? 0),
              max_qty: t.max_qty == null ? null : Number(t.max_qty),
              unit_reward_points: Number(t.unit_reward_points ?? 0),
            });
            tiersMap.set(pid, arr);
          }
          for (const it of soloRows) {
            const pid = (it as any).product_id as string | null;
            const qty = Number((it as any).quantity ?? 0);
            if (!pid || qty <= 0) continue;
            const tiers = tiersMap.get(pid) ?? [];
            const matched = tiers.filter(
              (t) => qty >= t.min_qty && (t.max_qty == null || qty <= t.max_qty),
            );
            let unitReward: number;
            if (matched.length > 0) {
              unitReward = matched.reduce(
                (best, cur) => (cur.unit_reward_points > best ? cur.unit_reward_points : best),
                0,
              );
            } else {
              unitReward = baseRewardMap.get(pid) ?? 0;
            }
            rewardEarn += unitReward * qty;
          }
        }
        // ---- 套組：依 bundle_id 分組，整組發放 bundle_reward_points × 組數 ----
        if (bundleRows.length > 0) {
          const bundleIds = Array.from(new Set(bundleRows.map((r: any) => r.bundle_id as string)));
          const [{ data: bundles }, { data: bItems }] = await Promise.all([
            supabaseAdmin.from("repurchase_bundles").select("id, bundle_reward_points").in("id", bundleIds),
            supabaseAdmin.from("repurchase_bundle_items").select("bundle_id, product_id, quantity").in("bundle_id", bundleIds),
          ]);
          const bundleRewardMap = new Map<string, number>(
            (bundles ?? []).map((b: any) => [b.id, Number(b.bundle_reward_points ?? 0)]),
          );
          const perBundleQtyMap = new Map<string, Map<string, number>>();
          for (const bi of (bItems ?? []) as any[]) {
            const bid = bi.bundle_id as string;
            const m = perBundleQtyMap.get(bid) ?? new Map<string, number>();
            m.set(bi.product_id as string, Number(bi.quantity ?? 0));
            perBundleQtyMap.set(bid, m);
          }
          // 依 bundle_id 分組本訂單的套組列，計算「組數」= 每個成員商品 (下單件數 / 每組件數) 的最小值
          const rowsByBundle = new Map<string, Array<{ product_id: string; quantity: number }>>();
          for (const r of bundleRows as any[]) {
            const bid = r.bundle_id as string;
            const arr = rowsByBundle.get(bid) ?? [];
            arr.push({ product_id: r.product_id as string, quantity: Number(r.quantity ?? 0) });
            rowsByBundle.set(bid, arr);
          }
          for (const [bid, rows] of rowsByBundle) {
            const perMap = perBundleQtyMap.get(bid);
            const unitReward = bundleRewardMap.get(bid) ?? 0;
            if (!perMap || perMap.size === 0 || unitReward <= 0) continue;
            let copies = Number.POSITIVE_INFINITY;
            for (const [pid, need] of perMap) {
              const ordered = rows.filter((r) => r.product_id === pid).reduce((s, r) => s + r.quantity, 0);
              if (need <= 0) continue;
              copies = Math.min(copies, Math.floor(ordered / need));
            }
            if (Number.isFinite(copies) && copies > 0) {
              rewardEarn += unitReward * copies;
            }
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
          const vipActive = isVip && !!exp && new Date(exp) > new Date();
          const buyerEligible = vipActive;
          if (buyerEligible) {
            // 買家為有效 VIP：獎勵點入自己帳戶
            await applyDelta(userId, "reward", rewardEarn, "order_earn", { reference_id: data.orderId });
          } else {
            // 訪客 / 到期 VIP：獎勵點歸屬推薦人，依 repurchase_bonus_settings 位階（第 1、2 代…）
            // 折算為獎勵點，發放到「有效 VIP」上線的獎勵點錢包。
            // V/S/T/E/A 只領消費分紅；一星以上（V1~V8 / STAR1~DIRECTOR）只領營業分紅。
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
            const distributedTo: LevelDistribution[] = [];
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
              const upVipActive = !!(up as any)?.is_vip && !!upExp && new Date(upExp) > new Date();
              const basePoints = computeBasePoints(rewardEarn, rate);
              if (upId && upVipActive && basePoints > 0) {
                // 查詢上線目前 VIP 星級：一星以上（V1~V8 / STAR1~DIRECTOR）走營業分紅，
                // V/S/T/E/A 走消費分紅，兩種發放不可混淆。
                const { data: upTierCodeRaw } = await (supabaseAdmin as any).rpc(
                  "get_member_vip_tier_code",
                  { _member_id: upId },
                );
                const upTierCode = (upTierCodeRaw as string | null) ?? null;
                // 一星以上（V1~V7、董事 = 目前以 V1~V8 表示）才完全停發消費回饋。
                // V0 / V / S / T / E / A / NONE / 空值皆屬「未達一星」，需照舊發放消費回饋。
                const upTierUpper = upTierCode?.toUpperCase() ?? "";
                const NON_STAR_CODES = new Set(["", "V0", "V", "S", "T", "E", "A", "NONE"]);
                const isStarTierOrAbove = !!upTierCode && !NON_STAR_CODES.has(upTierUpper);
                let bizPayable = basePoints;
                let upgPayable = basePoints;
                if (!isStarTierOrAbove) {
                  // 未達一星：只寫消費分紅 cap / ledger，不寫營業分紅 ledger。
                  const { data: bizRow } = await (supabaseAdmin as any).rpc("record_business_bonus_release", {
                    _member_id: upId,
                    _bonus_amount: basePoints,
                    _source_member_id: userId,
                    _source_order_id: data.orderId,
                    _tier_code: upTierCode,
                    _dedupe_key: `order:${data.orderId}:biz:L${level}`,
                    _bonus_record_id: null,
                    _notes: `訂單復購獎勵（第 ${level} 代，${rate}%）— 買家非有效 VIP`,
                  });
                  bizPayable = Number((bizRow as any)?.payable_amount ?? 0);
                } else {
                  // 一星以上：只寫營業分紅 cap / ledger，不寫消費分紅 ledger。
                  const { data: upgRow } = await (supabaseAdmin as any).rpc("record_upgrade_bonus_release", {
                    _member_id: upId,
                    _bonus_amount: basePoints,
                    _source_member_id: userId,
                    _source_order_id: data.orderId,
                    _tier_code: upTierCode,
                    _dedupe_key: `order:${data.orderId}:upg:L${level}`,
                    _bonus_record_id: null,
                    _notes: `訂單復購獎勵（第 ${level} 代，${rate}%）— 買家非有效 VIP（${upTierCode} 一星以上僅領營業分紅）`,
                  });
                  upgPayable = Number((upgRow as any)?.payable_amount ?? 0);
                }
                const { payable, capReasons } = computeLevelPayable(
                  basePoints,
                  bizPayable,
                  upgPayable,
                );
                if (payable > 0) {
                  await applyDelta(upId, "reward", payable, "order_earn_referrer", {
                    reference_id: data.orderId,
                    note: `第 ${level} 代復購獎勵（${rate}%）— 來源會員 ${userId}`
                      + (isStarTierOrAbove ? `｜${upTierCode} 一星以上僅領營業分紅` : "")
                      + (capReasons.length ? `（${capReasons.join("、")}部分達上限）` : ""),
                    created_by: userId,
                  });
                }
                totalDistributed += payable;
                distributedTo.push({
                  level,
                  amount: payable,
                  note: formatLevelNote(payable, capReasons, true, basePoints),
                });
              } else if (upId && !upVipActive && basePoints > 0) {
                distributedTo.push({
                  level,
                  amount: 0,
                  note: formatLevelNote(0, [], false, basePoints),
                });
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
              note: formatBuyerMarkerNote(rewardEarn, totalDistributed, distributedTo),
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
