import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertDividendEditor, dividendExclusionSchema } from "./dividend-exclusion";

export const getMemberDividendExclusion = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ userId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase.from("member_dividend_exclusions")
      .select("reason").eq("user_id", data.userId).maybeSingle();
    if (error) throw new Error(error.message);
    return { excluded: !!row, reason: row?.reason ?? "" };
  });

export const setMemberDividendExclusion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => dividendExclusionSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: roles, error: roleError } = await context.supabase.from("user_roles")
      .select("role").eq("user_id", context.userId);
    if (roleError) throw new Error(roleError.message);
    assertDividendEditor((roles ?? []).map((r) => r.role));
    const { error } = await context.supabase.rpc("set_member_dividend_exclusion", {
      _user_id: data.userId, _excluded: data.excluded, _reason: data.reason,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });