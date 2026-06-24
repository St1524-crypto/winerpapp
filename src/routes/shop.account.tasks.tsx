import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { listTasks, submitTaskReport, updateTaskStatus } from "@/lib/operations.functions";

export const Route = createFileRoute("/shop/account/tasks")({
  component: MyTasksPage,
});

function MyTasksPage() {
  const qc = useQueryClient();
  const fn = useServerFn(listTasks);
  const reportFn = useServerFn(submitTaskReport);
  const statusFn = useServerFn(updateTaskStatus);
  const { data = [] } = useQuery({ queryKey: ["my-ops-tasks-list"], queryFn: () => fn({ data: { scope: "mine" } }) });
  const [openId, setOpenId] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [snap, setSnap] = useState<"in_progress" | "submitted" | "completed">("submitted");

  const submit = useMutation({
    mutationFn: () => reportFn({ data: { taskId: openId!, content, statusSnapshot: snap } }),
    onSuccess: () => { toast.success("已回報"); setOpenId(null); setContent(""); qc.invalidateQueries({ queryKey: ["my-ops-tasks-list"] }); },
    onError: (e: any) => toast.error(e?.message ?? "回報失敗"),
  });

  const setStatus = useMutation({
    mutationFn: (v: { id: string; status: any }) => statusFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-ops-tasks-list"] }),
  });

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">我的任務</h2>
      {data.length === 0 && <p className="text-sm text-muted-foreground">沒有任務</p>}
      {data.map((t: any) => (
        <Card key={t.id}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center justify-between">
              <span>{t.title}</span>
              <Badge variant={t.status === "completed" ? "default" : "secondary"}>{t.status}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="text-muted-foreground whitespace-pre-wrap">{t.description ?? "—"}</p>
            <div className="text-xs text-muted-foreground">優先級：{t.priority} · 到期：{t.due_at ? new Date(t.due_at).toLocaleString() : "—"}</div>
            <div className="flex flex-wrap gap-2 pt-2">
              {t.status !== "in_progress" && t.status !== "completed" && (
                <Button size="sm" variant="outline" onClick={() => setStatus.mutate({ id: t.id, status: "in_progress" })}>開始進行</Button>
              )}
              <Button size="sm" onClick={() => { setOpenId(openId === t.id ? null : t.id); setContent(""); }}>{openId === t.id ? "取消" : "回報進度"}</Button>
            </div>
            {openId === t.id && (
              <div className="space-y-2 border-t pt-3 mt-2">
                <Textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="輸入回報內容…" />
                <div className="flex items-center gap-2">
                  <Select value={snap} onValueChange={(v) => setSnap(v as any)}>
                    <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="in_progress">進行中</SelectItem>
                      <SelectItem value="submitted">已回報</SelectItem>
                      <SelectItem value="completed">已完成</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button size="sm" disabled={!content || submit.isPending} onClick={() => submit.mutate()}>送出回報</Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
