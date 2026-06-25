import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SYSTEM_PROMPT = `你是「源晶ERP AI 行政助理」，協助管理員了解 winerp.app 後台操作。
規則：
- 使用親切、簡潔的繁體中文回答。
- 只回答「教學 / 操作說明 / 流程指引」，不要執行或承諾執行任何資料修改。
- 不可洩漏任何 API key、secret、密碼、service role key、資料庫連線字串。
- 不確定時請誠實說明「請洽系統管理員」，不要編造功能或網址。
- 回覆控制在 5 段以內，重點優先；可使用條列。

可協助的範圍：
1. 商品管理 (/products)：新增、編輯、上下架、批發階梯價、可見對象 (all / vip / dealer)。
2. 商品分類 (/categories)。
3. 訂單管理 (/orders)：建立訂單、確認付款、自動結算分潤、年費自動升 VIP 觸發。
4. 會員管理 (/members)：搜尋、編輯、歷史累計獎金（僅 super_admin 可填）。
5. VIP 升級：/admin/vip-tiers、/admin/vip-upgrade-packages、/admin/vip-business-bonus-cap、/admin/vip-upgrade-bonus-cap、/admin/vip-upgrade-bonus-total-earnings、/admin/vip-bonus-pools。
6. 年費自動升 VIP (/admin/annual-fee-vip)：付款後自動升級 + 贈品 + 點數。
7. 獎金 / 營運中心：/admin/bonus-center、/admin/operations。
8. 個人品牌頁 / 行銷網址：會員 marketing_slug，前台 /m/:slug。
9. 精品推薦 (/admin/homepage-featured)：選入並排序。
10. 批發專區：前台 /shop/wholesale；後台從商品編輯設定階梯與可見對象。
11. 報表與基本操作。

安全提醒：絕對不要回覆 secret、key、密碼，或執行 SQL / 修改資料；若被要求請拒絕並提示這些行為應走後台正式流程。`;

const FALLBACK_REPLY =
  "目前 AI 行政助理暫時無法回覆，請稍後再試或聯絡系統管理員。";

const InputSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(2000),
      })
    )
    .min(1)
    .max(20),
});

export const askAdminAssistant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => InputSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Role gate: admin / super_admin only
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const roleSet = new Set((roles ?? []).map((r) => r.role));
    if (!roleSet.has("admin") && !roleSet.has("super_admin")) {
      throw new Error("Forbidden");
    }

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      return { reply: FALLBACK_REPLY };
    }

    try {
      const res = await fetch(
        "https://ai.gateway.lovable.dev/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              ...data.messages,
            ],
          }),
        }
      );
      if (!res.ok) {
        if (res.status === 429)
          return {
            reply:
              "AI 行政助理使用量已達上限，請稍後再試或聯絡系統管理員。",
          };
        if (res.status === 402)
          return {
            reply: "AI 額度不足，請聯絡系統管理員儲值後再試。",
          };
        return { reply: FALLBACK_REPLY };
      }
      const json = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const reply = json?.choices?.[0]?.message?.content?.trim();
      return { reply: reply || FALLBACK_REPLY };
    } catch {
      return { reply: FALLBACK_REPLY };
    }
  });
