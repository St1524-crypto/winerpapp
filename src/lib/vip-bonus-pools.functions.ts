import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(ctx: any) {
  const { data: isAdmin } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  const { data: isSuper } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "super_admin" });
  const { data: isFinance } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "finance" });
  if (!isAdmin && !isSuper && !isFinance) throw new Error("Forbidden");
}

export const adminListVipBonusPools = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("vip_bonus_pools")
      .select("*")
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const upsertVipBonusPool = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const payload: any = { ...data };
    if (!payload.id) delete payload.id;
    const { data: row, error } = await context.supabase
      .from("vip_bonus_pools")
      .upsert(payload)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteVipBonusPool = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("vip_bonus_pools").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const previewVipBonusPool = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { poolId: string; dailyTotalRewardPoints: number; eligibleMemberCount: number }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: rows, error } = await context.supabase.rpc("calc_vip_bonus_pool_daily", {
      _pool_id: data.poolId,
      _daily_total_reward_points: Number(data.dailyTotalRewardPoints) || 0,
      _eligible_member_count: Number(data.eligibleMemberCount) || 0,
    });
    if (error) throw new Error(error.message);
    return Array.isArray(rows) ? rows[0] : rows;
  });

export const adminListVipBonusPoolPayouts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { poolId?: string } | undefined) => d ?? {})
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    let q = context.supabase
      .from("vip_bonus_pool_payouts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.poolId) q = q.eq("pool_id", data.poolId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
