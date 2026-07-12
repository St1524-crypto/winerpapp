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

