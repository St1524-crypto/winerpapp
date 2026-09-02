import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const SPLIT_CASH_RATE = 0.8;

export function splitPayout(points: number) {
  const p = Math.max(Math.floor(Number(points ?? 0)), 0);
  const cash = Math.round(p * SPLIT_CASH_RATE);
  return { total: p, cash, point: p - cash };
}

const MONTHLY_TYPES = new Set(["monthly_vip", "rank_rebate", "rank_diff_rebate", "national_share"]);

function kindOf(bonusType: string) {
  return MONTHLY_TYPES.has(bonusType) ? "monthly" : "daily";
}

async function ensureReader(ctx: any) {
  const { data } = await ctx.supabase.from("user_roles").select("role").eq("user_id", ctx.userId);
  const list = ((data ?? []) as any[]).map((r) => r.role as string);
  if (!list.some((r) => ["super_admin", "admin", "finance"].includes(r))) throw new Error("沒有權限");
  return list;
}

type Bucket = { count: number; points: number; cash: number; point: number };
const empty = (): Bucket => ({ count: 0, points: 0, cash: 0, point: 0 });
function add(b: Bucket, points: number) {
  const s = splitPayout(points);
  b.count += 1;
  b.points += s.total;
  b.cash += s.cash;
  b.point += s.point;
}

/** 只讀：每位 VIP 的日結／月結待發放與已發放明細（含 80/20 拆分） */
export const getVipPayoutReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ from: z.string().optional(), to: z.string().optional() })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await ensureReader(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const today = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Taipei" }))
      .toISOString()
      .slice(0, 10);

    let q = (supabaseAdmin as any)
      .from("bonus_records")
      .select(
        "id, member_id, released_member_id, bonus_type, bonus_points, status, settlement_date, release_date, released_at",
      )
      .in("status", ["waiting_release", "released"])
      .gt("bonus_points", 0)
      .limit(20000);
    if (data.from) q = q.gte("settlement_date", data.from);
    if (data.to) q = q.lte("settlement_date", data.to);
    const { data: records, error } = await q;
    if (error) throw new Error(error.message);

    const rows = (records ?? []) as any[];
    const memberIds = Array.from(
      new Set(rows.map((r) => r.released_member_id ?? r.member_id).filter(Boolean)),
    );
    let profiles: any[] = [];
    if (memberIds.length) {
      const { data: p } = await (supabaseAdmin as any)
        .from("profiles")
        .select("id, name, member_no, vip_tier_code, cash_balance, reward_points")
        .in("id", memberIds);
      profiles = p ?? [];
    }
    const pMap = new Map(profiles.map((p) => [p.id, p]));

    const byMember = new Map<string, any>();
    const totals = {
      waitingDaily: empty(),
      waitingMonthly: empty(),
      releasedDaily: empty(),
      releasedMonthly: empty(),
      due: empty(),
    };

    for (const r of rows) {
      const mid = r.released_member_id ?? r.member_id;
      if (!mid) continue;
      const kind = kindOf(r.bonus_type);
      const released = r.status === "released";
      let m = byMember.get(mid);
      if (!m) {
        const p = pMap.get(mid);
        m = {
          memberId: mid,
          name: p?.name ?? null,
          memberNo: p?.member_no ?? null,
          tierCode: p?.vip_tier_code ?? null,
          cashBalance: Number(p?.cash_balance ?? 0),
          rewardPoints: Number(p?.reward_points ?? 0),
          waitingDaily: empty(),
          waitingMonthly: empty(),
          releasedDaily: empty(),
          releasedMonthly: empty(),
          due: empty(),
          lastReleasedAt: null as string | null,
        };
        byMember.set(mid, m);
      }
      const key = `${released ? "released" : "waiting"}${kind === "daily" ? "Daily" : "Monthly"}`;
      add(m[key], r.bonus_points);
      add((totals as any)[key], r.bonus_points);
      if (!released && (!r.release_date || String(r.release_date) <= today)) {
        add(m.due, r.bonus_points);
        add(totals.due, r.bonus_points);
      }
      if (released && r.released_at && (!m.lastReleasedAt || r.released_at > m.lastReleasedAt)) {
        m.lastReleasedAt = r.released_at;
      }
    }

    const members = Array.from(byMember.values()).sort(
      (a, b) =>
        b.waitingDaily.points + b.waitingMonthly.points - (a.waitingDaily.points + a.waitingMonthly.points) ||
        b.releasedDaily.points + b.releasedMonthly.points - (a.releasedDaily.points + a.releasedMonthly.points),
    );

    return {
      today,
      split: { cashRate: SPLIT_CASH_RATE, pointRate: 1 - SPLIT_CASH_RATE },
      totals,
      members,
      memberCount: members.length,
    };
  });

/** 只讀：制度報告用的 80/20 摘要（已發放 vs 待發放預估） */
export const getPayoutSummaryForRules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureReader(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const today = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Taipei" }))
      .toISOString()
      .slice(0, 10);

    const { data: records, error } = await (supabaseAdmin as any)
      .from("bonus_records")
      .select("bonus_points, status, bonus_type, release_date")
      .in("status", ["waiting_release", "released"])
      .gt("bonus_points", 0)
      .limit(20000);
    if (error) throw new Error(error.message);

    const released = empty();
    const waiting = empty();
    const due = empty();
    for (const r of (records ?? []) as any[]) {
      if (r.status === "released") add(released, r.bonus_points);
      else {
        add(waiting, r.bonus_points);
        if (!r.release_date || String(r.release_date) <= today) add(due, r.bonus_points);
      }
    }

    const { data: pool } = await (supabaseAdmin as any)
      .from("vip_bonus_pools")
      .select("code, name, tier_codes, bonus_rate, status")
      .eq("code", "POOL_VSTEA")
      .maybeSingle();

    const { count: activeGrants } = await (supabaseAdmin as any)
      .from("member_bonus_eligibility_grants")
      .select("id", { count: "exact", head: true })
      .eq("pool_kind", "consumption")
      .lte("starts_on", today)
      .gte("ends_on", today);

    return {
      today,
      split: { cashRate: SPLIT_CASH_RATE, pointRate: 1 - SPLIT_CASH_RATE },
      released,
      waiting,
      due,
      pool: pool ?? null,
      poolActiveMembers: activeGrants ?? 0,
    };
  });
