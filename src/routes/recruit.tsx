import { createFileRoute } from "@tanstack/react-router";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sparkles, Send } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/recruit")({
  head: () => ({
    meta: [
      { title: "AI 招商中心 — 好處多多樂拼購" },
      { name: "description", content: "問問 AI 招商顧問：VIP 方案、商品、拼團制度、獎勵計算，一站式解答。" },
      { property: "og:title", content: "AI 招商中心 — 好處多多樂拼購" },
      { property: "og:description", content: "AI 即時回答 VIP 制度、商品與拼團獎勵問題。" },
    ],
  }),
  component: RecruitPage,
});

const initialMessages: UIMessage[] = [
  {
    id: "welcome",
    role: "assistant",
    parts: [{ type: "text", text: "您好！我是好處多多樂拼購的 AI 招商顧問 🤖\n\n您可以問我：\n• VIP 會員年費與權益\n• 拼團如何發起與獎勵分配\n• 商品內容與購物點計算\n• 如何成為發起人賺取獎勵\n\n請問您想了解什麼？" }],
  },
];

function RecruitPage() {
  const [input, setInput] = useState("");
  const { messages, sendMessage, status } = useChat({
    id: "recruit",
    messages: initialMessages,
    transport: new DefaultChatTransport({ api: "/api/public/ai/recruit" }),
    onError: (e) => toast.error(e.message),
  });
  const loading = status === "submitted" || status === "streaming";

  async function handleSend() {
    if (!input.trim() || loading) return;
    const t = input.trim();
    setInput("");
    await sendMessage({ text: t });
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 via-amber-50 to-orange-50 py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full text-sm font-medium">
            <Sparkles className="h-4 w-4" /> AI 招商中心
          </div>
          <h1 className="text-3xl md:text-4xl font-bold mt-3">好處多多樂拼購</h1>
          <p className="text-muted-foreground mt-2">智能顧問 24 小時為您解答 VIP、商品與拼團制度</p>
        </div>

        <Card className="h-[60vh] flex flex-col">
          <CardHeader className="border-b">
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" /> AI 招商顧問
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map((m) => {
              const text = m.parts.map((p: any) => (p.type === "text" ? p.text : "")).join("");
              return (
                <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm whitespace-pre-wrap ${
                    m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
                  }`}>{text}</div>
                </div>
              );
            })}
            {loading && <div className="text-xs text-muted-foreground">AI 思考中…</div>}
          </CardContent>
          <div className="border-t p-3 flex gap-2">
            <Input
              placeholder="輸入您的問題…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSend(); }}
              disabled={loading}
            />
            <Button onClick={handleSend} disabled={loading || !input.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </Card>

        <div className="mt-6 text-center text-sm">
          <a href="/group-buys" className="text-primary hover:underline mr-4">查看進行中拼團 →</a>
          <a href="/shop/vip" className="text-primary hover:underline">VIP 方案 →</a>
        </div>
      </div>
    </div>
  );
}
