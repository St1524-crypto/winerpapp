import { supabaseAdmin } from "@/integrations/supabase/client.server";

type MonthlySettlementSource = "admin" | "cron";

type MonthlySettlementInput = {
  yyyymm?: string;
  createdBy?: string | null;
  source?: MonthlySettlementSource;
};

export async function settleMonthlyBonus({
  yyyymm,
  createdBy = null,
  source = "admin",
}: MonthlySettlementInput = {}) {
  const { data, error } = await (supabaseAdmin as any).rpc("settle_monthly_bonus", {
    _yyyymm: yyyymm ?? null,
    _created_by: createdBy,
    _source: source,
  });
  if (error) throw new Error(error.message);
  return data;
}
