import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Bulk reset member passwords to `st` + marketing_slug.
 * Scope: only users with role='member' AND profiles.marketing_slug NOT NULL.
 * Requires super_admin caller.
 */
export const bulkResetMemberPasswords = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Authorize: super_admin only
    const { data: isSuper, error: roleErr } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "super_admin" as any,
    });
    if (roleErr) throw new Error(roleErr.message);
    if (!isSuper) throw new Error("Forbidden: super_admin required");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Target: role=member with marketing_slug
    const { data: roleRows, error: rolesErr } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "member");
    if (rolesErr) throw new Error(rolesErr.message);

    const memberIds = (roleRows ?? []).map((r: any) => r.user_id);
    if (memberIds.length === 0) {
      return { ok: true, total: 0, updated: 0, skipped: 0, failed: 0, errors: [] };
    }

    // Fetch slugs in chunks
    const targets: { id: string; slug: string }[] = [];
    const chunk = 500;
    for (let i = 0; i < memberIds.length; i += chunk) {
      const ids = memberIds.slice(i, i + chunk);
      const { data, error } = await supabaseAdmin
        .from("profiles")
        .select("id, marketing_slug")
        .in("id", ids)
        .not("marketing_slug", "is", null);
      if (error) throw new Error(error.message);
      for (const row of data ?? []) {
        const slug = (row as any).marketing_slug?.trim?.();
        if (slug) targets.push({ id: (row as any).id, slug });
      }
    }

    let updated = 0;
    let failed = 0;
    const errors: Array<{ id: string; message: string }> = [];

    // Sequential w/ small concurrency to avoid auth-admin rate limits
    const concurrency = 5;
    let cursor = 0;
    async function worker() {
      while (cursor < targets.length) {
        const i = cursor++;
        const t = targets[i];
        const password = `st${t.slug}`;
        const { error } = await supabaseAdmin.auth.admin.updateUserById(t.id, { password });
        if (error) {
          failed++;
          if (errors.length < 50) errors.push({ id: t.id, message: error.message });
        } else {
          updated++;
        }
      }
    }
    await Promise.all(Array.from({ length: concurrency }, () => worker()));

    // Audit
    await supabaseAdmin.from("audit_logs").insert({
      user_id: context.userId,
      entity: "auth.users.password",
      entity_id: context.userId,
      action: "bulk_reset_member_passwords",
      metadata: {
        scope: "role=member AND marketing_slug NOT NULL",
        formula: "st + marketing_slug",
        total_targets: targets.length,
        updated,
        failed,
        at: new Date().toISOString(),
      },
    } as any);

    return {
      ok: true,
      total: targets.length,
      updated,
      skipped: memberIds.length - targets.length,
      failed,
      errors,
    };
  });
