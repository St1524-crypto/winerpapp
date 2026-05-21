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
