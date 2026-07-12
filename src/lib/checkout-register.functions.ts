import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { createHash, randomBytes, randomInt } from "crypto";
import { getRequestHeader } from "@tanstack/react-start/server";

function getClientIp(): string | null {
  return (
    getRequestHeader("cf-connecting-ip") ??
    getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim() ??
    getRequestHeader("x-real-ip") ??
    null
  );
}

function hashOtp(phone: string, email: string, code: string): string {
  return createHash("sha256")
    .update(`${phone}|${email.toLowerCase()}|${code}`)
    .digest("hex");
}

/**
 * Step 1 of guest signup: request an OTP be emailed to the user.
 *
 * Anti-abuse:
 * - Rate-limited server-side (per-IP and per-phone) by
 *   `check_guest_signup_rate_limit` — max 5/hour per IP, 3/hour per phone.
 * - OTP is stored hashed; only the 6-digit code is sent via email.
 * - Response never reveals whether the phone is already registered.
 */
export const requestGuestSignupOtp = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        phone: z.string().trim().min(8).max(20),
        email: z.string().trim().email().max(120),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const phone = data.phone.replace(/[\s-]/g, "");
    if (!/^\+?\d{8,15}$/.test(phone)) {
      return { ok: false as const, error: "phone_invalid" as const };
    }
    const email = data.email.trim().toLowerCase();
    const ip = getClientIp();

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Rate limit BEFORE any expensive work (email send / user lookup).
    const { error: rateErr } = await (supabaseAdmin as any).rpc(
      "check_guest_signup_rate_limit",
      { _ip: ip, _phone: phone },
    );
    if (rateErr) {
      const msg = String(rateErr.message);
      if (msg.includes("rate_limited_ip")) {
        return { ok: false as const, error: "rate_limited" as const };
      }
      if (msg.includes("rate_limited_phone")) {
        return { ok: false as const, error: "rate_limited" as const };
      }
      // Fail closed on unexpected error.
      return { ok: false as const, error: "send_failed" as const };
    }

    // Generate a 6-digit numeric OTP with 10-min expiry.
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const codeHash = hashOtp(phone, email, code);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { error: insErr } = await supabaseAdmin
      .from("guest_signup_otps")
      .insert({
        phone,
        email,
        code_hash: codeHash,
        ip,
        expires_at: expiresAt,
      });
    if (insErr) {
      return { ok: false as const, error: "send_failed" as const };
    }

    // Enqueue OTP email via existing transactional queue.
    try {
      const messageId = crypto.randomUUID();
      const subject = "【源晶商城】會員註冊驗證碼";
      const html = `<div style="font-family:sans-serif;line-height:1.6"><p>您的會員註冊驗證碼是：</p><p style="font-size:24px;font-weight:bold;letter-spacing:4px;color:#0f172a">${code}</p><p style="color:#64748b;font-size:13px">此驗證碼 10 分鐘內有效。若非本人操作請忽略本信。</p></div>`;
      const text = `您的會員註冊驗證碼是：${code}（10 分鐘內有效）`;
      await supabaseAdmin.from("email_send_log").insert({
        message_id: messageId,
        template_name: "guest-signup-otp",
        recipient_email: email,
        status: "pending",
      });
      await (supabaseAdmin as any).rpc("enqueue_email", {
        queue_name: "transactional_emails",
        payload: {
          message_id: messageId,
          to: email,
          from: "winerpapp <noreply@winerp.app>",
          sender_domain: "win889999.winerp.app",
          subject,
          html,
          text,
          purpose: "transactional",
          label: "guest-signup-otp",
          queued_at: new Date().toISOString(),
        },
      });
    } catch (e) {
      console.error("[guest-otp] email enqueue failed", e);
      return { ok: false as const, error: "send_failed" as const };
    }

    return { ok: true as const, expiresInMinutes: 10 };
  });

/**
 * Step 2: verify OTP and create the auth account.
 *
 * Guest checkout quick-register:
 * - REQUIRES a valid OTP from `requestGuestSignupOtp` (prevents automated
 *   account farming and free-points abuse).
 * - Creates auth user (email_confirm=true) with synthetic phone email
 *   `{phone}@phone.local` and cryptographically random password; the
 *   returned session tokens are what persist on the client.
 * - Grants the configured signup discount points (default 1000) only after
 *   OTP verification succeeds.
 */
export const quickRegisterAndSignIn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        name: z.string().trim().min(1, "姓名不可空白").max(60),
        email: z.string().trim().email("Email 格式錯誤").max(120),
        phone: z.string().trim().min(8, "手機格式錯誤").max(20),
        address: z.string().trim().min(1, "地址不可空白").max(200),
        otp: z.string().trim().regex(/^\d{6}$/, "驗證碼格式錯誤"),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const phone = data.phone.replace(/[\s-]/g, "");
    if (!/^\+?\d{8,15}$/.test(phone)) {
      return { ok: false as const, error: "phone_invalid" as const };
    }
    const email = data.email.trim().toLowerCase();

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Verify OTP FIRST — no side effects (auth user / points) unless valid.
    const codeHash = hashOtp(phone, email, data.otp);
    const { data: verified, error: verifyErr } = await (supabaseAdmin as any).rpc(
      "verify_guest_signup_otp",
      { _phone: phone, _email: email, _code_hash: codeHash },
    );
    if (verifyErr || !verified) {
      return { ok: false as const, error: "otp_invalid" as const };
    }

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

    await supabaseAdmin
      .from("profiles")
      .update({ name: data.name, phone, email })
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
