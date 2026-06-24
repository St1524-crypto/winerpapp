import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { listAllAttendance } from "@/lib/operations.functions";

export const Route = createFileRoute("/_authenticated/admin/operations/attendance")({
  component: AttendanceAdminPage,
});

function AttendanceAdminPage() {
  const fn = useServerFn(listAllAttendance);
  const [date, setDate] = useState("");
  const { data = [] } = useQuery({
    queryKey: ["ops-attendance-admin", date],
    queryFn: () => fn({ data: { workDate: date || undefined } }),
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>打卡紀錄</CardTitle>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-48 mt-2" />
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow>
            <TableHead>會員</TableHead><TableHead>類型</TableHead><TableHead>打卡時間</TableHead><TableHead>工作日</TableHead><TableHead>備註</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {data.map((a: any) => (
              <TableRow key={a.id}>
                <TableCell className="font-mono text-xs">{a.user_id}</TableCell>
                <TableCell><Badge variant={a.log_type === "check_in" ? "default" : "secondary"}>{a.log_type === "check_in" ? "上班" : "下班"}</Badge></TableCell>
                <TableCell className="text-xs">{new Date(a.logged_at).toLocaleString()}</TableCell>
                <TableCell className="text-xs">{a.work_date}</TableCell>
                <TableCell className="text-xs">{a.note ?? "—"}</TableCell>
              </TableRow>
            ))}
            {data.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">無紀錄</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
