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

/** 計算（不寫入）某次升級分紅實際可發金額 / 截斷金額 / 狀態 */
export const previewUpgradeBonusRelease = createServerFn({ method: "POST" })
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
    const { data: rows, error } = await supabase.rpc("calc_upgrade_bonus_release", {
      _member_id: data.memberId,
      _tier_code: data.tierCode,
      _bonus_amount: data.bonusAmount,
    });
    if (error) throw error;
    return Array.isArray(rows) ? rows[0] ?? null : rows;
  });

/** 取得會員當前升級分紅累計 / 上限 / 剩餘可領 */
export const getMemberUpgradeBonusSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { memberId: string }) =>
    z.object({ memberId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // 自己或管理員可看
    if (data.memberId !== userId) {
      await ensureAdminOrFinance(supabase, userId);
    }
    const [{ data: total, error: e1 }, { data: cap, error: e2 }, { data: tier, error: e3 }] =
      await Promise.all([
        supabase.rpc("get_member_upgrade_bonus_total", { _member_id: data.memberId }),
        supabase.rpc("get_member_upgrade_bonus_cap", { _member_id: data.memberId }),
        supabase.rpc("get_member_vip_tier_code", { _member_id: data.memberId }),
      ]);
    if (e1) throw e1;
    if (e2) throw e2;
    if (e3) throw e3;
    const totalNum = Number(total ?? 0);
    const capNum = Number(cap ?? 0);
    const remaining = capNum > 0 ? Math.max(capNum - totalNum, 0) : null;
    return {
      memberId: data.memberId,
      tierCode: (tier as string) ?? "",
      total: totalNum,
      cap: capNum,
      remaining,
      reachedCap: capNum > 0 && totalNum >= capNum,
    };
  });

/** Admin：列出升級分紅 ledger（可選會員） */
export const adminListUpgradeBonusLedger = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { memberId?: string; limit?: number }) =>
    z.object({ memberId: z.string().uuid().optional(), limit: z.number().min(1).max(500).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await ensureAdminOrFinance(supabase, userId);
    let q = supabase
      .from("vip_upgrade_bonus_ledger")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 100);
    if (data.memberId) q = q.eq("member_id", data.memberId);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

/** Admin：列出所有 VIP 會員的升級分紅累計與上限 */
export const adminListMembersUpgradeBonusSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await ensureAdminOrFinance(supabase, userId);

    const { data: tiers, error: tierErr } = await supabase
      .from("vip_tiers")
      .select("code, upgrade_bonus_cap_amount, upgrade_bonus_cap");
    if (tierErr) throw tierErr;
    const capByTier = new Map<string, number>();
    (tiers ?? []).forEach((t: any) => {
      capByTier.set(
        String(t.code).toUpperCase(),
        Number(t.upgrade_bonus_cap_amount ?? t.upgrade_bonus_cap ?? 0),
      );
    });

    // 聚合 ledger
    const { data: ledger, error: lerr } = await supabase
      .from("vip_upgrade_bonus_ledger")
      .select("member_id, payable_amount, status, tier_code");
    if (lerr) throw lerr;

    const agg = new Map<string, { total: number; tierCode: string }>();
    (ledger ?? []).forEach((r: any) => {
      if (!["released", "partial_capped"].includes(r.status)) return;
      const cur = agg.get(r.member_id) ?? { total: 0, tierCode: r.tier_code };
      cur.total += Number(r.payable_amount ?? 0);
      cur.tierCode = r.tier_code ?? cur.tierCode;
      agg.set(r.member_id, cur);
    });

    const memberIds = Array.from(agg.keys());
    let profiles: any[] = [];
    if (memberIds.length > 0) {
      const { data: p, error: perr } = await supabase
        .from("profiles")
        .select("id, name, email, member_no, legacy_rank")
        .in("id", memberIds);
      if (perr) throw perr;
      profiles = p ?? [];
    }
    const pMap = new Map(profiles.map((p) => [p.id, p]));

    return memberIds.map((mid) => {
      const a = agg.get(mid)!;
      const p = pMap.get(mid);
      const tierCode = (p?.legacy_rank ?? a.tierCode ?? "").toUpperCase();
      const cap = capByTier.get(tierCode) ?? 0;
      return {
        memberId: mid,
        memberNo: p?.member_no ?? null,
        name: p?.name ?? null,
        email: p?.email ?? null,
        tierCode,
        total: a.total,
        cap,
        remaining: cap > 0 ? Math.max(cap - a.total, 0) : null,
        reachedCap: cap > 0 && a.total >= cap,
      };
    });
  });
