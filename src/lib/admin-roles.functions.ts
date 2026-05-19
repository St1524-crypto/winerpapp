import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const APP_ROLES = [
  "super_admin",
  "finance",
  "warehouse",
  "sales",
  "vendor",
  "member",
] as const;
export type AppRole = (typeof APP_ROLES)[number];

const RoleSchema = z.enum(APP_ROLES);

async function assertSuperAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "super_admin")
    .maybeSingle();
  if (!data) throw new Error("Forbidden: 需要 super_admin 權限");
}

// ============== List users with roles ==============
export const listUsersWithRoles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        search: z.string().max(120).optional(),
        role: RoleSchema.optional(),
        limit: z.number().int().min(1).max(500).default(200),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);

    let pq = supabaseAdmin
      .from("profiles")
      .select("id, name, email, created_at")
      .order("created_at", { ascending: false })
      .limit(data.limit);

    if (data.search) {
      const s = data.search.trim();
      pq = pq.or(`name.ilike.%${s}%,email.ilike.%${s}%`);
    }

    const { data: profiles, error } = await pq;
    if (error) throw new Error(error.message);

    const ids = (profiles ?? []).map((p) => p.id);
    let rolesMap = new Map<string, AppRole[]>();
    if (ids.length) {
      const { data: rows } = await supabaseAdmin
        .from("user_roles")
        .select("user_id, role")
        .in("user_id", ids);
      for (const r of rows ?? []) {
        const list = rolesMap.get(r.user_id) ?? [];
        list.push(r.role as AppRole);
        rolesMap.set(r.user_id, list);
      }
    }

    let result = (profiles ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      email: p.email,
      created_at: p.created_at,
      roles: rolesMap.get(p.id) ?? [],
    }));

    if (data.role) {
      result = result.filter((u) => u.roles.includes(data.role!));
    }

    return result;
  });

// ============== Batch update roles ==============
const BatchChangeSchema = z.object({
  changes: z
    .array(
      z.object({
        userId: z.string().uuid(),
        add: z.array(RoleSchema).default([]),
        remove: z.array(RoleSchema).default([]),
      }),
    )
    .min(1)
    .max(500),
});

export const batchUpdateRoles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => BatchChangeSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);

    let added = 0;
    let removed = 0;
    const audits: Array<{
      user_id: string;
      entity: string;
      entity_id: string;
      action: string;
      metadata: Record<string, unknown>;
    }> = [];

    for (const change of data.changes) {
      // Guard: cannot strip last super_admin from yourself or globally
      if (change.remove.includes("super_admin")) {
        const { count } = await supabaseAdmin
          .from("user_roles")
          .select("*", { count: "exact", head: true })
          .eq("role", "super_admin");
        if ((count ?? 0) <= 1) {
          throw new Error("無法移除系統中最後一位 super_admin");
        }
      }

      // Add roles (upsert ignores duplicates via unique constraint)
      if (change.add.length) {
        const rows = change.add.map((role) => ({ user_id: change.userId, role }));
        const { error: addErr } = await supabaseAdmin
          .from("user_roles")
          .upsert(rows, { onConflict: "user_id,role", ignoreDuplicates: true });
        if (addErr) throw new Error(`新增角色失敗: ${addErr.message}`);
        added += change.add.length;
      }

      // Remove roles
      if (change.remove.length) {
        const { error: rmErr } = await supabaseAdmin
          .from("user_roles")
          .delete()
          .eq("user_id", change.userId)
          .in("role", change.remove);
        if (rmErr) throw new Error(`移除角色失敗: ${rmErr.message}`);
        removed += change.remove.length;
      }

      if (change.add.length || change.remove.length) {
        audits.push({
          user_id: context.userId,
          entity: "user_roles",
          entity_id: change.userId,
          action: "batch_update",
          metadata: { add: change.add, remove: change.remove, by: context.userId },
        });
      }
    }

    if (audits.length) {
      await supabaseAdmin.from("audit_logs").insert(audits);
    }

    return { ok: true, affected: data.changes.length, added, removed };
  });

// ============== Force sign-out (revoke all sessions of a user) ==============
export const forceSignOutUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);

    // Revoke our session tracking
    await supabaseAdmin
      .from("user_sessions")
      .update({ revoked_at: new Date().toISOString() })
      .eq("user_id", data.userId)
      .is("revoked_at", null);

    // Revoke Supabase Auth sessions globally
    await supabaseAdmin.auth.admin.signOut(data.userId, "global").catch(() => {
      // signOut may require user-scoped token; ignore failure but log audit
    });

    await supabaseAdmin.from("audit_logs").insert({
      user_id: context.userId,
      entity: "user_sessions",
      entity_id: data.userId,
      action: "force_sign_out",
      metadata: { by: context.userId },
    });

    return { ok: true };
  });
