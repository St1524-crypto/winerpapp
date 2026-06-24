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

/** 公開：列出所有啟用中的升級套組 */
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
  return data ?? [];
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

/** 會員：購買升級套組（模擬付款流程：直接標記 paid 並升級） */
export const purchaseVipUpgrade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ packageId: z.string().uuid(), paymentMethod: z.string().default("bank_transfer") }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1. 載入套組與對應階級
    const { data: pkg, error: pkgErr } = await supabaseAdmin
      .from("vip_upgrade_packages")
      .select("*")
      .eq("id", data.packageId)
      .eq("status", "active")
      .maybeSingle();
    if (pkgErr || !pkg) throw new Error("套組不存在或已停用");

    const { data: tiers } = await supabaseAdmin.from("vip_tiers").select("code, sort_order");
    const tierMap = new Map<string, number>((tiers ?? []).map((t: any) => [t.code, t.sort_order]));
    const targetOrder = tierMap.get(pkg.tier_code) ?? 0;

    // 2. 取得會員目前階級
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("vip_tier, is_vip, vip_expires_at")
      .eq("id", context.userId)
      .maybeSingle();
    const currentTier = (profile as any)?.vip_tier as string | null;
    const currentOrder = currentTier ? tierMap.get(currentTier) ?? 0 : 0;
    const willUpgrade = targetOrder > currentOrder;

    // 3. 建立升級訂單（直接視為 paid，整合金流時改為 pending → webhook 標記）
    const now = new Date().toISOString();
    const newTier = willUpgrade ? pkg.tier_code : currentTier;
    const expires = pkg.duration_days > 0
      ? new Date(Date.now() + pkg.duration_days * 86400000).toISOString()
      : (profile as any)?.vip_expires_at ?? null;

    const { data: order, error: orderErr } = await supabaseAdmin
      .from("vip_upgrade_orders")
      .insert({
        user_id: context.userId,
        package_id: pkg.id,
        tier_code: pkg.tier_code,
        amount: pkg.price,
        bonus_points: pkg.bonus_points,
        payment_method: data.paymentMethod,
        payment_status: "paid",
        paid_at: now,
        applied_at: now,
        previous_tier: currentTier,
        new_tier: newTier,
        notes: willUpgrade ? "升級成功" : "同階或低階：僅發放贈點",
      })
      .select()
      .single();
    if (orderErr) throw orderErr;

    // 4. 僅升不降地更新 profile
    if (willUpgrade) {
      const { error: upErr } = await supabaseAdmin
        .from("profiles")
        .update({
          vip_tier: pkg.tier_code,
          is_vip: true,
          vip_expires_at: expires,
        })
        .eq("id", context.userId);
      if (upErr) throw upErr;
    } else if (pkg.duration_days > 0) {
      // 同階續期
      await supabaseAdmin
        .from("profiles")
        .update({ is_vip: true, vip_expires_at: expires })
        .eq("id", context.userId);
    }

    // 5. 發放贈送獎勵點
    if (pkg.bonus_points > 0) {
      const { data: wallet } = await supabaseAdmin
        .from("member_points_wallet")
        .select("reward_points")
        .eq("user_id", context.userId)
        .maybeSingle();
      const newBalance = Number((wallet as any)?.reward_points ?? 0) + pkg.bonus_points;
      await supabaseAdmin
        .from("member_points_wallet")
        .upsert(
          { user_id: context.userId, reward_points: newBalance, updated_at: now },
          { onConflict: "user_id" },
        );
      await supabaseAdmin.from("reward_wallet_logs").insert({
        member_id: context.userId,
        points: pkg.bonus_points,
        type: "earn",
        description: `VIP 升級套組贈點：${pkg.name}`,
      });
    }

    // 6. audit log
    await supabaseAdmin.from("audit_logs").insert({
      user_id: context.userId,
      action: "vip_upgrade",
      entity: "vip_upgrade_order",
      entity_id: order.id,
      metadata: {
        package_id: pkg.id,
        tier_code: pkg.tier_code,
        previous_tier: currentTier,
        new_tier: newTier,
        upgraded: willUpgrade,
        amount: pkg.price,
      },
    });

    return { ok: true, upgraded: willUpgrade, order, new_tier: newTier };
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
