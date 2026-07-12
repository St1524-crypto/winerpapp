import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function publicDb() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
  ) as any;
}

export const listShopContentQuestions = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ page_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { data: rows, error } = await publicDb()
      .from("shop_content_questions")
      .select("id, content, reply, replied_at, created_at")
      .eq("page_id", data.page_id)
      .eq("is_hidden", false)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    // Do not expose author_name publicly — return a generic label only.
    const masked = (rows ?? []).map((r: any) => ({ ...r, author_name: "會員" }));
    return { questions: masked };
  });

export const submitShopContentQuestion = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        page_id: z.string().uuid(),
        content: z.string().trim().min(1).max(2000),
        author_name: z.string().trim().max(60).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Fetch page title for notification context
    const { data: page } = await supabase
      .from("shop_content_pages")
      .select("id, title, is_published")
      .eq("id", data.page_id)
      .maybeSingle();
    if (!page || !(page as any).is_published) {
      throw new Error("找不到文章或尚未發布");
    }

    // Get profile name fallback
    let authorName = data.author_name?.trim();
    if (!authorName) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("name, display_name, email")
        .eq("id", userId)
        .maybeSingle();
      authorName =
        (profile as any)?.display_name ||
        (profile as any)?.name ||
        (profile as any)?.email ||
        "會員";
    }

    const { error: insErr } = await supabase.from("shop_content_questions").insert({
      page_id: data.page_id,
      user_id: userId,
      author_name: authorName,
      content: data.content,
    });
    if (insErr) throw new Error(insErr.message);

    // Notify admins — use service-role client to bypass RLS on notifications insert.
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: admins } = await supabaseAdmin
        .from("user_roles")
        .select("user_id")
        .in("role", ["admin", "super_admin"]);
      const uniqueIds = Array.from(
        new Set(((admins ?? []) as any[]).map((r) => r.user_id).filter(Boolean)),
      );
      if (uniqueIds.length > 0) {
        const preview = data.content.length > 80 ? data.content.slice(0, 80) + "…" : data.content;
        const rows = uniqueIds.map((uid) => ({
          user_id: uid,
          title: `新留言／提問：${(page as any).title}`,
          message: `${authorName}：${preview}`,
          type: "shop_content_question",
        }));
        await supabaseAdmin.from("notifications").insert(rows);
      }
    } catch {
      // Notification failure should not block the user's submission.
    }

    return { ok: true };
  });
