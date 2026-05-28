import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["super_admin", "admin"])
    .limit(1);
  if (!data || data.length === 0) throw new Error("Forbidden: 需要管理員權限");
}

function normalizePhone(p?: string | null) {
  if (!p) return null;
  const s = p.trim().replace(/[\s-]/g, "");
  return s || null;
}

// ============== Create a new member account ==============
const CreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(255).optional().or(z.literal("")),
  phone: z.string().trim().max(32).optional().or(z.literal("")),
  password: z.string().min(6).max(72),
}).refine((v) => !!v.email || !!v.phone, { message: "Email 與電話至少需填一項" });

export const adminCreateMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    const phone = normalizePhone(data.phone);
    const email = data.email?.trim() ||
      (phone ? `${phone.replace(/^\+/, "")}@phone.local` : "");
    if (!email) throw new Error("缺少有效識別資訊");

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
      user_metadata: { name: data.name, phone: phone ?? undefined },
    });
    if (error) throw new Error(error.message);
    const uid = created.user?.id;
    if (!uid) throw new Error("建立會員失敗");

    // The handle_new_user trigger will create profile + member_no + 'member' role.
    // Ensure phone/name are set even if metadata path differs.
    await supabaseAdmin
      .from("profiles")
      .update({ name: data.name, phone })
      .eq("id", uid);

    await supabaseAdmin.from("audit_logs").insert({
      user_id: context.userId,
      entity: "profiles",
      entity_id: uid,
      action: "admin_create_member",
      metadata: { email, phone },
    });

    return { ok: true, userId: uid };
  });

// ============== Update member basic profile ==============
const UpdateSchema = z.object({
  userId: z.string().uuid(),
  name: z.string().trim().min(1).max(120).optional(),
  email: z.string().trim().email().max(255).optional().or(z.literal("")),
  phone: z.string().trim().max(32).optional().or(z.literal("")),
  password: z.string().min(6).max(72).optional().or(z.literal("")),
  referrerMemberNo: z.string().trim().max(32).optional().or(z.literal("")),
  clearReferrer: z.boolean().optional(),
});

export const adminUpdateMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpdateSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    const phone = data.phone !== undefined ? normalizePhone(data.phone) : undefined;
    const profileUpdate: { name?: string; email?: string | null; phone?: string | null; referred_by?: string | null } = {};
    if (data.name !== undefined) profileUpdate.name = data.name;
    if (data.email !== undefined) profileUpdate.email = data.email || null;
    if (phone !== undefined) profileUpdate.phone = phone;

    if (data.clearReferrer) {
      profileUpdate.referred_by = null;
    } else if (data.referrerMemberNo && data.referrerMemberNo.trim()) {
      const code = data.referrerMemberNo.trim();
      const { data: ref, error: refErr } = await supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("member_no", code)
        .maybeSingle();
      if (refErr) throw new Error(refErr.message);
      if (!ref?.id) throw new Error(`找不到推薦人會員編號：${code}`);
      if (ref.id === data.userId) throw new Error("推薦人不能是會員本人");
      profileUpdate.referred_by = ref.id;
    }

    if (Object.keys(profileUpdate).length) {
      const { error } = await supabaseAdmin
        .from("profiles")
        .update(profileUpdate)
        .eq("id", data.userId);

      if (error) throw new Error(error.message);
    }

    // Sync auth user (email / password) if provided
    const authPatch: { email?: string; password?: string } = {};
    if (data.email) authPatch.email = data.email;
    if (data.password) authPatch.password = data.password;
    if (Object.keys(authPatch).length) {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(
        data.userId,
        authPatch,
      );
      if (error) throw new Error(error.message);
    }

    await supabaseAdmin.from("audit_logs").insert({
      user_id: context.userId,
      entity: "profiles",
      entity_id: data.userId,
      action: "admin_update_member",
      metadata: {
        fields: Object.keys(profileUpdate),
        password_changed: !!data.password,
      },
    });

    return { ok: true };
  });

// ============== Reset / generate password / impersonate ==============
function generateTempPassword(len = 12): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const digits = "23456789";
  const symbols = "!@#$%^&*";
  const all = upper + lower + digits + symbols;
  const pickFrom = (s: string) => s[Math.floor(Math.random() * s.length)];
  const base = [pickFrom(upper), pickFrom(lower), pickFrom(digits), pickFrom(symbols)];
  for (let i = base.length; i < len; i++) base.push(pickFrom(all));
  return base.sort(() => Math.random() - 0.5).join("");
}

const ResetSchema = z.object({
  userId: z.string().uuid(),
  password: z.string().min(6).max(72).optional(),
  generateTemp: z.boolean().optional(),
  forceChangeOnNextLogin: z.boolean().optional(),
});

export const adminResetMemberPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ResetSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    const password = data.password && data.password.length >= 6
      ? data.password
      : data.generateTemp
        ? generateTempPassword(12)
        : null;
    if (!password) throw new Error("請提供新密碼或選擇產生臨時密碼");

    const { data: updated, error } = await supabaseAdmin.auth.admin.updateUserById(
      data.userId,
      {
        password,
        user_metadata: data.forceChangeOnNextLogin
          ? { must_change_password: true, password_reset_at: new Date().toISOString() }
          : { password_reset_at: new Date().toISOString() },
      },
    );
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("audit_logs").insert({
      user_id: context.userId,
      entity: "profiles",
      entity_id: data.userId,
      action: "admin_reset_password",
      metadata: {
        temp: !!data.generateTemp,
        force_change: !!data.forceChangeOnNextLogin,
        target_email: updated.user?.email,
      },
    });

    return { ok: true, password, email: updated.user?.email ?? null };
  });

const ImpersonateSchema = z.object({ userId: z.string().uuid() });

export const adminImpersonateMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ImpersonateSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    const { data: target } = await supabaseAdmin
      .from("profiles")
      .select("email, name")
      .eq("id", data.userId)
      .maybeSingle();
    if (!target?.email) throw new Error("會員缺少 Email，無法產生代登入連結");

    const { data: link, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: target.email,
    });
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("audit_logs").insert({
      user_id: context.userId,
      entity: "profiles",
      entity_id: data.userId,
      action: "admin_impersonate_member",
      metadata: { target_email: target.email, target_name: target.name },
    });

    return {
      ok: true,
      actionLink: link.properties?.action_link ?? null,
      email: target.email,
      expiresInMinutes: 60,
    };
  });
