import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { memberBelongsToCompany } from "./member-company";

export const listCompanyMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ companyId: z.string().uuid(), search: z.string().max(255).default(""), page: z.number().int().min(1).default(1), pageSize: z.number().int().min(1).max(50).default(15) }).parse(input))
  .handler(async ({ data, context }) => {
    const { requireMemberCompany } = await import("./member-company.server");
    const companyId = await requireMemberCompany(context.supabase, undefined, data.companyId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const memberships = new Map<string, string[]>();
    for (let offset = 0; ; offset += 1000) {
      const result = await supabaseAdmin.from("company_members").select("id,user_id,company_id").order("id").range(offset, offset + 999);
      if (result.error) throw new Error("無法載入公司會員");
      for (const row of result.data ?? []) memberships.set(row.user_id, [...(memberships.get(row.user_id) ?? []), row.company_id]);
      if ((result.data?.length ?? 0) < 1000) break;
    }
    const rows = [];
    for (let offset = 0; ; offset += 1000) {
      const result = await supabaseAdmin.from("profiles").select("id,name,email,phone,member_no,avatar_url,created_at,is_dealer,referred_by,marketing_slug,legacy_rank,id_no,apply_date,sex,addr_mail,addr_home,birthday,vip_expires_at,is_vip,legacy_bonus_total,current_company_id").order("created_at", { ascending: false }).order("id").range(offset, offset + 999);
      if (result.error) throw new Error("無法載入會員");
      rows.push(...(result.data ?? []).filter((p) => memberBelongsToCompany(companyId, p.current_company_id, memberships.get(p.id) ?? [])));
      if ((result.data?.length ?? 0) < 1000) break;
    }
    const search = data.search.trim().toLocaleLowerCase();
    const matched = rows.filter((p) => !search || [p.name, p.email, p.phone, p.member_no, p.id_no].some((v) => v?.toLocaleLowerCase().includes(search)));
    const stats = { total: rows.length, id_no: 0, apply_date: 0, sex: 0, addr_mail: 0, addr_home: 0, birthday: 0 };
    for (const field of ["id_no", "apply_date", "sex", "addr_mail", "addr_home", "birthday"] as const) stats[field] = rows.filter((p) => p[field] != null).length;
    return { profiles: matched.slice((data.page - 1) * data.pageSize, data.page * data.pageSize), count: matched.length, stats };
  });