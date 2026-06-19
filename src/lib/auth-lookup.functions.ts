import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Resolve a login identifier (phone, member_no, or marketing_slug) into the auth email.
 * Optionally scope by companyId so a phone/member_no/marketing_slug only matches users
 * bound to that company — keeps company portals isolated.
 */
export const resolveLoginEmail = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        identifier: z.string().trim().min(3).max(64),
        companyId: z.string().uuid().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const id = data.identifier.trim();
    if (id.includes("@")) return { email: id };

    const phone = id.replace(/[\s-]/g, "");
    const upper = id.toUpperCase();
    const isMemberNo = /^M\d{6}$/i.test(id);
    const isMarketingSlug = /^[A-Za-z0-9_-]{3,32}$/.test(id);
    const isPhone = /^\+?\d{8,15}$/.test(phone);

    const withCompanyScope = (query: any) => {
      if (data.companyId) return query.eq("current_company_id", data.companyId);
      return query;
    };

    let row: { email: string | null } | null = null;

    if (isMemberNo) {
      const { data: byMemberNo } = await withCompanyScope(
        supabaseAdmin
          .from("profiles")
          .select("email, current_company_id")
          .eq("member_no", upper)
          .limit(1),
      ).maybeSingle();
      row = byMemberNo ?? null;
    }

    if (!row && isMarketingSlug) {
      const { data: byMarketingSlug } = await withCompanyScope(
        supabaseAdmin
          .from("profiles")
          .select("email, current_company_id")
          .ilike("marketing_slug", id)
          .limit(1),
      ).maybeSingle();
      row = byMarketingSlug ?? null;
    }

    if (!row && isPhone) {
      const { data: byPhone } = await withCompanyScope(
        supabaseAdmin
          .from("profiles")
          .select("email, current_company_id")
          .in("phone", [phone, `+${phone.replace(/^\+/, "")}`])
          .limit(1),
      ).maybeSingle();
      row = byPhone ?? null;
    }

    return { email: row?.email ?? null };
  });

/**
 * After password sign-in, verify the user belongs to the selected company.
 * Returns the user's current_company_id so the client can compare.
 */
export const getUserCompany = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { data: row } = await supabaseAdmin
      .from("profiles")
      .select("current_company_id")
      .eq("id", data.userId)
      .maybeSingle();
    return { companyId: row?.current_company_id ?? null };
  });

/**
 * Resolve a marketing referral phone (e.g. /r/0912345678) into the referrer's
 * company slug + referral code, so the visitor lands on the right signup page
 * with the referrer pre-filled.
 */
export const resolveReferrerByPhone = createServerFn({ method: "POST" })

  .inputValidator((d: unknown) =>
    z.object({ phone: z.string().trim().min(3).max(64) }).parse(d),
  )
  .handler(async ({ data }) => {
    const raw = data.phone.trim();
    const phone = raw.replace(/[\s-]/g, "");
    // 先嘗試以自訂行銷代稱 (marketing_slug) 比對；找不到再退回以電話比對
    let prof: any = null;
    if (/^[A-Za-z0-9_-]{3,32}$/.test(raw)) {
      const { data: bySlug } = await supabaseAdmin
        .from("profiles")
        .select("id, name, member_no, referral_code, current_company_id")
        .ilike("marketing_slug", raw)
        .limit(1)
        .maybeSingle();
      prof = bySlug ?? null;
    }
    if (!prof) {
      const { data: byPhone } = await supabaseAdmin
        .from("profiles")
        .select("id, name, member_no, referral_code, current_company_id")
        .in("phone", [phone, `+${phone.replace(/^\+/, "")}`])
        .limit(1)
        .maybeSingle();
      prof = byPhone ?? null;
    }
    if (!prof) return { found: false as const };

    let companySlug: string | null = null;
    let companyName: string | null = null;
    if (prof.current_company_id) {
      const { data: co } = await supabaseAdmin
        .from("companies")
        .select("slug, company_name")
        .eq("id", prof.current_company_id)
        .maybeSingle();
      companySlug = co?.slug ?? null;
      companyName = co?.company_name ?? null;
    }

    return {
      found: true as const,
      referrerName: prof.name,
      memberNo: prof.member_no,
      referralCode: prof.referral_code,
      companySlug,
      companyName,
    };
  });

