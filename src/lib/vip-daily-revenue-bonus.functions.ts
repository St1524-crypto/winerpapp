import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function ensureFinance(ctx: any) {
  const { data: isAdmin } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "super_admin",
  });
  if (isAdmin) return;
  const { data: isFin } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "finance",
  });
  if (!isFin) throw new Error("Forbidden");
}

export const runDailyRevenueBonus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { date?: string | null }) => d ?? {})
  .handler(async ({ data, context }) => {
    await ensureFinance(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await (supabaseAdmin as any).rpc(
      "distribute_daily_revenue_bonus",
      { _date: data.date ?? null },
    );
    if (error) throw new Error(error.message);
    return Array.isArray(rows) ? rows[0] : rows;
  });

export const listDailyRevenueBonusLedger = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureFinance(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as any)
      .from("vip_daily_revenue_bonus_ledger")
      .select("*")
      .order("distribution_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return data ?? [];
  });
