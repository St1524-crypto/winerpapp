import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type Tier = {
  code: string;
  name: string;
  sort_order: number;
  required_pv: number;
  required_direct_vip: number;
  required_mentor_tier: string | null;
  required_mentor_count: number;
  condition_logic: "OR" | "AND";
  maintenance_window_days: number;
  maintenance_required_vip: number;
};

async function loadTiers(): Promise<Tier[]> {
  const { data } = await supabaseAdmin
    .from("dealer_tiers")
    .select("code,name,sort_order,required_pv,required_direct_vip,required_mentor_tier,required_mentor_count,condition_logic,maintenance_window_days,maintenance_required_vip")
    .eq("status", "active")
    .order("sort_order");
  return (data ?? []) as any;
}

async function countMentoredAtTier(userId: string, tierCode: string): Promise<number> {
  // 直接推薦人 = referrer，計算他們之中目前已達 tierCode 以上的人數
  const tiers = await loadTiers();
  const targetOrder = tiers.find((t) => t.code === tierCode)?.sort_order ?? 0;
  const eligibleCodes = tiers.filter((t) => t.sort_order >= targetOrder).map((t) => t.code);
  if (eligibleCodes.length === 0) return 0;

  const { data: refs } = await supabaseAdmin
    .from("referrals")
    .select("referred_user_id")
    .eq("referrer_id", userId);
  const downlineIds = (refs ?? []).map((r: any) => r.referred_user_id);
  if (downlineIds.length === 0) return 0;

  const { data: statuses } = await supabaseAdmin
    .from("dealer_tier_status")
    .select("user_id, current_tier")
    .in("user_id", downlineIds);
  return (statuses ?? []).filter((s: any) => eligibleCodes.includes(s.current_tier)).length;
}

function tierConditionsMet(
  tier: Tier,
  metrics: { current_pv: number; direct_vip_count: number },
  mentoredAtRequiredTier: number,
): boolean {
  const checks: boolean[] = [];
  if (tier.required_pv > 0) checks.push(metrics.current_pv >= tier.required_pv);
  if (tier.required_direct_vip > 0) checks.push(metrics.direct_vip_count >= tier.required_direct_vip);
  if (tier.required_mentor_tier && tier.required_mentor_count > 0) {
    checks.push(mentoredAtRequiredTier >= tier.required_mentor_count);
  }
  if (checks.length === 0) return false;
  return tier.condition_logic === "AND" ? checks.every(Boolean) : checks.some(Boolean);
}

/** 評估並更新指定會員的階級。回傳變動結果。 */
export const evaluateDealerTier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const targetUserId = data.userId ?? context.userId;

    // 權限：只能評估自己，或管理員可評估任何人
    if (targetUserId !== context.userId) {
      const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", context.userId);
      const ok = (roles ?? []).some((r: any) => ["super_admin", "admin", "finance", "sales"].includes(r.role));
      if (!ok) throw new Error("沒有權限評估他人");
    }

    const [{ data: metrics }, tiers, { data: current }] = await Promise.all([
      supabaseAdmin.from("dealer_metrics").select("current_pv, direct_vip_count").eq("user_id", targetUserId).maybeSingle(),
      loadTiers(),
      supabaseAdmin.from("dealer_tier_status").select("*").eq("user_id", targetUserId).maybeSingle(),
    ]);

    const m = {
      current_pv: Number((metrics as any)?.current_pv ?? 0),
      direct_vip_count: Number((metrics as any)?.direct_vip_count ?? 0),
    };

    // 由高到低檢查，命中第一個即為新階級
    const sorted = [...tiers].sort((a, b) => b.sort_order - a.sort_order);
    let newTier: Tier | null = null;
    for (const tier of sorted) {
      const mentored = tier.required_mentor_tier
        ? await countMentoredAtTier(targetUserId, tier.required_mentor_tier)
        : 0;
      if (tierConditionsMet(tier, m, mentored)) {
        newTier = tier;
        break;
      }
    }

    const fromTier = (current as any)?.current_tier ?? null;
    const toTier = newTier?.code ?? null;

    if (fromTier === toTier) {
      return { changed: false, current_tier: toTier };
    }

    // 升降階紀錄
    const fromOrder = tiers.find((t) => t.code === fromTier)?.sort_order ?? 0;
    const toOrder = newTier?.sort_order ?? 0;
    const changeType = toOrder > fromOrder ? "promotion" : "demotion";

    const now = new Date();
    const expires = newTier && newTier.maintenance_window_days > 0
      ? new Date(now.getTime() + newTier.maintenance_window_days * 86400000)
      : null;

    await supabaseAdmin.from("dealer_tier_status").upsert({
      user_id: targetUserId,
      current_tier: toTier,
      promoted_at: changeType === "promotion" ? now.toISOString() : (current as any)?.promoted_at ?? null,
      maintenance_started_at: expires ? now.toISOString() : null,
      maintenance_expires_at: expires ? expires.toISOString() : null,
      maintenance_new_vip_count: 0,
      updated_at: now.toISOString(),
    });

    await supabaseAdmin.from("dealer_tier_history").insert({
      user_id: targetUserId,
      from_tier: fromTier,
      to_tier: toTier,
      change_type: changeType,
      reason: `自動評估：PV=${m.current_pv}, 直推VIP=${m.direct_vip_count}`,
      triggered_by: context.userId,
    });

    return { changed: true, from: fromTier, to: toTier, change_type: changeType };
  });

/** 取得自己目前的階級狀態與下一階所需條件。 */
export const getMyTierStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [{ data: status }, { data: metrics }, tiers] = await Promise.all([
      supabaseAdmin.from("dealer_tier_status").select("*").eq("user_id", context.userId).maybeSingle(),
      supabaseAdmin.from("dealer_metrics").select("*").eq("user_id", context.userId).maybeSingle(),
      loadTiers(),
    ]);
    const currentOrder = tiers.find((t) => t.code === (status as any)?.current_tier)?.sort_order ?? 0;
    const next = tiers.find((t) => t.sort_order === currentOrder + 1) ?? null;
    return {
      status: status ?? null,
      metrics: metrics ?? { current_pv: 0, direct_vip_count: 0, monthly_personal_points: 0, monthly_income: 0 },
      next_tier: next,
    };
  });
