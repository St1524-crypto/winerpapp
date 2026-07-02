import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "crypto";

/**
 * Guest checkout quick-register:
 * - Verifies phone is not already a member.
 * - Creates auth user (email_confirm=true) with synthetic phone email
 *   `{phone}@phone.local` and default password `st{phone}`.
 * - Trigger `handle_new_user` creates the profile + member_no.
 * - Updates profile (real email/phone/name) and inserts the default
 *   shipping address.
 * - Returns session tokens so the client can call supabase.auth.setSession.
 *
 * Never returns secrets. Service role key stays server-side.
 */
export const quickRegisterAndSignIn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        name: z.string().trim().min(1, "姓名不可空白").max(60),
        email: z.string().trim().email("Email 格式錯誤").max(120),
        phone: z.string().trim().min(8, "手機格式錯誤").max(20),
        address: z.string().trim().min(1, "地址不可空白").max(200),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const phone = data.phone.replace(/[\s-]/g, "");
    if (!/^\+?\d{8,15}$/.test(phone)) {
      return { ok: false as const, error: "phone_invalid" as const };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Phone already registered?
    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .in("phone", [phone, `+${phone.replace(/^\+/, "")}`])
      .limit(1)
      .maybeSingle();
    if (existing) {
      return { ok: false as const, error: "phone_exists" as const };
    }

    const syntheticEmail = `${phone.replace(/^\+/, "")}@phone.local`;
    // Cryptographically random transient password; session tokens are what persist on the client.
    const password = randomBytes(24).toString("base64url");

    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: syntheticEmail,
      password,
      email_confirm: true,
      user_metadata: { name: data.name, phone },
    });
    if (createErr || !created?.user) {
      return { ok: false as const, error: "create_failed" as const };
    }
    const userId = created.user.id;

    // Trigger handle_new_user already inserted profile row.
    // Patch the real email + ensure name/phone are populated.
    await supabaseAdmin
      .from("profiles")
      .update({ name: data.name, phone, email: data.email })
      .eq("id", userId);

    await supabaseAdmin.from("customer_addresses").insert({
      user_id: userId,
      receiver_name: data.name,
      phone,
      address: data.address,
      is_default: true,
    });

    // 首次註冊贈送折扣點（管理員可於後台調整；預設 1000）
    try {
      const { data: setting } = await supabaseAdmin
        .from("system_settings")
        .select("value")
        .eq("key", "guest_signup_discount_points")
        .maybeSingle();
      const raw = (setting as any)?.value;
      const bonus = Math.max(
        0,
        Math.floor(Number(typeof raw === "number" ? raw : raw ?? 1000)) || 0,
      );
      if (bonus > 0) {
        await supabaseAdmin
          .from("member_points_wallet")
          .upsert(
            { user_id: userId, discount_points: bonus },
            { onConflict: "user_id" },
          );
        await supabaseAdmin.from("point_transactions").insert({
          user_id: userId,
          point_type: "discount",
          amount: bonus,
          balance_after: bonus,
          source: "signup_bonus",
          note: `新會員註冊贈送 ${bonus} 折扣點`,
        });
      }
    } catch (e) {
      console.error("[signup bonus] failed", e);
    }

    // Sign in via publishable client to obtain session tokens.
    const pub = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false, storage: undefined } },
    );
    const { data: signIn, error: signErr } = await pub.auth.signInWithPassword({
      email: syntheticEmail,
      password,
    });
    if (signErr || !signIn.session) {
      return { ok: false as const, error: "create_failed" as const };
    }

    return {
      ok: true as const,
      userId,
      session: {
        access_token: signIn.session.access_token,
        refresh_token: signIn.session.refresh_token,
        expires_at: signIn.session.expires_at ?? null,
      },
    };
  });
