import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { assertMemberCompany } from "./member-company";

export async function requireMemberCompany(db: SupabaseClient<Database>, userId?: string, expectedCompanyId?: string) {
  const { data: roles, error: roleError } = await db.from("user_roles").select("role");
  if (roleError) throw new Error(roleError.message);
  // Caller roles are scoped by the authenticated identity, never a browser flag.
  const { data: viewer, error: viewerError } = await db.auth.getUser();
  if (viewerError || !viewer.user) throw new Error("Unauthorized");
  if (!(roles ?? []).some((r) => ["admin", "super_admin"].includes(r.role))) throw new Error("需要管理員權限");
  const { data: ownRoles, error: ownRoleError } = await db.from("user_roles").select("role").eq("user_id", viewer.user.id);
  if (ownRoleError || !(ownRoles ?? []).some((r) => ["admin", "super_admin"].includes(r.role))) throw new Error("需要管理員權限");
  const { data: companyId, error } = await db.rpc("current_company_id");
  if (error || !companyId) throw new Error("請先選擇公司");
  if (expectedCompanyId && expectedCompanyId !== companyId) throw new Error("公司已切換，請重新開啟會員資料");
  if (userId) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [profile, memberships] = await Promise.all([
      supabaseAdmin.from("profiles").select("current_company_id").eq("id", userId).maybeSingle(),
      supabaseAdmin.from("company_members").select("company_id").eq("user_id", userId),
    ]);
    if (profile.error || memberships.error) throw new Error("無法確認會員公司");
    assertMemberCompany(companyId, profile.data?.current_company_id ?? null, (memberships.data ?? []).map((m) => m.company_id));
  }
  return companyId;
}