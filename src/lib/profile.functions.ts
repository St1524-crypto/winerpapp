import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const SLUG_RE = /^[A-Za-z0-9_-]{3,32}$/;

const profileInputSchema = z.object({
  name: z.string().trim().min(1, "請輸入名稱。").max(120, "名稱過長。"),
  displayName: z.string().trim().max(80, "對外匿稱過長。").optional().or(z.literal("")),
  email: z.string().trim().email("Email 格式錯誤，請確認後再儲存。").max(255, "Email 過長。"),
  avatarUrl: z.string().trim().max(500, "頭像網址過長。").optional().or(z.literal("")),
  marketingSlug: z.string().trim().max(32, "行銷網址代稱最多 32 字元。").optional().or(z.literal("")),
});

function defaultDisplayName(name: string) {
  return Array.from(name.trim()).slice(0, 2).join("");
}

function normalizePhoneSlug(phone: string | null | undefined) {
  const normalized = (phone ?? "").replace(/[\s-]/g, "").replace(/^\+/, "");
  return SLUG_RE.test(normalized) ? normalized : "";
}

function normalizeDbError(message: string) {
  if (/marketing_slug_format_invalid|check constraint|format/i.test(message)) {
    return "行銷網址代稱格式錯誤，請輸入 3-32 字元，可含 A-Z、a-z、0-9、_、-。";
  }
  if (/duplicate|unique|marketing_slug_conflict|member_no_marketing_slug_conflict|already/i.test(message)) {
    return "行銷網址代稱已和其他會員的行銷代稱或會員ID重複，請更換。";
  }
  if (/email/i.test(message) && /invalid/i.test(message)) {
    return "Email 格式錯誤，請確認後再儲存。";
  }
  if (/email/i.test(message) && /already|exists|registered/i.test(message)) {
    return "此 Email 已被其他帳號使用，請更換。";
  }
  return message || "儲存失敗，請確認欄位內容後再試一次。";
}

export const saveMyAccountProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => profileInputSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: current, error: currentError } = await supabaseAdmin
      .from("profiles")
      .select("id, name, display_name, email, phone, member_no, marketing_slug")
      .eq("id", context.userId)
      .maybeSingle();

    if (currentError) throw new Error(normalizeDbError(currentError.message));
    if (!current) throw new Error("找不到會員資料，請重新登入後再試。");

    const name = data.name.trim();
    const displayName = data.displayName?.trim() || defaultDisplayName(name);
    const email = data.email.trim();
    const requestedSlug = data.marketingSlug?.trim() || "";
    const fallbackSlug = normalizePhoneSlug((current as any).phone) || (current as any).member_no || "";
    const marketingSlug = requestedSlug || fallbackSlug || null;

    if (marketingSlug && !SLUG_RE.test(marketingSlug)) {
      throw new Error("行銷網址代稱格式錯誤，請輸入 3-32 字元，可含 A-Z、a-z、0-9、_、-。");
    }

    const prevSlug = ((current as any).marketing_slug ?? null) as string | null;
    const prevEmail = ((current as any).email ?? null) as string | null;

    if (email !== prevEmail) {
      const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(context.userId, { email });
      if (authError) throw new Error(normalizeDbError(authError.message));
    }

    const { error: updateError } = await supabaseAdmin
      .from("profiles")
      .update({
        name,
        display_name: displayName,
        email,
        avatar_url: data.avatarUrl?.trim() || null,
        marketing_slug: marketingSlug,
      } as any)
      .eq("id", context.userId);

    if (updateError) throw new Error(normalizeDbError(updateError.message));

    if ((prevSlug ?? null) !== (marketingSlug ?? null)) {
      await supabaseAdmin.from("audit_logs").insert({
        user_id: context.userId,
        entity: "profiles.marketing_slug",
        entity_id: context.userId,
        action: "marketing_slug_changed",
        metadata: {
          source: "self",
          actor_id: context.userId,
          target_user_id: context.userId,
          before: prevSlug,
          after: marketingSlug,
          changed_at: new Date().toISOString(),
        },
      } as any);
    }

    return {
      ok: true,
      profile: {
        name,
        display_name: displayName,
        email,
        avatar_url: data.avatarUrl?.trim() || null,
        marketing_slug: marketingSlug,
      },
      emailChanged: email !== prevEmail,
    };
  });
