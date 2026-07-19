import { useState, useRef, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Bot, X, Send, Minus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { askAdminAssistant } from "@/lib/admin-assistant.functions";
import { useAdminFabsHidden } from "@/hooks/use-admin-fabs";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; content: string };

const INITIAL: Msg = {
  role: "assistant",
  content:
    "您好，我可以協助您查詢源晶ERP後台操作方式，例如商品、會員、訂單、VIP、獎金與報表流程。",
};

export function AdminAIAssistantWidget() {
  const { roles } = useAuth();
  const isAdmin = roles.includes("admin") || roles.includes("super_admin");

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([INITIAL]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const ask = useServerFn(askAdminAssistant);
  const hidden = useAdminFabsHidden();

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open]);

  if (!isAdmin) return null;
  if (hidden && !open) return null;

  async function handleSend() {
    const text = input.trim();
    if (!text || loading) return;
    const next: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setLoading(true);
    try {
      const history = next
        .filter((m) => m.role !== "assistant" || m !== INITIAL)
        .slice(-12);
      const { reply } = await ask({ data: { messages: history } });
      setMessages((m) => [...m, { role: "assistant", content: reply }]);
    } catch {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content:
            "目前 AI 行政助理暫時無法回覆，請稍後再試或聯絡系統管理員。",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed bottom-2 right-12 md:bottom-3 md:right-14 z-[60] print:hidden">
      {!open && (
        <button
          type="button"
          aria-label="AI 行政助理"
          title="AI 行政助理"
          onClick={() => setOpen(true)}
          className="group flex items-center justify-center rounded-full bg-primary/85 hover:bg-primary text-primary-foreground shadow-md hover:opacity-100 transition h-8 w-8 md:h-9 md:w-9"
        >
          <Bot className="h-4 w-4" />
          <span className="sr-only">AI 行政助理</span>
        </button>
      )}

      {open && (
        <div className="w-[min(380px,calc(100vw-2rem))] h-[520px] max-h-[calc(100vh-2rem)] flex flex-col rounded-xl border bg-card text-card-foreground shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/40">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Bot className="h-4 w-4 text-primary" />
              源晶ERP AI 行政助理
            </div>
            <div className="flex items-center gap-1">
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => setOpen(false)}
                aria-label="收合"
              >
                <Minus className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                onClick={() => {
                  setOpen(false);
                  setMessages([INITIAL]);
                }}
                aria-label="關閉"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto p-3 space-y-2 text-sm"
          >
            {messages.map((m, i) => (
              <div
                key={i}
                className={cn(
                  "flex",
                  m.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-lg px-3 py-2 whitespace-pre-wrap leading-relaxed",
                    m.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground"
                  )}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="rounded-lg bg-muted px-3 py-2 text-muted-foreground flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  思考中…
                </div>
              </div>
            )}
          </div>

          <div className="border-t p-2 flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              rows={2}
              placeholder="請輸入您想詢問的系統操作問題..."
              className="flex-1 resize-none rounded-md border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              disabled={loading}
            />
            <Button
              size="icon"
              onClick={handleSend}
              disabled={loading || !input.trim()}
              aria-label="送出"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <div className="px-3 pb-2 text-[10px] text-muted-foreground">
            僅提供操作教學，不會修改任何資料。
          </div>
        </div>
      )}
    </div>
  );
}
