import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileClock, Filter, RotateCw, Download } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { ForbiddenScreen } from "@/components/ForbiddenScreen";
import { listAuditLogs, getAuditFacets } from "@/lib/audit.functions";

export const Route = createFileRoute("/_authenticated/admin/audit-logs")({
  head: () => ({
    meta: [
      { title: "稽核紀錄 — 源倍力 ERP" },
      { name: "description", content: "系統重要操作的稽核軌跡，僅限管理員與財務角色檢視。" },
    ],
  }),
  component: AuditLogsPage,
});

function AuditLogsPage() {
  const { roles } = useAuth();
  const allowed = roles.includes("super_admin") || roles.includes("finance");

  const [entity, setEntity] = useState<string>("");
  const [action, setAction] = useState<string>("");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");

  const facets = useQuery({
    queryKey: ["audit-facets"],
    queryFn: () => getAuditFacets(),
    enabled: allowed,
  });

  const params = useMemo(
    () => ({
      entity: entity || undefined,
      action: action || undefined,
      from: from ? new Date(from).toISOString() : undefined,
      to: to ? new Date(to).toISOString() : undefined,
      limit: 200,
    }),
    [entity, action, from, to],
  );

  const logs = useQuery({
    queryKey: ["audit-logs", params],
    queryFn: () => listAuditLogs({ data: params }),
    enabled: allowed,
  });

  if (!allowed) {
    return <ForbiddenScreen requiredRoles={["super_admin", "finance"]} pageName="稽核紀錄" />;
  }

  function reset() {
    setEntity("");
    setAction("");
    setFrom("");
    setTo("");
  }

  function exportCsv() {
    const rows = logs.data ?? [];
    const header = ["時間", "使用者", "Email", "Entity", "EntityID", "Action", "Metadata"];
    const csv = [
      header.join(","),
      ...rows.map((r) =>
        [
          new Date(r.created_at).toISOString(),
          r.user?.name ?? "",
          r.user?.email ?? "",
          r.entity,
          r.entity_id ?? "",
          r.action,
          JSON.stringify(r.metadata ?? {}).replace(/"/g, '""'),
        ]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(","),
      ),
    ].join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <FileClock className="h-6 w-6 text-primary" />
            稽核紀錄
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            記錄使用者對重要實體（user_2fa、orders、permissions 等）所執行的操作軌跡。
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={exportCsv} disabled={!logs.data?.length}>
          <Download className="h-4 w-4 mr-2" /> 匯出 CSV
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="h-4 w-4" /> 篩選條件
          </CardTitle>
          <CardDescription>選擇實體類型、動作或時間範圍進行過濾</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">實體 (Entity)</Label>
            <Select value={entity || "__all"} onValueChange={(v) => setEntity(v === "__all" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="全部" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">全部</SelectItem>
                {facets.data?.entities.map((e) => (
                  <SelectItem key={e} value={e}>{e}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">動作 (Action)</Label>
            <Select value={action || "__all"} onValueChange={(v) => setAction(v === "__all" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="全部" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">全部</SelectItem>
                {facets.data?.actions.map((a) => (
                  <SelectItem key={a} value={a}>{a}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">起始時間</Label>
            <Input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">結束時間</Label>
            <Input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="flex items-end gap-2">
            <Button variant="outline" className="flex-1" onClick={reset}>
              <RotateCw className="h-4 w-4 mr-2" /> 重設
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">
            結果 <span className="text-muted-foreground font-normal text-sm">({logs.data?.length ?? 0} 筆)</span>
          </CardTitle>
          {logs.isFetching && <Badge variant="outline" className="text-xs">載入中...</Badge>}
        </CardHeader>
        <CardContent>
          {logs.isLoading ? (
            <div className="text-muted-foreground text-sm py-8 text-center">載入中...</div>
          ) : !logs.data?.length ? (
            <div className="text-muted-foreground text-sm py-8 text-center">尚無符合條件的紀錄</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">時間</TableHead>
                    <TableHead>使用者</TableHead>
                    <TableHead>實體</TableHead>
                    <TableHead>動作</TableHead>
                    <TableHead>Entity ID</TableHead>
                    <TableHead>Metadata</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.data.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="text-xs whitespace-nowrap">
                        {new Date(l.created_at).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-xs">
                        <div className="font-medium">{l.user?.name ?? "—"}</div>
                        <div className="text-muted-foreground">{l.user?.email ?? l.user_id ?? "—"}</div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono text-xs">{l.entity}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className="bg-primary/15 text-primary border-primary/30 font-mono text-xs">{l.action}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-[11px] text-muted-foreground max-w-[180px] truncate" title={l.entity_id ?? ""}>
                        {l.entity_id ?? "—"}
                      </TableCell>
                      <TableCell className="font-mono text-[11px] text-muted-foreground max-w-[280px] truncate"
                        title={JSON.stringify(l.metadata ?? {})}>
                        {Object.keys(l.metadata ?? {}).length ? JSON.stringify(l.metadata) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
