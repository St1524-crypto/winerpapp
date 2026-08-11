import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type BonusPoolKind = "consumption" | "business";

export type BonusEligibilityGrant = {
  id: string;
  user_id: string;
  pool_kind: BonusPoolKind;
  starts_on: string;
  ends_on: string;
  reason: string | null;
  created_at: string;
};

async function assertAdmin(ctx: any) {
  for (const role of ["super_admin", "admin", "finance"]) {
    const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: role });
    if (data) return;
  }
  throw new Error("Forbidden: 需要管理員權限");
}

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u, "日期格式需為 YYYY-MM-DD");

const SetSchema = z.object({
  userId: z.string().uuid(),
  poolKind: z.enum(["consumption", "business"]),
  enabled: z.boolean(),
  startsOn: DATE.optional(),
  endsOn: DATE.optional(),
  reason: z.string().trim().max(200).optional().or(z.literal("")),
});

/** 讀取指定會員的分紅資格授權（消費回饋 / 營業分紅）。 */
export const listMemberBonusGrants = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string }) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await (supabaseAdmin as any)
      .from("member_bonus_eligibility_grants")
      .select("id, user_id, pool_kind, starts_on, ends_on, reason, created_at")
      .eq("user_id", data.userId);
    if (error) throw new Error(error.message);
    return (rows ?? []) as BonusEligibilityGrant[];
  });

/** 讀取目前仍在有效期間內的所有授權（供列表徽章使用）。 */
export const listActiveBonusGrants = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await (supabaseAdmin as any)
      .from("member_bonus_eligibility_grants")
      .select("id, user_id, pool_kind, starts_on, ends_on, reason, created_at")
      .lte("starts_on", today)
      .gte("ends_on", today);
    if (error) throw new Error(error.message);
    return (data ?? []) as BonusEligibilityGrant[];
  });

/** 設定或撤銷授權。啟用時未指定期間則預設今天起算 3 個月。 */
export const setMemberBonusGrant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SetSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (!data.enabled) {
      const { error } = await (supabaseAdmin as any)
        .from("member_bonus_eligibility_grants")
        .delete()
        .eq("user_id", data.userId)
        .eq("pool_kind", data.poolKind);
      if (error) throw new Error(error.message);
    } else {
      const startsOn = data.startsOn || new Date().toISOString().slice(0, 10);
      let endsOn = data.endsOn || "";
      if (!endsOn) {
        const base = new Date(startsOn);
        base.setMonth(base.getMonth() + 3);
        endsOn = base.toISOString().slice(0, 10);
      }
      if (endsOn < startsOn) throw new Error("授權迄日不可早於起日");
      const { error } = await (supabaseAdmin as any)
        .from("member_bonus_eligibility_grants")
        .upsert(
          {
            user_id: data.userId,
            pool_kind: data.poolKind,
            starts_on: startsOn,
            ends_on: endsOn,
            reason: data.reason || null,
            created_by: context.userId,
          },
          { onConflict: "user_id,pool_kind" },
        );
      if (error) throw new Error(error.message);
    }

    await (supabaseAdmin as any).from("audit_logs").insert({
      user_id: context.userId,
      entity: "member_bonus_eligibility_grants",
      entity_id: data.userId,
      action: data.enabled ? "grant_bonus_eligibility" : "revoke_bonus_eligibility",
      metadata: {
        pool_kind: data.poolKind,
        starts_on: data.startsOn ?? null,
        ends_on: data.endsOn ?? null,
        reason: data.reason ?? null,
      },
    });

    return { ok: true };
  });
