import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getMyParticipantStatus, listTasks } from "@/lib/operations.functions";
import { ClipboardList, Clock, ShieldAlert } from "lucide-react";

export const Route = createFileRoute("/shop/account/workbench")({
  component: WorkbenchPage,
});

function WorkbenchPage() {
  const statusFn = useServerFn(getMyParticipantStatus);
  const tasksFn = useServerFn(listTasks);
  const { data: participant, isLoading } = useQuery({ queryKey: ["my-ops-status"], queryFn: () => statusFn({}) });
  const { data: tasks = [] } = useQuery({
    queryKey: ["my-ops-tasks"],
    queryFn: () => tasksFn({ data: { scope: "mine" } }),
    enabled: !!participant,
  });

  if (isLoading) return <p className="text-sm text-muted-foreground">載入中…</p>;

  if (!participant) {
    return (
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><ShieldAlert className="h-4 w-4" /> 尚未授權</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          您目前不是營運協作成員。請聯絡管理員授權後即可使用工作台、任務與打卡功能。
        </CardContent>
      </Card>
    );
  }

  const pending = tasks.filter((t: any) => t.status === "pending" || t.status === "in_progress").length;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>我的工作台</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div>角色：<b>{participant.op_role}</b> · 部門：{participant.department ?? "—"}</div>
          <div>待處理任務：<b>{pending}</b> 件</div>
          <div className="flex gap-2 pt-2">
            <Button asChild size="sm"><Link to="/shop/account/tasks"><ClipboardList className="h-4 w-4 mr-1" />我的任務</Link></Button>
            <Button asChild size="sm" variant="outline"><Link to="/shop/account/attendance"><Clock className="h-4 w-4 mr-1" />上下班打卡</Link></Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
