import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function ensureAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r: any) => r.role);
  if (!roles.some((r: string) => ["super_admin", "admin"].includes(r))) {
    throw new Error("沒有權限");
  }
}

/** 公開：列出所有啟用中的 VIP 階級 */
export const listVipTiers = createServerFn({ method: "GET" }).handler(async () => {
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await sb.from("vip_tiers").select("*").order("sort_order");
  if (error) throw error;
  return data ?? [];
});

/** 公開：列出所有啟用中的升級套組（含綁定商品資訊） */
export const listVipUpgradePackages = createServerFn({ method: "GET" }).handler(async () => {
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await sb
    .from("vip_upgrade_packages")
    .select("*")
    .eq("status", "active")
    .order("sort_order");
  if (error) throw error;
  const list = (data ?? []) as any[];
  const productIds = list.map((p) => p.product_id).filter(Boolean);
  let pMap = new Map<string, any>();
  if (productIds.length) {
    const { data: prods } = await sb
      .from("products")
      .select("id, sku, name, price, image, status")
      .in("id", productIds);
    pMap = new Map((prods ?? []).map((p: any) => [p.id, p]));
  }
  return list.map((p) => ({
    ...p,
    product: p.product_id ? pMap.get(p.product_id) ?? null : null,
  }));
});

/** Admin：列出全部階級（含停用） */
export const adminListVipTiers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.from("vip_tiers").select("*").order("sort_order");
    if (error) throw error;
    return data ?? [];
  });

const tierSchema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().min(1).max(8),
  name: z.string().min(1),
  sort_order: z.number().int().default(0),
  required_reward_points: z.number().int().default(0),
  required_direct_vip: z.number().int().default(0),
  required_mentor_tier: z.string().nullable().optional(),
  required_mentor_count: z.number().int().default(0),
  cashback_rate: z.number().default(0),
  revenue_share_rate: z.number().default(0),
  upgrade_bonus_cap: z.number().default(0),
  renewal_window_days: z.number().int().default(0),
  renewal_required_new_vip: z.number().int().default(0),
  extra_config: z.any().optional(),
  description: z.string().nullable().optional(),
  status: z.enum(["active", "inactive"]).default("active"),
});

/** Admin：新增 / 更新階級 */
export const upsertVipTier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => tierSchema.parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const payload: any = { ...data, extra_config: data.extra_config ?? {} };
    if (!payload.id) delete payload.id;
    const { data: row, error } = await supabaseAdmin
      .from("vip_tiers")
      .upsert(payload, { onConflict: "code" })
      .select()
      .single();
    if (error) throw error;
    await supabaseAdmin.from("audit_logs").insert({
      user_id: context.userId,
      action: data.id ? "update" : "create",
      entity: "vip_tier",
      entity_id: row.id,
      metadata: { code: row.code },
    });
    return row;
  });

/** Admin：列出全部套組（含停用） */
export const adminListVipPackages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("vip_upgrade_packages")
      .select("*")
      .order("tier_code")
      .order("sort_order");
    if (error) throw error;
    return data ?? [];
  });

const pkgSchema = z.object({
  id: z.string().uuid().optional(),
  tier_code: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  price: z.number().min(0),
  bonus_points: z.number().int().min(0).default(0),
  duration_days: z.number().int().min(0).default(0),
  sort_order: z.number().int().default(0),
  status: z.enum(["active", "inactive"]).default("active"),
});

export const upsertVipPackage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => pkgSchema.parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const payload: any = { ...data };
    if (!payload.id) delete payload.id;
    const { data: row, error } = await supabaseAdmin
      .from("vip_upgrade_packages")
      .upsert(payload)
      .select()
      .single();
    if (error) throw error;
    await supabaseAdmin.from("audit_logs").insert({
      user_id: context.userId,
      action: data.id ? "update" : "create",
      entity: "vip_upgrade_package",
      entity_id: row.id,
      metadata: { name: row.name, tier_code: row.tier_code },
    });
    return row;
  });

export const deleteVipPackage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("vip_upgrade_packages").delete().eq("id", data.id);
    if (error) throw error;
    await supabaseAdmin.from("audit_logs").insert({
      user_id: context.userId,
      action: "delete",
      entity: "vip_upgrade_package",
      entity_id: data.id,
      metadata: {},
    });
    return { ok: true };
  });

/**
 * 會員：申請購買升級套組
 *
 * SECURITY: 此函式僅建立 `pending` 升級訂單，不會直接將會員升級、不發放贈點、
 * 不修改 vip_tier / is_vip / vip_expires_at。實際升級必須由管理員透過
 * `confirmVipUpgradePayment` 在驗證金流後執行。
 */
