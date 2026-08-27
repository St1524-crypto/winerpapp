import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** 可由超級管理員編輯的「升級條件」欄位 */
export const UPGRADE_RULE_FIELDS = [
  "required_reward_points",
  "required_direct_vip",
  "required_mentor_tier",
  "required_mentor_count",
  "renewal_window_days",
  "renewal_required_new_vip",
] as const;

export type UpgradeRuleField = (typeof UPGRADE_RULE_FIELDS)[number];

export const UPGRADE_RULE_LABELS: Record<UpgradeRuleField, string> = {
  required_reward_points: "累積升級獎勵點門檻",
  required_direct_vip: "直推 VIP 人數",
  required_mentor_tier: "輔導下線階級",
  required_mentor_count: "輔導下線人數",
  renewal_window_days: "續領週期（天）",
  renewal_required_new_vip: "續領需新增 VIP 人數",
};

async function ensureSuperAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r: any) => r.role);
  if (!roles.includes("super_admin")) {
    throw new Error("只有超級管理員可以修改制度升級條件");
  }
}

async function ensureAdminReader(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r: any) => r.role);
  if (!roles.some((r: string) => ["super_admin", "admin", "finance"].includes(r))) {
    throw new Error("沒有權限");
  }
  return roles as string[];
}

/** 只讀：列出所有階級的升級條件（含目前值） */
export const listVipUpgradeRules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const roles = await ensureAdminReader((context as any).supabase, (context as any).userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("vip_tiers")
      .select(
        "id, code, name, sort_order, status, required_reward_points, required_direct_vip, required_mentor_tier, required_mentor_count, renewal_window_days, renewal_required_new_vip",
      )
      .order("sort_order");
    if (error) throw error;
    return { rows: data ?? [], canEdit: roles.includes("super_admin") };
  });

const changeSchema = z.object({
  id: z.string().uuid(),
  code: z.string().min(1),
  required_reward_points: z.number().int().min(0),
  required_direct_vip: z.number().int().min(0),
  required_mentor_tier: z.string().nullable(),
  required_mentor_count: z.number().int().min(0),
  renewal_window_days: z.number().int().min(0),
  renewal_required_new_vip: z.number().int().min(0),
});

/**
 * 只讀：比對送出值與資料庫現值，回傳「現值 → 目標值」差異對照表。
 * 不做任何寫入，供確認流程使用。
 */
export const previewVipUpgradeRuleChanges = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { rows: unknown[] }) => z.object({ rows: z.array(changeSchema) }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdminReader((context as any).supabase, (context as any).userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ids = data.rows.map((r) => r.id);
    const { data: current, error } = await supabaseAdmin
      .from("vip_tiers")
      .select(
        "id, code, name, required_reward_points, required_direct_vip, required_mentor_tier, required_mentor_count, renewal_window_days, renewal_required_new_vip",
      )
      .in("id", ids);
    if (error) throw error;
    const map = new Map((current ?? []).map((r: any) => [r.id, r]));

    const diffs: {
      id: string;
      code: string;
      name: string;
      field: UpgradeRuleField;
      label: string;
      from: string | number | null;
      to: string | number | null;
    }[] = [];

    for (const row of data.rows) {
      const cur: any = map.get(row.id);
      if (!cur) continue;
      for (const field of UPGRADE_RULE_FIELDS) {
        const from = cur[field] ?? (field === "required_mentor_tier" ? null : 0);
        const to = (row as any)[field] ?? (field === "required_mentor_tier" ? null : 0);
        const same =
          field === "required_mentor_tier"
            ? String(from ?? "") === String(to ?? "")
            : Number(from) === Number(to);
        if (!same) {
          diffs.push({
            id: row.id,
            code: cur.code,
            name: cur.name,
            field,
            label: UPGRADE_RULE_LABELS[field],
            from,
            to,
          });
        }
      }
    }
    return { diffs, count: diffs.length };
  });

/** 超級管理員：套用升級條件變更（需先經確認流程） */
export const applyVipUpgradeRuleChanges = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { rows: unknown[]; confirmed: boolean }) =>
    z.object({ rows: z.array(changeSchema), confirmed: z.literal(true) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabase = (context as any).supabase;
    const userId = (context as any).userId as string;
    await ensureSuperAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let updated = 0;
    for (const row of data.rows) {
      const { error } = await supabaseAdmin
        .from("vip_tiers")
        .update({
          required_reward_points: row.required_reward_points,
          required_direct_vip: row.required_direct_vip,
          required_mentor_tier: row.required_mentor_tier || null,
          required_mentor_count: row.required_mentor_count,
          renewal_window_days: row.renewal_window_days,
          renewal_required_new_vip: row.renewal_required_new_vip,
        })
        .eq("id", row.id);
      if (error) throw error;
      updated += 1;
    }
    return { updated };
  });
