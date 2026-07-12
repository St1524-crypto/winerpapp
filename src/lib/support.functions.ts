import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sanitizePostgrestPattern } from "@/lib/postgrest-sanitize";

const SYSTEM_PROMPT = `你是「源晶小幫手」，源晶商城的 AI 客服助理。
- 用親切、簡潔、繁體中文回答客戶。
- 你可以協助：商品推薦與詢問、訂單流程、配送、付款、會員與經銷商資訊。
- 若客戶詢問特定商品，根據提供的「商品資料庫」內容回覆價格、庫存、描述。
- 不確定的事情請誠實說「我幫您轉接專人客服」，不要編造。
- 回覆控制在 3 段以內，重點優先。`;

export const listThreads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("support_threads")
      .select("id, title, created_at, updated_at")
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("support_threads")
      .insert({ user_id: userId, title: "新對話" })
      .select("id, title, created_at, updated_at")
      .single();
    if (error) throw new Error(error.message);
    return data;
  });

export const deleteThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ threadId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("support_threads").delete().eq("id", data.threadId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ threadId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("support_messages")
      .select("id, role, content, created_at")
      .eq("thread_id", data.threadId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const getActiveAnnouncement = createServerFn({ method: "GET" }).handler(async () => {
  const { data } = await supabaseAdmin
    .from("support_announcements")
    .select("id, title, content, created_at")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
});

export const checkIn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const today = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Taipei" }))
      .toISOString()
      .slice(0, 10);
    const { data: existing } = await supabase
      .from("support_checkins")
      .select("id")
      .eq("user_id", userId)
      .eq("checkin_date", today)
      .maybeSingle();
    if (existing) {
      const { count } = await supabase
        .from("support_checkins")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId);
      return { alreadyCheckedIn: true, totalDays: count ?? 0, date: today };
    }
    const { error } = await supabase
      .from("support_checkins")
      .insert({ user_id: userId, checkin_date: today });
    if (error) throw new Error(error.message);
    const { count } = await supabase
      .from("support_checkins")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    return { alreadyCheckedIn: false, totalDays: count ?? 0, date: today };
  });

export const getCheckInStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const today = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Taipei" }))
      .toISOString()
      .slice(0, 10);
    const [{ data: today_row }, { count }] = await Promise.all([
      supabase
        .from("support_checkins")
        .select("id")
        .eq("user_id", userId)
        .eq("checkin_date", today)
        .maybeSingle(),
      supabase.from("support_checkins").select("id", { count: "exact", head: true }).eq("user_id", userId),
    ]);
    return { checkedInToday: !!today_row, totalDays: count ?? 0, date: today };
  });

async function fetchProductContext(query: string) {
  // Try keyword match across name / sku / category / short_description.
  const safe = sanitizePostgrestPattern(query);
  if (!safe) return null;
  const ilike = `%${safe}%`;
  const { data } = await supabaseAdmin
    .from("products")
    .select("name, sku, price, stock, short_description, category")
    .eq("status", "active")
    .or(`name.ilike.${ilike},sku.ilike.${ilike},category.ilike.${ilike},short_description.ilike.${ilike}`)
    .limit(6);
  if (data && data.length > 0) return data;
  // Fallback: a few featured / latest items
  const { data: featured } = await supabaseAdmin
    .from("products")
    .select("name, sku, price, stock, short_description, category")
    .eq("status", "active")
    .order("featured", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(6);
  return featured ?? [];
}

export const sendChatMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        threadId: z.string().uuid(),
        message: z.string().min(1).max(2000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("Missing LOVABLE_API_KEY");

    // Save user message
    const { error: userErr } = await supabase.from("support_messages").insert({
      thread_id: data.threadId,
      user_id: userId,
      role: "user",
      content: data.message,
    });
    if (userErr) throw new Error(userErr.message);

    // Load recent history
    const { data: history } = await supabase
      .from("support_messages")
      .select("role, content")
      .eq("thread_id", data.threadId)
      .order("created_at", { ascending: true })
      .limit(20);

    // Fetch product context based on the latest user message
    const productCtx = await fetchProductContext(data.message);
    const productSection =
      productCtx.length > 0
        ? `以下是相關商品資料（請只引用真實存在的商品）：\n${productCtx
            .map(
              (p) =>
                `- ${p.name}（SKU:${p.sku}，分類：${p.category ?? "—"}，售價 NT$${p.price}，庫存 ${p.stock}）${
                  p.short_description ? `｜${p.short_description}` : ""
                }`,
            )
            .join("\n")}`
        : "（目前查無相關商品資料）";

    // Touch thread updated_at + auto-title if needed
    const { data: thread } = await supabase
      .from("support_threads")
      .select("title")
      .eq("id", data.threadId)
      .maybeSingle();
    const newTitle =
      thread?.title === "新對話" || !thread?.title
        ? data.message.slice(0, 24)
        : thread.title;
    await supabase
      .from("support_threads")
      .update({ title: newTitle, updated_at: new Date().toISOString() })
      .eq("id", data.threadId);

    // Call Lovable AI Gateway
    const messages = [
      { role: "system", content: `${SYSTEM_PROMPT}\n\n${productSection}` },
      ...(history ?? []).map((m) => ({ role: m.role, content: m.content })),
    ];

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages,
      }),
    });

    if (res.status === 429) throw new Error("AI 客服暫時忙線中，請稍後再試。");
    if (res.status === 402) throw new Error("AI 額度不足，請聯絡管理員。");
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`AI 回應失敗：${res.status} ${t}`);
    }
    const json = (await res.json()) as any;
    const reply: string = json?.choices?.[0]?.message?.content ?? "（無回應）";

    const { error: aiErr } = await supabase.from("support_messages").insert({
      thread_id: data.threadId,
      user_id: userId,
      role: "assistant",
      content: reply,
    });
    if (aiErr) throw new Error(aiErr.message);

    return { reply };
  });

// Admin: announcements CRUD
export const listAnnouncements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("support_announcements")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const upsertAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid().optional(),
        title: z.string().min(1).max(200),
        content: z.string().min(1).max(2000),
        is_active: z.boolean().default(true),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.id) {
      const { error } = await supabase
        .from("support_announcements")
        .update({ title: data.title, content: data.content, is_active: data.is_active })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from("support_announcements").insert({
        title: data.title,
        content: data.content,
        is_active: data.is_active,
        created_by: userId,
      });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const deleteAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("support_announcements").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
