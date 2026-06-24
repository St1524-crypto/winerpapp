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

/** 試算（不寫入） */
export const previewBusinessBonusRelease = createServerFn({ method: "POST" })
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
    const { data: rows, error } = await supabase.rpc("calc_business_bonus_release", {
      _member_id: data.memberId,
      _tier_code: data.tierCode,
      _bonus_amount: data.bonusAmount,
    });
    if (error) throw error;
    return Array.isArray(rows) ? rows[0] ?? null : rows;
  });

/** 取得會員營業分紅累計 / 比例 / 上限 / 剩餘可領 */
export const getMemberBusinessBonusSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { memberId: string }) =>
    z.object({ memberId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.memberId !== userId) {
      await ensureAdminOrFinance(supabase, userId);
    }
    const [{ data: total, error: e1 }, { data: cap, error: e2 }, { data: tier, error: e3 }, { data: rate, error: e4 }] =
      await Promise.all([
        supabase.rpc("get_member_business_bonus_total", { _member_id: data.memberId }),
        supabase.rpc("get_member_business_bonus_cap", { _member_id: data.memberId }),
        supabase.rpc("get_member_vip_tier_code", { _member_id: data.memberId }),
        supabase.rpc("get_member_business_bonus_rate", { _member_id: data.memberId }),
      ]);
    if (e1) throw e1;
    if (e2) throw e2;
    if (e3) throw e3;
    if (e4) throw e4;
    const totalNum = Number(total ?? 0);
    const capNum = Number(cap ?? 0);
    const rateNum = Number(rate ?? 0);
    const remaining = capNum > 0 ? Math.max(capNum - totalNum, 0) : null;
    return {
      memberId: data.memberId,
      tierCode: (tier as string) ?? "",
      rate: rateNum,
      total: totalNum,
      cap: capNum,
      remaining,
      reachedCap: capNum > 0 && totalNum >= capNum,
    };
  });

/** Admin：ledger 列表 */
export const adminListBusinessBonusLedger = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { memberId?: string; limit?: number }) =>
    z.object({ memberId: z.string().uuid().optional(), limit: z.number().min(1).max(500).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await ensureAdminOrFinance(supabase, userId);
    let q = supabase
      .from("vip_business_bonus_ledger")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 100);
    if (data.memberId) q = q.eq("member_id", data.memberId);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

/** Admin：所有會員的營業分紅累計與上限 */
export const adminListMembersBusinessBonusSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await ensureAdminOrFinance(supabase, userId);

    const { data: tiers, error: tierErr } = await supabase
      .from("vip_tiers")
      .select("code, business_bonus_rate, business_bonus_cap_amount");
    if (tierErr) throw tierErr;
    const capByTier = new Map<string, { cap: number; rate: number }>();
    (tiers ?? []).forEach((t: any) => {
      capByTier.set(String(t.code).toUpperCase(), {
        cap: Number(t.business_bonus_cap_amount ?? 0),
        rate: Number(t.business_bonus_rate ?? 0),
      });
    });

    const { data: ledger, error: lerr } = await supabase
      .from("vip_business_bonus_ledger")
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
      const t = capByTier.get(tierCode) ?? { cap: 0, rate: 0 };
      return {
        memberId: mid,
        memberNo: p?.member_no ?? null,
        name: p?.name ?? null,
        email: p?.email ?? null,
        tierCode,
        rate: t.rate,
        total: a.total,
        cap: t.cap,
        remaining: t.cap > 0 ? Math.max(t.cap - a.total, 0) : null,
        reachedCap: t.cap > 0 && a.total >= t.cap,
      };
    });
  });
