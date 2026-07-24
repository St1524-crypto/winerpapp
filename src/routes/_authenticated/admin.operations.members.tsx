import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { SearchSelect } from "@/components/ui/search-select";
import { toast } from "sonner";
import {
  grantParticipant,
  listParticipants,
  searchMembersForGrant,
  setParticipantActive,
} from "@/lib/operations.functions";

export const Route = createFileRoute("/_authenticated/admin/operations/members")({
  component: MembersPage,
});

function MembersPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listParticipants);
  const grantFn = useServerFn(grantParticipant);
  const toggleFn = useServerFn(setParticipantActive);
  const searchFn = useServerFn(searchMembersForGrant);
  const { data = [] } = useQuery({ queryKey: ["ops-participants"], queryFn: () => listFn({}) });

  const [userId, setUserId] = useState("");
  const [opRole, setOpRole] = useState<"manager" | "staff" | "assistant" | "collaborator">("staff");
  const [department, setDepartment] = useState("");
  const [keyword, setKeyword] = useState("");

  const { data: results = [], isFetching } = useQuery({
    queryKey: ["ops-member-search", keyword],
    queryFn: () => searchFn({ data: { keyword } }),
    staleTime: 30_000,
  });

  const options = useMemo(
    () =>
      (results as Array<{ user_id: string; label: string; hint?: string }>).map((r) => ({
        value: r.user_id,
        label: r.label,
        hint: r.hint,
        keywords: `${r.label} ${r.hint ?? ""}`,
      })),
    [results],
  );

  const grant = useMutation({
    mutationFn: () => grantFn({ data: { userId, opRole, department: department || null } }),
    onSuccess: () => {
      toast.success("已授權");
      setUserId("");
      setDepartment("");
      qc.invalidateQueries({ queryKey: ["ops-participants"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "授權失敗"),
  });

  const toggle = useMutation({
    mutationFn: (v: { id: string; isActive: boolean }) => toggleFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ops-participants"] }),
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>授權協作成員</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <div className="md:col-span-2 space-y-2">
            <Label>會員（可用姓名 / 手機 / 會員編號 / Email 搜尋）</Label>
            <Input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="輸入姓名、手機、會員編號或 Email"
            />
            <SearchSelect
              options={options}
              value={userId}
              onChange={setUserId}
              placeholder={isFetching ? "搜尋中…" : "從搜尋結果選擇會員"}
              searchPlaceholder="於結果中再篩選"
              emptyText={keyword ? "查無會員" : "請先輸入關鍵字"}
            />
            {userId && (
              <p className="text-xs text-muted-foreground font-mono break-all">User ID: {userId}</p>
            )}
          </div>
          <div>
            <Label>角色</Label>
            <Select value={opRole} onValueChange={(v) => setOpRole(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="manager">主管 manager</SelectItem>
                <SelectItem value="staff">員工 staff</SelectItem>
                <SelectItem value="assistant">助理 assistant</SelectItem>
                <SelectItem value="collaborator">協作 collaborator</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>部門 (可選)</Label>
            <Input value={department} onChange={(e) => setDepartment(e.target.value)} />
          </div>
          <div className="md:col-span-4">
            <Button disabled={!userId || grant.isPending} onClick={() => grant.mutate()}>授權加入</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>協作成員清單（{data.length}）</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader><TableRow>
              <TableHead>User ID</TableHead><TableHead>角色</TableHead><TableHead>部門</TableHead>
              <TableHead>狀態</TableHead><TableHead>建立時間</TableHead><TableHead>操作</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {data.map((p: any) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs">{p.user_id}</TableCell>
                  <TableCell>{p.op_role}</TableCell>
                  <TableCell>{p.department ?? "—"}</TableCell>
                  <TableCell>{p.is_active ? <Badge>啟用</Badge> : <Badge variant="secondary">停用</Badge>}</TableCell>
                  <TableCell className="text-xs">{new Date(p.created_at).toLocaleString()}</TableCell>
                  <TableCell>
                    <Button size="sm" variant="outline" onClick={() => toggle.mutate({ id: p.id, isActive: !p.is_active })}>
                      {p.is_active ? "停用" : "啟用"}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {data.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">尚無協作成員</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

