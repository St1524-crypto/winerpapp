import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Resolve a login identifier (phone or member_no) into the auth email.
 * Optionally scope by companyId so a phone/member_no only matches users
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
    const isMemberNo = /^M\d{6}$/i.test(id);

    let query = supabaseAdmin
      .from("profiles")
      .select("email, phone, member_no, current_company_id")
      .limit(1);
    if (isMemberNo) {
      query = query.eq("member_no", id.toUpperCase());
    } else {
      query = query.in("phone", [phone, `+${phone.replace(/^\+/, "")}`]);
    }
    if (data.companyId) {
      query = query.eq("current_company_id", data.companyId);
    }
    const { data: row } = await query.maybeSingle();
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
    z.object({ phone: z.string().trim().min(6).max(32) }).parse(d),
  )
  .handler(async ({ data }) => {
    const phone = data.phone.replace(/[\s-]/g, "");
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("id, name, member_no, referral_code, current_company_id")
      .in("phone", [phone, `+${phone.replace(/^\+/, "")}`])
      .limit(1)
      .maybeSingle();
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

