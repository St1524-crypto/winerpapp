import { createFileRoute } from "@tanstack/react-router";
import {
  publicAiCorsHeaders,
  publicAiOptionsResponse,
  requirePublicAiAccess,
} from "@/lib/public-ai-guard.server";
import { sanitizePostgrestPattern } from "@/lib/postgrest-sanitize";

type GuestMessage = { role: "user" | "assistant"; content: string };

const SYSTEM_PROMPT = `你是「源晶小幫手」，源晶商城的 AI 客服助理（訪客模式）。
- 用親切、簡潔、繁體中文回答訪客。
- 你可協助：促銷活動、特惠、商品價格/庫存/描述、會員與經銷福利、網站導覽。
- 若訪客詢問特定商品，請根據下方「商品資料庫」內容回覆。
- 訪客尚未登入，如需下單、查訂單、對話保存、AI 打卡累積，請引導點「前往登入 / 註冊」；
  若想聯繫真人客服，請引導加入 LINE 官方帳號 @win8799999。
- 不確定的事情請誠實說「這部分建議加 LINE 客服 @win8799999 洽詢」，不要編造。
- 回覆控制在 3 段以內，重點優先。`;

async function fetchProductContext(query: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const safe = sanitizePostgrestPattern(query);
  if (safe) {
    const ilike = `%${safe}%`;
    const { data } = await supabaseAdmin
      .from("products")
      .select("name, sku, price, stock, short_description, category")
      .eq("status", "active")
      .or(`name.ilike.${ilike},sku.ilike.${ilike},category.ilike.${ilike},short_description.ilike.${ilike}`)
      .limit(6);
    if (data && data.length > 0) return data;
  }
  const { data: featured } = await supabaseAdmin
    .from("products")
    .select("name, sku, price, stock, short_description, category")
    .eq("status", "active")
    .order("featured", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(6);
  return featured ?? [];
}

export const Route = createFileRoute("/api/public/ai/support-guest")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => publicAiOptionsResponse(request),
      POST: async ({ request }) => {
        const access = requirePublicAiAccess(request);
        if (!access.ok) return access.response;
        const cors = publicAiCorsHeaders(access.origin);

        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500, headers: cors });

        let body: { message?: unknown; history?: unknown };
        try {
          body = (await request.json()) as typeof body;
        } catch {
          return new Response("Bad JSON", { status: 400, headers: cors });
        }
        const message = typeof body.message === "string" ? body.message.trim() : "";
        const historyRaw = Array.isArray(body.history) ? body.history : [];
        if (!message || message.length > 1000) {
          return new Response("Bad request", { status: 400, headers: cors });
        }
        const history: GuestMessage[] = historyRaw
          .filter((m: any) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
          .slice(-10)
          .map((m: any) => ({ role: m.role, content: String(m.content).slice(0, 2000) }));

        const productCtx = await fetchProductContext(message);
        const productSection =
          productCtx && productCtx.length > 0
            ? `以下是相關商品資料（請只引用真實存在的商品）：\n${productCtx
                .map(
                  (p) =>
                    `- ${p.name}（SKU:${p.sku}，分類：${p.category ?? "—"}，售價 NT$${p.price}，庫存 ${p.stock}）${
                      p.short_description ? `｜${p.short_description}` : ""
                    }`,
                )
                .join("\n")}`
            : "（目前查無相關商品資料）";

        const messages = [
          { role: "system", content: `${SYSTEM_PROMPT}\n\n${productSection}` },
          ...history,
          { role: "user", content: message },
        ];

        const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages,
          }),
        });

        if (res.status === 429) {
          return new Response(JSON.stringify({ error: "AI 客服暫時忙線中，請稍後再試。" }), {
            status: 429,
            headers: { ...cors, "Content-Type": "application/json" },
          });
        }
        if (!res.ok) {
          const t = await res.text().catch(() => "");
          return new Response(JSON.stringify({ error: `AI 回應失敗：${res.status} ${t}` }), {
            status: 502,
            headers: { ...cors, "Content-Type": "application/json" },
          });
        }
        const json = (await res.json()) as any;
        const reply: string = json?.choices?.[0]?.message?.content ?? "（無回應）";

        return new Response(JSON.stringify({ reply }), {
          status: 200,
          headers: { ...cors, "Content-Type": "application/json" },
        });
      },
    },
  },
});