export const purchaseVipUpgrade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ packageId: z.string().uuid(), paymentMethod: z.string().default("bank_transfer") }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: pkg, error: pkgErr } = await supabaseAdmin
      .from("vip_upgrade_packages")
      .select("*")
      .eq("id", data.packageId)
      .eq("status", "active")
      .maybeSingle();
    if (pkgErr || !pkg) throw new Error("套組不存在或已停用");

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("vip_tier")
      .eq("id", context.userId)
      .maybeSingle();
    const currentTier = (profile as any)?.vip_tier as string | null;

    const { data: order, error: orderErr } = await supabaseAdmin
      .from("vip_upgrade_orders")
      .insert({
        user_id: context.userId,
        package_id: pkg.id,
        tier_code: pkg.tier_code,
        amount: pkg.price,
        bonus_points: pkg.bonus_points,
        payment_method: data.paymentMethod,
        payment_status: "pending",
        previous_tier: currentTier,
        new_tier: null,
        notes: "等待管理員確認金流",
      })
      .select()
      .single();
    if (orderErr) throw orderErr;

    await supabaseAdmin.from("audit_logs").insert({
      user_id: context.userId,
      action: "vip_upgrade_request",
      entity: "vip_upgrade_order",
      entity_id: order.id,
      metadata: {
        package_id: pkg.id,
        tier_code: pkg.tier_code,
        amount: pkg.price,
        payment_status: "pending",
      },
    });

    return {
      ok: true,
      upgraded: false,
      pending: true,
      order,
      new_tier: currentTier,
      message: "已建立升級申請，待管理員確認金流後生效",
    };
  });

/**
 * Admin：確認 VIP 升級訂單金流，執行實際升級 + 贈點發放。
 * 僅 admin / super_admin 可呼叫；不可重複確認已 paid 的訂單。
 */
export const confirmVipUpgradePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ orderId: z.string().uuid(), note: z.string().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: order, error: orderErr } = await supabaseAdmin
      .from("vip_upgrade_orders")
      .select("*")
      .eq("id", data.orderId)
      .maybeSingle();
    if (orderErr || !order) throw new Error("訂單不存在");
    if ((order as any).payment_status === "paid") {
      throw new Error("此訂單已確認，不可重複處理");
    }

    const { data: pkg } = await supabaseAdmin
      .from("vip_upgrade_packages")
      .select("*")
      .eq("id", (order as any).package_id)
      .maybeSingle();
    if (!pkg) throw new Error("套組已不存在");

    const { data: tiers } = await supabaseAdmin.from("vip_tiers").select("code, sort_order");
    const tierMap = new Map<string, number>((tiers ?? []).map((t: any) => [t.code, t.sort_order]));
    const targetOrder = tierMap.get((pkg as any).tier_code) ?? 0;

    const userId = (order as any).user_id as string;
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("vip_tier, is_vip, vip_expires_at")
      .eq("id", userId)
      .maybeSingle();
    const currentTier = (profile as any)?.vip_tier as string | null;
    const currentOrder = currentTier ? tierMap.get(currentTier) ?? 0 : 0;
    const willUpgrade = targetOrder > currentOrder;

    const now = new Date().toISOString();
    const newTier = willUpgrade ? (pkg as any).tier_code : currentTier;
    const expires =
      (pkg as any).duration_days > 0
        ? new Date(Date.now() + (pkg as any).duration_days * 86400000).toISOString()
        : (profile as any)?.vip_expires_at ?? null;

    const { error: updErr } = await supabaseAdmin
      .from("vip_upgrade_orders")
      .update({
        payment_status: "paid",
        paid_at: now,
        applied_at: now,
        new_tier: newTier,
        notes: data.note ?? (willUpgrade ? "管理員確認金流，升級成功" : "管理員確認金流（同階/低階：僅發放贈點）"),
      })
      .eq("id", data.orderId)
      .eq("payment_status", "pending"); // 防止 race 重複確認
    if (updErr) throw updErr;

    if (willUpgrade) {
      const { error: upErr } = await supabaseAdmin
        .from("profiles")
        .update({ vip_tier: (pkg as any).tier_code, is_vip: true, vip_expires_at: expires })
        .eq("id", userId);
      if (upErr) throw upErr;
    } else if ((pkg as any).duration_days > 0) {
      await supabaseAdmin
        .from("profiles")
        .update({ is_vip: true, vip_expires_at: expires })
        .eq("id", userId);
    }

    if ((pkg as any).bonus_points > 0) {
      const { data: wallet } = await supabaseAdmin
        .from("member_points_wallet")
        .select("reward_points")
        .eq("user_id", userId)
        .maybeSingle();
      const newBalance = Number((wallet as any)?.reward_points ?? 0) + (pkg as any).bonus_points;
      await supabaseAdmin
        .from("member_points_wallet")
        .upsert(
          { user_id: userId, reward_points: newBalance, updated_at: now },
          { onConflict: "user_id" },
        );
      await supabaseAdmin.from("reward_wallet_logs").insert({
        member_id: userId,
        points: (pkg as any).bonus_points,
        type: "earn",
        description: `VIP 升級套組贈點：${(pkg as any).name}`,
      });
    }

    await supabaseAdmin.from("audit_logs").insert({
      user_id: context.userId,
      action: "vip_upgrade_confirm",
      entity: "vip_upgrade_order",
      entity_id: data.orderId,
      metadata: {
        confirmed_by: context.userId,
        target_user: userId,
        package_id: (pkg as any).id,
        tier_code: (pkg as any).tier_code,
        previous_tier: currentTier,
        new_tier: newTier,
        upgraded: willUpgrade,
        amount: (pkg as any).price,
      },
    });

    return { ok: true, upgraded: willUpgrade, new_tier: newTier };
  });

/** 會員：取得自己的 VIP 升級紀錄 */
export const getMyVipUpgradeOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: orders }, { data: profile }] = await Promise.all([
      supabaseAdmin
        .from("vip_upgrade_orders")
        .select("*")
        .eq("user_id", context.userId)
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("profiles")
        .select("vip_tier, is_vip, vip_expires_at")
        .eq("id", context.userId)
        .maybeSingle(),
    ]);
    return { orders: orders ?? [], profile: profile ?? null };
  });
