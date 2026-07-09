import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, MessageCircle, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import {
  listShopContentQuestions,
  submitShopContentQuestion,
} from "@/lib/shop-content-questions.functions";

export function ShopContentQuestions({ pageId }: { pageId: string }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const listFn = useServerFn(listShopContentQuestions);
  const submitFn = useServerFn(submitShopContentQuestion);
  const [content, setContent] = useState("");
  const [name, setName] = useState("");

  const q = useQuery({
    queryKey: ["shop-content-questions", pageId],
    queryFn: () => listFn({ data: { page_id: pageId } }),
  });

  const submit = useMutation({
    mutationFn: () =>
      submitFn({
        data: {
          page_id: pageId,
          content: content.trim(),
          author_name: name.trim() || undefined,
        },
      }),
    onSuccess: () => {
      setContent("");
      toast.success("已送出，客服人員將盡快回覆");
      qc.invalidateQueries({ queryKey: ["shop-content-questions", pageId] });
    },
    onError: (e: any) => toast.error("送出失敗", { description: e?.message }),
  });

  const questions = q.data?.questions ?? [];

  return (
    <section className="mt-10 border-t pt-8">
      <div className="flex items-center gap-2 mb-4">
        <MessageCircle className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">留言 · 提問</h2>
        <span className="text-xs text-muted-foreground">
          （{questions.length}）
        </span>
      </div>

      {user ? (
        <div className="rounded-2xl border border-border/60 bg-card p-4 space-y-3 mb-6">
          <Input
            placeholder="顯示名稱（可留空，預設使用會員名稱）"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
          />
          <Textarea
            placeholder="想詢問或分享的內容…（送出後將通知行政客服）"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={4}
            maxLength={2000}
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              disabled={!content.trim() || submit.isPending}
              onClick={() => submit.mutate()}
            >
              {submit.isPending ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-1" />
              )}
              送出提問
            </Button>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground mb-6">
          請先登入會員即可留言提問，客服人員將回覆您。
        </div>
      )}

      {q.isLoading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : questions.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-6">
          尚無留言，歡迎成為第一位提問者。
        </div>
      ) : (
        <ul className="space-y-3">
          {questions.map((item: any) => (
            <li
              key={item.id}
              className="rounded-xl border border-border/60 bg-card p-4"
            >
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                <span className="font-medium text-foreground">
                  {item.author_name || "會員"}
                </span>
                <span>
                  {new Date(item.created_at).toLocaleString("zh-TW")}
                </span>
              </div>
              <p className="text-sm whitespace-pre-wrap">{item.content}</p>
              {item.reply && (
                <div className="mt-3 rounded-lg bg-primary/5 border border-primary/20 p-3">
                  <div className="text-xs font-medium text-primary mb-1">
                    行政客服回覆
                    {item.replied_at && (
                      <span className="ml-2 text-muted-foreground font-normal">
                        {new Date(item.replied_at).toLocaleString("zh-TW")}
                      </span>
                    )}
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{item.reply}</p>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
