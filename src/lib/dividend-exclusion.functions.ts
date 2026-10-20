import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertDividendEditor, belongsToDividendCompany, dividendExclusionSchema } from "./dividend-exclusion";

async function checkCompany(db: Parameters<typeof requireSupabaseAuth>[0] extends never ? never : any, userId: string) {
  const [company, profile, memberships] = await Promise.all([
    db.rpc("current_company_id"),
    db.from("profiles").select("current_company_id").eq("id", userId).maybeSingle(),
    db.from("company_members").select("company_id").eq("user_id", userId),
  ]);
  for (const result of [company, profile, memberships]) {
    if (result.error) throw new Error(result.error.message);
  }
  return belongsToDividendCompany(company.data ?? null, profile.data?.current_company_id ?? null,
    (memberships.data ?? []).map((row: { company_id: string }) => row.company_id));
}

export const getMemberDividendExclusion = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.from("member_dividend_exclusions")
      .select("reason").eq("user_id", data.userId).maybeSingle();
    if (error) throw new Error(error.message);
    return { excluded: !!row, reason: row?.reason ?? "", canEditCompany: await checkCompany(context.supabase, data.userId) };
  });

export const setMemberDividendExclusion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => dividendExclusionSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: roles, error: roleError } = await context.supabase.from("user_roles")
      .select("role").eq("user_id", context.userId);
    if (roleError) throw new Error(roleError.message);
    assertDividendEditor((roles ?? []).map((r) => r.role));
    if (!await checkCompany(context.supabase, data.userId)) throw new Error("會員不屬於目前公司，請切換至會員所屬公司後再設定分紅");
    const { error } = await context.supabase.rpc("set_member_dividend_exclusion", {
      _user_id: data.userId, _excluded: data.excluded, _reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });