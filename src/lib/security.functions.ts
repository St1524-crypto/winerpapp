import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";
import { z } from "zod";
import * as OTPAuth from "otpauth";
import { createHash, randomBytes } from "crypto";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const ISSUER = "源晶 ERP";

function newSecret(): string {
  // 20 bytes => 160-bit, encoded as base32 (32 chars)
  return new OTPAuth.Secret({ size: 20 }).base32;
}

function totp(secret: string, label: string) {
  return new OTPAuth.TOTP({
    issuer: ISSUER,
    label,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
}

function sha256(input: string) {
  return createHash("sha256").update(input).digest("hex");
}

function generateBackupCodes(count = 10): { plain: string[]; hashed: string[] } {
  const plain: string[] = [];
  const hashed: string[] = [];
  for (let i = 0; i < count; i++) {
    const raw = randomBytes(5).toString("hex").toUpperCase(); // 10-char code
    const formatted = `${raw.slice(0, 5)}-${raw.slice(5)}`;
    plain.push(formatted);
    hashed.push(sha256(formatted));
  }
  return { plain, hashed };
}

function extractRequestMeta() {
  const ip =
    getRequestHeader("cf-connecting-ip") ??
    getRequestHeader("x-forwarded-for")?.split(",")[0]?.trim() ??
    getRequestIP({ xForwardedFor: true }) ??
    null;
  const userAgent = getRequestHeader("user-agent") ?? null;
  return { ip, userAgent };
}

// =========================================================
// 2FA — Enrollment & status
// =========================================================
export const getTwoFactorStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await supabaseAdmin
      .from("user_2fa")
      .select("enabled, enrolled_at, last_used_at, backup_codes")
      .eq("user_id", context.userId)
      .maybeSingle();
    return {
      enabled: !!data?.enabled,
      enrolledAt: data?.enrolled_at ?? null,
      lastUsedAt: data?.last_used_at ?? null,
      backupCodesRemaining: data?.backup_codes?.length ?? 0,
    };
  });

export const beginTwoFactorEnrollment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const email = (context.claims.email as string) ?? "user";
    const secret = newSecret();
    const otpauthUrl = totp(secret, email).toString();

    // Store pending secret with enabled=false; overwrite any previous pending row
    await supabaseAdmin
      .from("user_2fa")
      .upsert(
        { user_id: context.userId, secret, enabled: false, backup_codes: [] },
        { onConflict: "user_id" },
      );

    return { secret, otpauthUrl, email };
  });

export const confirmTwoFactorEnrollment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ code: z.string().regex(/^\d{6}$/) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row } = await supabaseAdmin
      .from("user_2fa")
      .select("secret, enabled")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!row?.secret) throw new Error("尚未開始註冊 2FA");

    const email = (context.claims.email as string) ?? "user";
    const delta = totp(row.secret, email).validate({ token: data.code, window: 1 });
    if (delta === null) throw new Error("驗證碼錯誤或已過期");

    const { plain, hashed } = generateBackupCodes();

    await supabaseAdmin
      .from("user_2fa")
      .update({
        enabled: true,
        enrolled_at: new Date().toISOString(),
        backup_codes: hashed,
      })
      .eq("user_id", context.userId);

    await supabaseAdmin.from("audit_logs").insert({
      user_id: context.userId,
      entity: "user_2fa",
      entity_id: context.userId,
      action: "enable",
      metadata: { method: "totp" },
    });

    return { ok: true, backupCodes: plain };
  });

export const disableTwoFactor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ code: z.string().min(6).max(11) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row } = await supabaseAdmin
      .from("user_2fa")
      .select("secret, backup_codes, enabled")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!row?.enabled) throw new Error("2FA 未啟用");

    const email = (context.claims.email as string) ?? "user";
    const ok =
      totp(row.secret, email).validate({ token: data.code, window: 1 }) !== null ||
      (row.backup_codes ?? []).includes(sha256(data.code.toUpperCase()));
    if (!ok) throw new Error("驗證碼錯誤");

    await supabaseAdmin.from("user_2fa").delete().eq("user_id", context.userId);
    await supabaseAdmin.from("audit_logs").insert({
      user_id: context.userId,
      entity: "user_2fa",
      entity_id: context.userId,
      action: "disable",
      metadata: {},
    });
    return { ok: true };
  });

export const regenerateBackupCodes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: row } = await supabaseAdmin
      .from("user_2fa")
      .select("enabled")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!row?.enabled) throw new Error("2FA 未啟用");

    const { plain, hashed } = generateBackupCodes();
    await supabaseAdmin
      .from("user_2fa")
      .update({ backup_codes: hashed })
      .eq("user_id", context.userId);
    return { backupCodes: plain };
  });

// =========================================================
// 2FA — Login challenge
// =========================================================
export const verifyTwoFactorLogin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ code: z.string().min(6).max(11) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row } = await supabaseAdmin
      .from("user_2fa")
      .select("secret, backup_codes, enabled")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!row?.enabled) throw new Error("2FA 未啟用");

    const email = (context.claims.email as string) ?? "user";
    const code = data.code.trim();
    const totpOk = /^\d{6}$/.test(code) &&
      totp(row.secret, email).validate({ token: code, window: 1 }) !== null;

    let usedBackup = false;
    if (!totpOk) {
      const hashed = sha256(code.toUpperCase());
      const list = row.backup_codes ?? [];
      const idx = list.indexOf(hashed);
      if (idx < 0) throw new Error("驗證碼錯誤");
      list.splice(idx, 1);
      await supabaseAdmin
        .from("user_2fa")
        .update({ backup_codes: list, last_used_at: new Date().toISOString() })
        .eq("user_id", context.userId);
      usedBackup = true;
    } else {
      await supabaseAdmin
        .from("user_2fa")
        .update({ last_used_at: new Date().toISOString() })
        .eq("user_id", context.userId);
    }

    // Mark all active sessions of this user as MFA verified
    await supabaseAdmin
      .from("user_sessions")
      .update({ mfa_verified_at: new Date().toISOString() })
      .eq("user_id", context.userId)
      .is("revoked_at", null);

    await supabaseAdmin.from("audit_logs").insert({
      user_id: context.userId,
      entity: "user_2fa",
      entity_id: context.userId,
      action: usedBackup ? "verify_backup" : "verify_totp",
      metadata: {},
    });

    return { ok: true, usedBackup };
  });

// =========================================================
// Sessions
// =========================================================
export const recordSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        sessionToken: z.string().min(10),
        deviceLabel: z.string().max(120).optional(),
        expiresAt: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { ip, userAgent } = extractRequestMeta();
    const hash = sha256(data.sessionToken);

    // Check if 2FA is required; if so, leave mfa_verified_at NULL
    const { data: tfa } = await supabaseAdmin
      .from("user_2fa")
      .select("enabled")
      .eq("user_id", context.userId)
      .maybeSingle();

    await supabaseAdmin.from("user_sessions").upsert(
      {
        user_id: context.userId,
        session_token_hash: hash,
        ip_address: ip,
        user_agent: userAgent,
        device_label: data.deviceLabel ?? null,
        expires_at: data.expiresAt ?? null,
        last_active_at: new Date().toISOString(),
        mfa_verified_at: tfa?.enabled ? null : new Date().toISOString(),
      },
      { onConflict: "session_token_hash" },
    );

    return { ok: true, requires2FA: !!tfa?.enabled };
  });

export const listMySessions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await supabaseAdmin
      .from("user_sessions")
      .select("*")
      .eq("user_id", context.userId)
      .order("last_active_at", { ascending: false })
      .limit(50);
    return data ?? [];
  });

export const revokeSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await supabaseAdmin
      .from("user_sessions")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    return { ok: true };
  });

export const getCurrentSessionStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ sessionToken: z.string().min(10) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const hash = sha256(data.sessionToken);
    const { data: row } = await supabaseAdmin
      .from("user_sessions")
      .select("mfa_verified_at, revoked_at")
      .eq("session_token_hash", hash)
      .eq("user_id", context.userId)
      .maybeSingle();

    const { data: tfa } = await supabaseAdmin
      .from("user_2fa")
      .select("enabled")
      .eq("user_id", context.userId)
      .maybeSingle();

    return {
      requires2FA: !!tfa?.enabled,
      mfaVerified: !!row?.mfa_verified_at,
      revoked: !!row?.revoked_at,
    };
  });

// =========================================================
// Login attempts
// =========================================================
export const recordLoginAttempt = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        email: z.string().trim().min(1).max(255),
        success: z.boolean(),
        failureReason: z.string().max(200).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { ip, userAgent } = extractRequestMeta();

    // Rate-limit per IP to prevent audit-log pollution by unauthenticated callers.
    if (ip) {
      const since = new Date(Date.now() - 60_000).toISOString();
      const { count } = await supabaseAdmin
        .from("login_attempts")
        .select("id", { count: "exact", head: true })
        .eq("ip_address", ip)
        .gte("created_at", since);
      if ((count ?? 0) >= 20) {
        return { ok: false as const, error: "rate_limited" };
      }
    }

    // Verify user_id server-side from the bearer token (if any).
    let verifiedUserId: string | null = null;
    if (data.success) {
      const authHeader = getRequestHeader("authorization");
      const token = authHeader?.toLowerCase().startsWith("bearer ")
        ? authHeader.slice(7).trim()
        : null;
      if (token) {
        const { data: userRes } = await supabaseAdmin.auth.getUser(token);
        if (userRes?.user?.id) verifiedUserId = userRes.user.id;
      }
    }

    // For failed attempts, only log if the target email exists — prevents
    // audit-log pollution with fabricated records for arbitrary emails.
    const normalized = data.email.toLowerCase().slice(0, 255);
    if (!data.success) {
      const { data: exists } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("email", normalized)
        .limit(1)
        .maybeSingle();
      if (!exists) {
        return { ok: true as const, skipped: true };
      }
    }

    await supabaseAdmin.from("login_attempts").insert({
      email: normalized,
      user_id: verifiedUserId,
      ip_address: ip,
      user_agent: userAgent ? userAgent.slice(0, 500) : null,
      success: data.success,
      failure_reason: data.failureReason ? data.failureReason.slice(0, 200) : null,
    });
    return { ok: true as const };
  });

export const listMyLoginAttempts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const email = (context.claims.email as string)?.toLowerCase() ?? "";
    const { data } = await supabaseAdmin
      .from("login_attempts")
      .select("*")
      .or(`user_id.eq.${context.userId},email.eq.${email}`)
      .order("created_at", { ascending: false })
      .limit(50);
    return data ?? [];
  });
