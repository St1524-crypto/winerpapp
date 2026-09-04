import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Resolve a login identifier (phone, member_no, marketing_slug, or email) and
 * perform the password sign-in entirely server-side. Returns only the session
 * tokens — never the resolved email — so anonymous callers cannot enumerate
 * registered users by phone / member_no / marketing_slug.
 */
export const signInWithIdentifier = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        identifier: z.string().trim().min(3).max(64),
        password: z.string().min(1).max(200),
        companyId: z.string().uuid().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const id = data.identifier.trim();
    let email: string | null = null;

    if (id.includes("@")) {
      email = id;
    } else {
      const phone = id.replace(/[\s-]/g, "");
      const upper = id.toUpperCase();
      const isMarketingSlug = /^[A-Za-z0-9_-]{3,32}$/.test(id);
      const isPhone = /^\+?\d{8,15}$/.test(phone);

      const withCompanyScope = (query: any) => {
        if (data.companyId) return query.eq("current_company_id", data.companyId);
        return query;
      };

      let row: { email: string | null } | null = null;

      // Member numbers are not limited to the legacy M123456 shape (for
      // example TW17H00032), so always try an exact member-number lookup.
      {
        const { data: byMemberNo } = await withCompanyScope(
          supabaseAdmin.from("profiles").select("email, current_company_id").eq("member_no", upper).limit(1),
        ).maybeSingle();
        row = byMemberNo ?? null;
      }
      if (!row && isMarketingSlug) {
        const { data: byMarketingSlug } = await withCompanyScope(
          supabaseAdmin.from("profiles").select("email, current_company_id").ilike("marketing_slug", id).limit(1),
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
      email = row?.email ?? null;

      // A company-scoped miss may simply mean the visitor used the wrong
      // portal. Resolve globally only when the identifier is unambiguous;
      // the password is still verified below before any company is revealed.
      if (!email && data.companyId) {
        let globalRows: Array<{ email: string | null }> = [];
        const { data: byMemberNo } = await supabaseAdmin
          .from("profiles")
          .select("email")
          .eq("member_no", upper)
          .limit(2);
        globalRows = byMemberNo ?? [];

        if (globalRows.length === 0 && isMarketingSlug) {
          const { data: bySlug } = await supabaseAdmin
            .from("profiles")
            .select("email")
            .ilike("marketing_slug", id)
            .limit(2);
          globalRows = bySlug ?? [];
        }
        if (globalRows.length === 0 && isPhone) {
          const { data: byPhone } = await supabaseAdmin
            .from("profiles")
            .select("email")
            .in("phone", [phone, `+${phone.replace(/^\+/, "")}`])
            .limit(2);
          globalRows = byPhone ?? [];
        }
        if (globalRows.length === 1) email = globalRows[0]?.email ?? null;
      }
    }

    if (!email) {
      return { ok: false as const, error: "invalid_credentials" };
    }

    const pub = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false, storage: undefined } },
    );
    const { data: signIn, error } = await pub.auth.signInWithPassword({
      email,
      password: data.password,
    });
    if (error || !signIn.session || !signIn.user) {
      return { ok: false as const, error: "invalid_credentials" };
    }

    if (data.companyId) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("current_company_id")
        .eq("id", signIn.user.id)
        .maybeSingle();
      if (profile?.current_company_id && profile.current_company_id !== data.companyId) {
        const { data: company } = await supabaseAdmin
          .from("companies")
          .select("slug, company_name")
          .eq("id", profile.current_company_id)
          .maybeSingle();
        return {
          ok: false as const,
          error: "company_mismatch" as const,
          company: company?.slug
            ? { slug: company.slug, name: company.company_name }
            : null,
        };
      }
    }

    return {
      ok: true as const,
      session: {
        access_token: signIn.session.access_token,
        refresh_token: signIn.session.refresh_token,
        expires_at: signIn.session.expires_at ?? null,
      },
      userId: signIn.user.id,
      appMetadata: JSON.parse(JSON.stringify(signIn.user.app_metadata ?? {})) as Record<string, any>,
    };
  });

/**
 * After password sign-in, verify the user belongs to the selected company.
 * Returns the user's current_company_id so the client can compare.
 */
export const getUserCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    if (data.userId !== context.userId) {
      throw new Error("Forbidden");
    }
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

