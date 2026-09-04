import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** POOL_VSTEA（消費分紅池）＝ pool_kind: consumption；營業分紅池＝ business */
export const POOL_KIND_LABELS: Record<string, string> = {
  consumption: "消費分紅（POOL_VSTEA）",
  business: "營業分紅",
};

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "日期格式需為 YYYY-MM-DD");
const KIND = z.enum(["consumption", "business"]);

async function roles(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  return ((data ?? []) as any[]).map((r) => r.role as string);
}

async function ensureReader(ctx: any) {
  const list = await roles(ctx.supabase, ctx.userId);
  if (!list.some((r) => ["super_admin", "admin", "finance"].includes(r))) {
    throw new Error("沒有權限");
  }
  return list;
}

async function ensureSuperAdmin(ctx: any) {
  const list = await roles(ctx.supabase, ctx.userId);
  if (!list.includes("super_admin")) throw new Error("只有超級管理員可以修改分紅名單");
  return list;
}

/** 只讀：分紅池設定 + 名單（含會員資料與是否仍在有效期間） */
export const listBonusPoolMembers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ poolKind: KIND }).parse(d ?? { poolKind: "consumption" }))
  .handler(async ({ data, context }) => {
    const list = await ensureReader(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const today = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Taipei" }))
      .toISOString()
      .slice(0, 10);

    const poolCode = data.poolKind === "consumption" ? "POOL_VSTEA" : "POOL_BUSINESS";
    const { data: pool } = await (supabaseAdmin as any)
      .from("vip_bonus_pools")
      .select("id, code, name, tier_codes, bonus_rate, distribution_method, status, apply_total_income_cap, total_income_cap_amount")
      .eq("code", poolCode)
      .maybeSingle();

    const { data: grants, error } = await (supabaseAdmin as any)
      .from("member_bonus_eligibility_grants")
      .select("id, user_id, pool_kind, starts_on, ends_on, reason, exclusive, created_at")
      .eq("pool_kind", data.poolKind)
      .order("ends_on", { ascending: false });
    if (error) throw new Error(error.message);

    const ids = (grants ?? []).map((g: any) => g.user_id);
    let profiles: any[] = [];
    if (ids.length) {
      const { data: p } = await (supabaseAdmin as any)
        .from("profiles")
        .select("id, name, member_no, phone, vip_tier")
        .in("id", ids);
      profiles = p ?? [];
    }
    const map = new Map(profiles.map((p) => [p.id, p]));

    // 領獎上限：消費分紅取 business_bonus_cap_amount（E/A 消費回饋上限）；營業分紅取 upgrade_bonus_cap_amount（星級上限）
    const { data: tiers } = await (supabaseAdmin as any)
      .from("vip_tiers")
      .select("code, name, business_bonus_cap_amount, upgrade_bonus_cap_amount");
    const capOf = (tierCode: string | null) => {
      const t = (tiers ?? []).find((x: any) => x.code === tierCode);
      if (!t) return 0;
      return Number(
        (data.poolKind === "consumption" ? t.business_bonus_cap_amount : t.upgrade_bonus_cap_amount) ?? 0,
      );
    };

    // 目前總收入（制度累計總收入，用於上限判定）
    const earnings = new Map<string, number>();
    await Promise.all(
      ids.map(async (uid: string) => {
        const { data: v } = await (supabaseAdmin as any).rpc("get_member_total_earnings", { _member_id: uid });
        earnings.set(uid, Number(v ?? 0));
      }),
    );

    const rows = (grants ?? []).map((g: any) => {
      const tierCode = map.get(g.user_id)?.vip_tier ?? null;
      const cap = capOf(tierCode);
      const total = earnings.get(g.user_id) ?? 0;
      return {
        ...g,
        active: String(g.starts_on) <= today && String(g.ends_on) >= today,
        name: map.get(g.user_id)?.name ?? null,
        memberNo: map.get(g.user_id)?.member_no ?? null,
        phone: map.get(g.user_id)?.phone ?? null,
        tierCode,
        cap,
        totalEarnings: total,
        remaining: cap > 0 ? Math.max(0, cap - total) : null,
        capReached: cap > 0 && total >= cap,
      };
    });

    return {
      today,
      pool: pool ?? null,
      rows,
      activeCount: rows.filter((r: any) => r.active).length,
      capTotal: rows.reduce((s: number, r: any) => s + (r.cap ?? 0), 0),
      earningsTotal: rows.reduce((s: number, r: any) => s + (r.totalEarnings ?? 0), 0),
      canEdit: list.includes("super_admin"),
    };
  });

/** 只讀：搜尋會員（供加入名單） */
export const searchMembersForPool = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ q: z.string().trim().min(1).max(60) }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureReader(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const q = data.q.replace(/[%,()]/gu, "");
    const { data: rows, error } = await (supabaseAdmin as any)
      .from("profiles")
      .select("id, name, member_no, phone, vip_tier")
      .or(`name.ilike.%${q}%,member_no.ilike.%${q}%,phone.ilike.%${q}%`)
      .limit(20);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

const UpsertSchema = z.object({
  poolKind: KIND,
  userId: z.string().uuid(),
  startsOn: DATE,
  endsOn: DATE,
  exclusive: z.boolean().default(true),
  reason: z.string().trim().max(200).optional(),
});

/** 超級管理員：新增／更新名單成員與期間 */
export const upsertBonusPoolMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpsertSchema.parse(d))
  .handler(async ({ data, context }) => {
    await ensureSuperAdmin(context as any);
    if (data.endsOn < data.startsOn) throw new Error("迄日不可早於起日");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any)
      .from("member_bonus_eligibility_grants")
      .upsert(
        {
          user_id: data.userId,
          pool_kind: data.poolKind,
          starts_on: data.startsOn,
          ends_on: data.endsOn,
          exclusive: data.exclusive,
          reason: data.reason || null,
          created_by: (context as any).userId,
        },
        { onConflict: "user_id,pool_kind" },
      );
    if (error) throw new Error(error.message);

    await (supabaseAdmin as any).from("audit_logs").insert({
      user_id: (context as any).userId,
      entity: "member_bonus_eligibility_grants",
      entity_id: data.userId,
      action: "upsert_bonus_pool_member",
      metadata: { ...data },
    });
    return { ok: true };
  });

/** 超級管理員：移除名單成員 */
export const removeBonusPoolMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureSuperAdmin(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await (supabaseAdmin as any)
      .from("member_bonus_eligibility_grants")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await (supabaseAdmin as any).from("audit_logs").insert({
      user_id: (context as any).userId,
      entity: "member_bonus_eligibility_grants",
      entity_id: data.id,
      action: "remove_bonus_pool_member",
      metadata: { id: data.id },
    });
    return { ok: true };
  });

/** 超級管理員：批次調整名單期間（整份名單同步延長／變更） */
export const bulkUpdatePoolPeriod = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ poolKind: KIND, startsOn: DATE, endsOn: DATE, confirmed: z.literal(true) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensureSuperAdmin(context as any);
    if (data.endsOn < data.startsOn) throw new Error("迄日不可早於起日");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await (supabaseAdmin as any)
      .from("member_bonus_eligibility_grants")
      .update({ starts_on: data.startsOn, ends_on: data.endsOn })
      .eq("pool_kind", data.poolKind)
      .select("id");
    if (error) throw new Error(error.message);
    return { updated: (rows ?? []).length };
  });
