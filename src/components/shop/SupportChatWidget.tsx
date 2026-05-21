import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, MessageCircle, Plus, Send, Trash2, X, Megaphone, CalendarCheck, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useAuth } from "@/hooks/use-auth";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  listThreads,
  createThread,
  deleteThread,
  listMessages,
  sendChatMessage,
  getActiveAnnouncement,
  checkIn,
  getCheckInStatus,
} from "@/lib/support.functions";

export function SupportChatWidget() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const qc = useQueryClient();
  const scrollRef = useRef<HTMLDivElement>(null);

  const listThreadsFn = useServerFn(listThreads);
  const createThreadFn = useServerFn(createThread);
  const deleteThreadFn = useServerFn(deleteThread);
  const listMessagesFn = useServerFn(listMessages);
  const sendChatFn = useServerFn(sendChatMessage);
  const announcementFn = useServerFn(getActiveAnnouncement);
  const checkInFn = useServerFn(checkIn);
  const checkInStatusFn = useServerFn(getCheckInStatus);

  const announcement = useQuery({
    queryKey: ["support", "announcement"],
    queryFn: () => announcementFn(),
    enabled: open,
  });
  const threads = useQuery({
    queryKey: ["support", "threads"],
    queryFn: () => listThreadsFn(),
    enabled: open && !!user,
  });
  const messages = useQuery({
    queryKey: ["support", "messages", activeId],
    queryFn: () => listMessagesFn({ data: { threadId: activeId! } }),
    enabled: open && !!activeId,
  });
  const checkin = useQuery({
    queryKey: ["support", "checkin"],
    queryFn: () => checkInStatusFn(),
    enabled: open && !!user,
  });

  // Auto-select first thread or create one
  useEffect(() => {
    if (!open || !user) return;
    if (threads.data && threads.data.length > 0 && !activeId) {
      setActiveId(threads.data[0].id);
    }
  }, [open, user, threads.data, activeId]);

  // Scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.data]);

  const newThreadMut = useMutation({
    mutationFn: () => createThreadFn(),
    onSuccess: (t) => {
      qc.invalidateQueries({ queryKey: ["support", "threads"] });
      setActiveId(t.id);
    },
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteThreadFn({ data: { threadId: id } }),
    onSuccess: (_d, id) => {
      qc.invalidateQueries({ queryKey: ["support", "threads"] });
      if (activeId === id) setActiveId(null);
    },
  });
  const sendMut = useMutation({
    mutationFn: (text: string) =>
      sendChatFn({ data: { threadId: activeId!, message: text } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["support", "messages", activeId] });
      qc.invalidateQueries({ queryKey: ["support", "threads"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "傳送失敗"),
  });
  const checkInMut = useMutation({
    mutationFn: () => checkInFn(),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["support", "checkin"] });
      if (r.alreadyCheckedIn) toast.info(`今天已打卡，累積 ${r.totalDays} 天`);
      else toast.success(`打卡成功！累積 ${r.totalDays} 天 🎉`);
    },
  });

  const handleSend = async () => {
    const text = input.trim();
    if (!text || sendMut.isPending) return;
    if (!activeId) {
      const t = await createThreadFn();
      qc.invalidateQueries({ queryKey: ["support", "threads"] });
      setActiveId(t.id);
      setInput("");
      sendMut.mutate(text);
      return;
    }
    setInput("");
    sendMut.mutate(text);
  };

  const optimisticMessages = useMemo(() => {
    const list = messages.data ?? [];
    if (sendMut.isPending && sendMut.variables) {
      return [
        ...list,
        { id: "opt-u", role: "user" as const, content: sendMut.variables, created_at: new Date().toISOString() },
        { id: "opt-a", role: "assistant" as const, content: "__typing__", created_at: new Date().toISOString() },
      ];
    }
    return list;
  }, [messages.data, sendMut.isPending, sendMut.variables]);

  return (
    <>
      {/* Floating launcher */}
      <button
        onClick={() => setOpen(true)}
        aria-label="開啟源晶小幫手"
        className="fixed bottom-24 right-4 md:bottom-6 md:right-6 z-50 h-14 w-14 rounded-full bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-xl shadow-primary/40 flex items-center justify-center hover:scale-105 active:scale-95 transition"
      >
        <MessageCircle className="h-6 w-6" />
        <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-background" />
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="p-0 w-full sm:max-w-md md:max-w-2xl flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center gap-3 border-b px-4 py-3 shrink-0">
            <div className="h-9 w-9 rounded-full bg-gradient-to-br from-primary to-primary/60 text-primary-foreground flex items-center justify-center">
              <Bot className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold">源晶小幫手</div>
              <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                AI 線上中
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setOpen(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Announcement */}
          {announcement.data && (
            <div className="mx-3 mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs">
              <div className="flex items-center gap-2 font-medium text-amber-700 dark:text-amber-300">
                <Megaphone className="h-3.5 w-3.5" />
                {announcement.data.title}
              </div>
              <div className="mt-1 text-muted-foreground whitespace-pre-wrap">
                {announcement.data.content}
              </div>
            </div>
          )}

          {!user ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6 text-center">
              <Bot className="h-10 w-10 text-muted-foreground" />
              <div className="text-sm text-muted-foreground">
                請先登入會員，即可使用源晶小幫手、打卡與保存對話紀錄。
              </div>
              <Button asChild>
                <Link to="/login">前往登入</Link>
              </Button>
            </div>
          ) : (
            <div className="flex-1 grid grid-cols-1 md:grid-cols-[180px_1fr] min-h-0">
              {/* Thread list */}
              <div className="border-b md:border-b-0 md:border-r flex flex-col min-h-0">
                <div className="p-2 flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => newThreadMut.mutate()}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" /> 新對話
                  </Button>
                  <Button
                    size="sm"
                    variant={checkin.data?.checkedInToday ? "secondary" : "default"}
                    onClick={() => checkInMut.mutate()}
                    disabled={checkInMut.isPending}
                    title="每日打卡"
                  >
                    <CalendarCheck className="h-3.5 w-3.5 mr-1" />
                    {checkin.data?.checkedInToday ? "已打卡" : "打卡"}
                  </Button>
                </div>
                <ScrollArea className="flex-1">
                  <div className="px-2 pb-2 space-y-1">
                    {(threads.data ?? []).map((t) => (
                      <div
                        key={t.id}
                        className={`group flex items-center gap-1 rounded-md px-2 py-1.5 text-xs cursor-pointer ${
                          activeId === t.id ? "bg-accent" : "hover:bg-accent/50"
                        }`}
                        onClick={() => setActiveId(t.id)}
                      >
                        <span className="flex-1 truncate">{t.title}</span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteMut.mutate(t.id);
                          }}
                          className="opacity-0 group-hover:opacity-100 p-1 hover:text-destructive"
                          aria-label="刪除對話"
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                    {(threads.data ?? []).length === 0 && (
                      <div className="text-[11px] text-muted-foreground px-2 py-4 text-center">
                        尚無對話，按上方「新對話」開始。
                      </div>
                    )}
                  </div>
                </ScrollArea>
                {checkin.data && (
                  <div className="border-t px-2 py-1.5 text-[10px] text-muted-foreground text-center">
                    累積打卡 <span className="font-semibold text-foreground">{checkin.data.totalDays}</span> 天
                  </div>
                )}
              </div>

              {/* Chat panel */}
              <div className="flex flex-col min-h-0">
                <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                  {optimisticMessages.length === 0 && (
                    <div className="text-center text-xs text-muted-foreground py-8">
                      您好！我是源晶小幫手 👋
                      <br />可詢問商品、訂單、會員或經銷相關問題。
                    </div>
                  )}
                  {optimisticMessages.map((m) => (
                    <div
                      key={m.id}
                      className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      {m.role === "user" ? (
                        <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-primary text-primary-foreground px-3 py-2 text-sm whitespace-pre-wrap">
                          {m.content}
                        </div>
                      ) : (
                        <div className="max-w-[90%] text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                          {m.content === "__typing__" ? (
                            <span className="inline-flex items-center gap-2 text-muted-foreground">
                              <Loader2 className="h-3.5 w-3.5 animate-spin" /> 小幫手思考中…
                            </span>
                          ) : (
                            m.content
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="border-t p-2 flex gap-2 shrink-0">
                  <Input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSend();
                      }
                    }}
                    placeholder="輸入訊息…"
                    disabled={sendMut.isPending}
                    autoFocus
                  />
                  <Button onClick={handleSend} disabled={sendMut.isPending || !input.trim()} size="icon">
                    {sendMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
