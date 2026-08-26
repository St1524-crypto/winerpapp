import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * 制度表一次查詢：日獎金 + 月獎金 + 升級條件 全部列出。
 * 只讀，不做任何寫入。
 */
export const getSystemRuleSheet = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabase: any = (context as any).supabase;
    const userId = (context as any).userId as string;

    const { data: roleRows } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const roles = (roleRows ?? []).map((r: any) => r.role);
    if (!roles.some((r: string) => ["super_admin", "admin", "finance"].includes(r))) {
      throw new Error("沒有權限");
    }

    const [tiers, repurchase, rankRebate, monthlyTier, pools, national, settings] = await Promise.all([
      supabase.from("vip_tiers").select("*").order("sort_order"),
      supabase.from("repurchase_bonus_settings").select("*").order("generation_level"),
      supabase.from("rank_rebate_settings").select("*").order("sort_order"),
      supabase.from("monthly_tier_bonus_settings").select("*").order("sort_order"),
      supabase.from("vip_bonus_pools").select("*").order("sort_order"),
      supabase.from("national_bonus_pool_settings").select("*").order("tier_code"),
      supabase.from("bonus_settings").select("*").maybeSingle(),
    ]);

    const firstError = [tiers, repurchase, rankRebate, monthlyTier, pools, national, settings].find(
      (r: any) => r?.error,
    ) as any;
    if (firstError?.error) throw firstError.error;

    return {
      tiers: tiers.data ?? [],
      repurchase: repurchase.data ?? [],
      rankRebate: rankRebate.data ?? [],
      monthlyTier: monthlyTier.data ?? [],
      pools: pools.data ?? [],
      national: national.data ?? [],
      settings: settings.data ?? null,
    };
  });
