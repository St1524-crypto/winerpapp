import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listMyAttendance, punchAttendance } from "@/lib/operations.functions";
import { toast } from "sonner";
import { LogIn, LogOut } from "lucide-react";

export const Route = createFileRoute("/shop/account/attendance")({
  component: MyAttendancePage,
});

function MyAttendancePage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listMyAttendance);
  const punchFn = useServerFn(punchAttendance);
  const { data = [] } = useQuery({ queryKey: ["my-att"], queryFn: () => listFn({}) });

  const punch = useMutation({
    mutationFn: (logType: "check_in" | "check_out") => punchFn({ data: { logType } }),
    onSuccess: (_d, v) => { toast.success(v === "check_in" ? "上班打卡完成" : "下班打卡完成"); qc.invalidateQueries({ queryKey: ["my-att"] }); },
    onError: (e: any) => toast.error(e?.message ?? "打卡失敗，請確認是否為協作成員"),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>上下班打卡</CardTitle></CardHeader>
        <CardContent className="flex gap-2">
          <Button onClick={() => punch.mutate("check_in")} disabled={punch.isPending}><LogIn className="h-4 w-4 mr-1" />上班打卡</Button>
          <Button onClick={() => punch.mutate("check_out")} variant="outline" disabled={punch.isPending}><LogOut className="h-4 w-4 mr-1" />下班打卡</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>我的打卡紀錄</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow><TableHead>類型</TableHead><TableHead>時間</TableHead><TableHead>工作日</TableHead></TableRow></TableHeader>
            <TableBody>
              {data.map((a: any) => (
                <TableRow key={a.id}>
                  <TableCell><Badge variant={a.log_type === "check_in" ? "default" : "secondary"}>{a.log_type === "check_in" ? "上班" : "下班"}</Badge></TableCell>
                  <TableCell className="text-xs">{new Date(a.logged_at).toLocaleString()}</TableCell>
                  <TableCell className="text-xs">{a.work_date}</TableCell>
                </TableRow>
              ))}
              {data.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">尚無紀錄</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
