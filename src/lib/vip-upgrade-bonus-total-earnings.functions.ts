import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function ensureAdminOrFinance(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r: any) => r.role);
  if (!roles.some((r: string) => ["super_admin", "admin", "finance"].includes(r))) {
    throw new Error("沒有權限");
  }
}

/** 試算（不寫入）：依會員總收益計算升級分紅實際可發 / 截斷 / 狀態 */
export const previewUpgradeBonusTotalEarningsRelease = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { memberId: string; tierCode: string; bonusAmount: number }) =>
    z
      .object({
        memberId: z.string().uuid(),
        tierCode: z.string().min(1).max(8),
        bonusAmount: z.number().min(0),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase.rpc("calc_upgrade_bonus_total_earnings_release", {
      _member_id: data.memberId,
      _tier_code: data.tierCode,
      _bonus_amount: data.bonusAmount,
    });
    if (error) throw error;
    return Array.isArray(rows) ? rows[0] ?? null : rows;
  });

/** 取得會員當前總收益 / 上限 / 剩餘可領 */
export const getMemberTotalEarningsSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { memberId: string; tierCode?: string }) =>
    z.object({ memberId: z.string().uuid(), tierCode: z.string().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.memberId !== userId) await ensureAdminOrFinance(supabase, userId);

    const { data: total, error: e1 } = await supabase.rpc("get_member_total_earnings", {
      _member_id: data.memberId,
    });
    if (e1) throw e1;

    let cap = 0;
    let tierCode = data.tierCode ?? "";
    if (!tierCode) {
      const { data: p } = await supabase
        .from("profiles")
        .select("legacy_rank, vip_tier")
        .eq("id", data.memberId)
        .maybeSingle();
      tierCode = String((p as any)?.legacy_rank ?? (p as any)?.vip_tier ?? "").toUpperCase();
    }
    if (tierCode) {
      const { data: c } = await supabase.rpc("get_tier_upgrade_total_earnings_cap", {
        _tier_code: tierCode,
      });
      cap = Number(c ?? 0);
    }
    const totalNum = Number(total ?? 0);
    return {
      memberId: data.memberId,
      tierCode,
      totalEarnings: totalNum,
      cap,
      remaining: cap > 0 ? Math.max(cap - totalNum, 0) : null,
      reachedCap: cap > 0 && totalNum >= cap,
    };
  });

/** 取得目前納入總收益的 bonus 類型清單 */
export const getUpgradeBonusTotalEarningsTypes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("system_settings")
      .select("value")
      .eq("key", "upgrade_bonus_total_earnings_types")
      .maybeSingle();
    if (error) throw error;
    return (data?.value as string[]) ?? [];
  });

/** 後台：更新納入總收益的 bonus 類型清單 */
export const updateUpgradeBonusTotalEarningsTypes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { types: string[] }) =>
    z.object({ types: z.array(z.string().min(1)).min(0) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await ensureAdminOrFinance(supabase, userId);
    const { error } = await supabase
      .from("system_settings")
      .update({ value: data.types, updated_by: userId })
      .eq("key", "upgrade_bonus_total_earnings_types");
    if (error) throw error;
    return { ok: true };
  });

/** 後台：列出各 VIP 階級的升級分紅總收益上限設定 */
export const adminListTiersTotalEarningsCap = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await ensureAdminOrFinance(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("vip_tiers")
      .select("id, code, name, sort_order, upgrade_bonus_cap_basis, upgrade_total_earnings_cap_amount, upgrade_bonus_cap_amount")
      .order("sort_order", { ascending: true });
    if (error) throw error;
    return data ?? [];
  });

/** 後台：更新某 VIP 階級的升級分紅總收益上限 / 判斷依據 */
export const updateTierTotalEarningsCap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { tierId: string; capAmount: number; capBasis: "total_earnings" | "upgrade_only" }) =>
    z
      .object({
        tierId: z.string().uuid(),
        capAmount: z.number().min(0),
        capBasis: z.enum(["total_earnings", "upgrade_only"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await ensureAdminOrFinance(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("vip_tiers")
      .update({
        upgrade_total_earnings_cap_amount: data.capAmount,
        upgrade_bonus_cap_basis: data.capBasis,
      })
      .eq("id", data.tierId);
    if (error) throw error;
    return { ok: true };
  });

/** 後台：列出總收益上限 ledger */
export const adminListTotalEarningsLedger = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { memberId?: string; limit?: number }) =>
    z
      .object({ memberId: z.string().uuid().optional(), limit: z.number().min(1).max(500).optional() })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await ensureAdminOrFinance(supabase, userId);
    let q = supabase
      .from("vip_upgrade_bonus_total_earnings_ledger")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 100);
    if (data.memberId) q = q.eq("member_id", data.memberId);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });
