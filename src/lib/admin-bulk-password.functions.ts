import { createServerFn } from "@tanstack/react-start";
import { randomBytes } from "node:crypto";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Bulk reset member passwords to cryptographically random temporary values.
 * Scope: only users with role='member' AND profiles.marketing_slug NOT NULL.
 * Requires super_admin caller.
 *
 * SECURITY: Previous implementation derived passwords from the public
 * `marketing_slug` (e.g. `st<slug>`). Because slugs appear in public storefront
 * URLs, any visitor could compute the reset password. We now generate a
 * unique random password per user. The plaintext passwords are returned in the
 * response so the admin can deliver them via a secure out-of-band channel
 * (email/SMS), and are NEVER persisted or logged.
 */
function generateTempPassword(): string {
  // 18 bytes => 24 url-safe chars; high entropy, no ambiguous chars policy needed.
  return randomBytes(18).toString("base64url");
}

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

    const { data: roleRows, error: rolesErr } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "member");
    if (rolesErr) throw new Error(rolesErr.message);

    const memberIds = (roleRows ?? []).map((r: any) => r.user_id);
    if (memberIds.length === 0) {
      return { ok: true, total: 0, updated: 0, skipped: 0, failed: 0, errors: [], credentials: [] };
    }

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
    const credentials: Array<{ id: string; slug: string; temp_password: string }> = [];

    const concurrency = 5;
    let cursor = 0;
    async function worker() {
      while (cursor < targets.length) {
        const i = cursor++;
        const t = targets[i];
        const password = generateTempPassword();
        const { error } = await supabaseAdmin.auth.admin.updateUserById(t.id, { password });
        if (error) {
          failed++;
          if (errors.length < 50) errors.push({ id: t.id, message: error.message });
        } else {
          updated++;
          credentials.push({ id: t.id, slug: t.slug, temp_password: password });
        }
      }
    }
    await Promise.all(Array.from({ length: concurrency }, () => worker()));

    // Audit log — never store plaintext passwords.
    await supabaseAdmin.from("audit_logs").insert({
      user_id: context.userId,
      entity: "auth.users.password",
      entity_id: context.userId,
      action: "bulk_reset_member_passwords",
      metadata: {
        scope: "role=member AND marketing_slug NOT NULL",
        formula: "crypto.randomBytes(18).base64url (unique per user)",
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
      // Plaintext returned ONCE to the calling super_admin for secure delivery.
      // Caller must transmit out-of-band and not persist.
      credentials,
    };
  });
