import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { assignTask, createTask, listAssignableUsers, listTasks, updateTaskStatus } from "@/lib/operations.functions";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UNASSIGNED = "__unassigned__";

export const Route = createFileRoute("/_authenticated/admin/operations/tasks")({
  component: TasksAdminPage,
});

function TasksAdminPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listTasks);
  const createFn = useServerFn(createTask);
  const assignFn = useServerFn(assignTask);
  const statusFn = useServerFn(updateTaskStatus);
  const usersFn = useServerFn(listAssignableUsers);

  const { data = [] } = useQuery({ queryKey: ["ops-tasks-admin"], queryFn: () => listFn({ data: {} }) });
  const { data: users = [] } = useQuery({ queryKey: ["ops-assignable-users"], queryFn: () => usersFn() });

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [priority, setPriority] = useState<"low" | "normal" | "high" | "urgent">("normal");
  const [dueAt, setDueAt] = useState("");

  const create = useMutation({
    mutationFn: () => {
      const id = assigneeId && assigneeId !== UNASSIGNED ? assigneeId : null;
      if (id && !UUID_RE.test(id)) throw new Error("指派對象格式錯誤，請從清單中選擇");
      return createFn({ data: { title, description, assigneeId: id, priority, dueAt: dueAt || null } });
    },
    onSuccess: () => { toast.success("任務已建立"); setTitle(""); setDescription(""); setAssigneeId(""); setDueAt(""); qc.invalidateQueries({ queryKey: ["ops-tasks-admin"] }); },
    onError: (e: any) => toast.error(e?.message ?? "建立失敗"),
  });

  const assign = useMutation({
    mutationFn: (v: { id: string; assigneeId: string | null }) => {
      if (v.assigneeId && !UUID_RE.test(v.assigneeId)) throw new Error("指派對象格式錯誤");
      return assignFn({ data: { id: v.id, assigneeId: v.assigneeId || null } });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ops-tasks-admin"] }),
    onError: (e: any) => toast.error(e?.message ?? "指派失敗"),
  });

  const setStatus = useMutation({
    mutationFn: (v: { id: string; status: any }) => statusFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ops-tasks-admin"] }),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>建立任務</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2"><Label>標題</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div className="md:col-span-2"><Label>說明</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} /></div>
          <div><Label>指派對象 User ID</Label><Input value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} placeholder="UUID" /></div>
          <div>
            <Label>優先級</Label>
            <Select value={priority} onValueChange={(v) => setPriority(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">低</SelectItem>
                <SelectItem value="normal">一般</SelectItem>
                <SelectItem value="high">高</SelectItem>
                <SelectItem value="urgent">緊急</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div><Label>到期時間</Label><Input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} /></div>
          <div className="md:col-span-2">
            <Button disabled={!title || create.isPending} onClick={() => create.mutate()}>建立任務</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>任務清單（{data.length}）</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>標題</TableHead><TableHead>狀態</TableHead><TableHead>優先級</TableHead>
              <TableHead>指派</TableHead><TableHead>到期</TableHead><TableHead>操作</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {data.map((t: any) => (
                <TableRow key={t.id}>
                  <TableCell className="max-w-xs"><div className="font-medium">{t.title}</div><div className="text-xs text-muted-foreground line-clamp-2">{t.description}</div></TableCell>
                  <TableCell><Badge variant={t.status === "completed" ? "default" : "secondary"}>{t.status}</Badge></TableCell>
                  <TableCell>{t.priority}</TableCell>
                  <TableCell className="font-mono text-xs">{t.assignee_id ?? "—"}</TableCell>
                  <TableCell className="text-xs">{t.due_at ? new Date(t.due_at).toLocaleString() : "—"}</TableCell>
                  <TableCell className="space-x-1">
                    <Button size="sm" variant="outline" onClick={() => {
                      const v = prompt("指派 User ID（留空取消指派）", t.assignee_id ?? "");
                      if (v !== null) assign.mutate({ id: t.id, assigneeId: v });
                    }}>指派</Button>
                    <Select value={t.status} onValueChange={(v) => setStatus.mutate({ id: t.id, status: v })}>
                      <SelectTrigger className="inline-flex w-32"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">待處理</SelectItem>
                        <SelectItem value="in_progress">進行中</SelectItem>
                        <SelectItem value="submitted">已回報</SelectItem>
                        <SelectItem value="completed">已完成</SelectItem>
                        <SelectItem value="cancelled">取消</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              ))}
              {data.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">尚無任務</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
