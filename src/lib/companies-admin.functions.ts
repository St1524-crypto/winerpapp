import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { canCreateCompany } from "@/lib/company-creator";

const InputSchema = z.object({
  company_name: z.string().trim().min(1).max(200),
  tax_id: z.string().trim().max(20).optional().nullable(),
  email: z.string().trim().email().max(200).optional().nullable().or(z.literal("")),
  phone: z.string().trim().max(50).optional().nullable(),
  address: z.string().trim().max(500).optional().nullable(),
  logo_url: z.string().trim().max(1000).optional().nullable(),
});

/**
 * Server-authoritative company creation. The email allow-list check is enforced
 * here (not only in the client UI); the RLS INSERT policy on public.companies
 * also requires the caller to be the authorized company-creator, so any admin
 * that tries to insert directly through the client will be blocked.
 */
export const createCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => InputSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Verify caller role (super_admin) and email against allow-list
    const { data: authUser, error: userErr } =
      await supabaseAdmin.auth.admin.getUserById(context.userId);
    if (userErr || !authUser?.user) throw new Error("無法驗證使用者");
    const email = authUser.user.email ?? null;

    const { data: rolesRow } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const roles = (rolesRow ?? []).map((r) => r.role as string);
    if (!roles.includes("super_admin")) {
      throw new Error("Forbidden: 需要 super_admin 權限");
    }
    if (!canCreateCompany(email)) {
      throw new Error("Forbidden: 此帳號無權新增公司");
    }

    const { data: inserted, error } = await supabaseAdmin
      .from("companies")
      .insert({
        company_name: data.company_name,
        tax_id: data.tax_id || null,
        email: data.email || null,
        phone: data.phone || null,
        address: data.address || null,
        logo_url: data.logo_url || null,
        status: "active",
      })
      .select()
      .single();
    if (error) throw new Error(`公司建立失敗：${error.message}`);

    const { error: memErr } = await supabaseAdmin
      .from("company_members")
      .insert({ company_id: inserted.id, user_id: context.userId, role: "admin" });
    if (memErr && !memErr.message.toLowerCase().includes("duplicate")) {
      throw new Error(`成員加入失敗：${memErr.message}`);
    }

    return inserted;
  });
