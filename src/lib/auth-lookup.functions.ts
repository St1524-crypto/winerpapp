import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Resolve a login identifier (phone or member_no) into the auth email
 * so the user can sign in with email+password.
 * Returns null when not found (don't leak which identifier exists).
 */
export const resolveLoginEmail = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ identifier: z.string().trim().min(3).max(64) }).parse(d),
  )
  .handler(async ({ data }) => {
    const id = data.identifier.trim();
    // If already an email, return as-is
    if (id.includes("@")) return { email: id };

    // Normalise phone: strip spaces/dashes
    const phone = id.replace(/[\s-]/g, "");
    const isMemberNo = /^M\d{6}$/i.test(id);

    let query = supabaseAdmin.from("profiles").select("email, phone, member_no").limit(1);
    if (isMemberNo) {
      query = query.eq("member_no", id.toUpperCase());
    } else {
      // Match phone with or without leading +
      query = query.in("phone", [phone, `+${phone.replace(/^\+/, "")}`]);
    }
    const { data: row } = await query.maybeSingle();
    return { email: row?.email ?? null };
  });
