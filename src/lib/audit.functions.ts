import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  const roles = (data ?? []).map((r) => r.role);
  if (!roles.includes("super_admin") && !roles.includes("finance")) {
    throw new Error("Forbidden: 需要 super_admin 或 finance 權限");
  }
}

export const listAuditLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        entity: z.string().max(80).optional(),
        action: z.string().max(80).optional(),
        userId: z.string().uuid().optional(),
        from: z.string().optional(),
        to: z.string().optional(),
        limit: z.number().int().min(1).max(500).default(100),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    let q = supabaseAdmin
      .from("audit_logs")
      .select("id, user_id, entity, entity_id, action, metadata, created_at")
      .order("created_at", { ascending: false })
      .limit(data.limit);

    if (data.entity) q = q.eq("entity", data.entity);
    if (data.action) q = q.eq("action", data.action);
    if (data.userId) q = q.eq("user_id", data.userId);
    if (data.from) q = q.gte("created_at", data.from);
    if (data.to) q = q.lte("created_at", data.to);

    const { data: logs, error } = await q;
    if (error) throw new Error(error.message);

    // Enrich with profiles (name/email)
    const ids = Array.from(
      new Set((logs ?? []).map((l) => l.user_id).filter((x): x is string => !!x)),
    );
    let userMap = new Map<string, { name: string | null; email: string | null }>();
    if (ids.length) {
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("id, name, email")
        .in("id", ids);
      userMap = new Map((profs ?? []).map((p) => [p.id, { name: p.name, email: p.email }]));
    }

    return (logs ?? []).map((l) => ({
      ...l,
      user: l.user_id ? userMap.get(l.user_id) ?? null : null,
    }));
  });

export const getAuditFacets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data } = await supabaseAdmin
      .from("audit_logs")
      .select("entity, action")
      .order("created_at", { ascending: false })
      .limit(1000);
    const entities = Array.from(new Set((data ?? []).map((r) => r.entity))).sort();
    const actions = Array.from(new Set((data ?? []).map((r) => r.action))).sort();
    return { entities, actions };
  });

// Allow-list of client-writable audit actions. All other audit actions must be
// written from server code via supabaseAdmin (service role) directly.
const CLIENT_AUDIT_ACTIONS = [
  "company.switch",
  "blocked_inactive_company",
  "company.activate",
  "company.deactivate",
  "company.update",
  "company.update_field",
  "company.create",
  "company.delete",
] as const;

export const writeClientAuditLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        action: z.enum(CLIENT_AUDIT_ACTIONS),
        entity: z.string().min(1).max(80),
        entity_id: z.string().uuid().optional().nullable(),
        metadata: z.record(z.string(), z.any()).optional().default({}),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await supabaseAdmin.from("audit_logs").insert({
      user_id: context.userId,
      action: data.action,
      entity: data.entity,
      entity_id: data.entity_id ?? null,
      metadata: data.metadata ?? {},
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Log an "edit order → reward points change" event to audit_logs.
 * Called by the admin EditOrderDialog after save so the before/after
 * snapshot of `本次發放獎勵點` is queryable in the audit log viewer.
 *
 * Entity/action are fixed so operators can filter by:
 *   entity = "sales_order"
 *   action = "order.reward_points_change"
 */
const rewardNoticeSchema = z
  .object({
    kind: z.enum(["earn", "referrer", "none"]),
    points: z.number().int().nonnegative().optional().nullable(),
    note: z.string().max(500).optional().nullable(),
  })
  .nullable();

export const logOrderRewardPointsAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        orderId: z.string().uuid(),
        orderNo: z.string().max(80).optional().nullable(),
        before: rewardNoticeSchema,
        after: rewardNoticeSchema,
        changedFields: z.array(z.string().max(80)).optional().default([]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    // Only staff who can edit orders should be allowed to write this log.
    // Reuse admin/finance gate for parity with other audit tools; the row
    // is also written with supabaseAdmin so it survives RLS.
    await assertAdmin(context.userId);

    const beforeKind = data.before?.kind ?? "none";
    const afterKind = data.after?.kind ?? "none";
    const beforePts = data.before?.points ?? 0;
    const afterPts = data.after?.points ?? 0;
    const changed =
      beforeKind !== afterKind ||
      beforePts !== afterPts ||
      (data.before?.note ?? null) !== (data.after?.note ?? null);

    const { error } = await supabaseAdmin.from("audit_logs").insert({
      user_id: context.userId,
      action: "order.reward_points_change",
      entity: "sales_order",
      entity_id: data.orderId,
      metadata: {
        order_no: data.orderNo ?? null,
        before: data.before,
        after: data.after,
        changed,
        changed_fields: data.changedFields ?? [],
      },
    });
    if (error) throw new Error(error.message);
    return { ok: true, changed };
  });


