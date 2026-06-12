import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";
import {
  publicAiCorsHeaders,
  publicAiOptionsResponse,
  requirePublicAiAccess,
} from "@/lib/public-ai-guard.server";

export const Route = createFileRoute("/api/public/ai/recruit")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => publicAiOptionsResponse(request),
      POST: async ({ request }) => {
        const access = requirePublicAiAccess(request);
        if (!access.ok) return access.response;

        const key = process.env.LOVABLE_API_KEY;
        if (!key) {
          return new Response("Missing LOVABLE_API_KEY", {
            status: 500,
            headers: publicAiCorsHeaders(access.origin),
          });
        }
        const { messages } = (await request.json()) as { messages: UIMessage[] };
        if (
          !Array.isArray(messages)
          || messages.length === 0
          || messages.length > 20
          || JSON.stringify(messages).length > 24_000
        ) {
          return new Response("Bad request", {
            status: 400,
            headers: publicAiCorsHeaders(access.origin),
          });
        }

        // 即時讀取資料庫資料組合 system prompt
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const [vipPlansRes, productsRes, settingsRes] = await Promise.all([
          supabaseAdmin.from("vip_plans").select("name,price,duration_days,description,bonus_points,referral_rate_percent").eq("status", "active").order("sort_order"),
          supabaseAdmin.from("products").select("name,price,short_description,reward_points").eq("status", "active").order("featured", { ascending: false }).limit(20),
          supabaseAdmin.from("group_buy_settings").select("winner_reward_pct,initiator_reward_pct,default_duration_days,target_count,max_orders_per_user").limit(1).maybeSingle(),
        ]);

        const vipText = (vipPlansRes.data ?? []).map((p) =>
          `- ${p.name}：年費 NT$${p.price}，期限 ${p.duration_days} 天，贈點 ${p.bonus_points}，推薦回饋 ${p.referral_rate_percent}%。${p.description ?? ""}`
        ).join("\n") || "（尚未設定 VIP 方案）";

        const productText = (productsRes.data ?? []).map((p) =>
          `- ${p.name}（NT$${p.price}，購物回饋 ${p.reward_points} 點）`
        ).join("\n") || "（無上架商品）";

        const s = settingsRes.data;
        const gbText = s
          ? `每團 ${s.target_count} 人，期限 ${s.default_duration_days} 天，每人限購 ${s.max_orders_per_user} 單；成團後中獎者獲得 ${s.winner_reward_pct}% 購物點、發起人獲得 ${s.initiator_reward_pct}% 獎勵點。`
          : "拼團規則尚未設定";

        const systemPrompt = `你是「好處多多樂拼購 AI 招商中心」的招商顧問。用繁體中文、熱情親切地回答訪客問題，引導他們了解 VIP 方案、商品與拼團機制，並適時鼓勵註冊或升級 VIP。回答簡潔，重點條列。

【VIP 方案】
${vipText}

【熱門商品】
${productText}

【拼團制度】
${gbText}

如問題不在以上範圍，請禮貌說明並引導訪客聯絡客服。`;

        const gateway = createLovableAiGatewayProvider(key);
        const result = streamText({
          model: gateway("google/gemini-3-flash-preview"),
          system: systemPrompt,
          messages: await convertToModelMessages(messages),
        });

        return result.toUIMessageStreamResponse({
          headers: publicAiCorsHeaders(access.origin),
          originalMessages: messages,
        });
      },
    },
  },
});
