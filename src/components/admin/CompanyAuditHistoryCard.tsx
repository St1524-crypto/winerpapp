import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { History, Loader2, RefreshCw, Search } from "lucide-react";

type AuditRow = {
  id: string;
  created_at: string;
  user_id: string | null;
  action: string;
  entity_id: string | null;
  metadata: Record<string, any> | null;
};
type ProfileRow = { id: string; name: string | null; email: string | null };

const ACTION_LABEL: Record<string, string> = {
  "company.create": "新增",
  "company.update_field": "更新欄位",
  "company.activate": "啟用",
  "company.deactivate": "停用",
  "company.delete": "刪除",
};
const ACTION_TONE: Record<string, string> = {
  "company.create": "bg-blue-500/15 text-blue-400 border-blue-500/30",
  "company.update_field": "bg-amber-500/15 text-amber-400 border-amber-500/30",
  "company.activate": "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  "company.deactivate": "bg-muted text-muted-foreground border-border",
  "company.delete": "bg-rose-500/15 text-rose-400 border-rose-500/30",
};

function fmtTime(iso: string) {
  try {
    return new Date(iso).toLocaleString("zh-TW", {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
  } catch { return iso; }
}

function Diff({ row }: { row: AuditRow }) {
  const m = row.metadata ?? {};
  if (row.action === "company.update_field") {
    return (
      <div className="text-xs">
        <span className="font-medium">{m.field_label ?? m.field ?? "欄位"}</span>
        <span className="mx-1 text-muted-foreground">:</span>
        <span className="line-through text-muted-foreground break-all">{String(m.old_value ?? "—")}</span>
        <span className="mx-1">→</span>
        <span className="text-foreground break-all">{String(m.new_value ?? "—")}</span>
      </div>
    );
  }
  if (row.action === "company.activate" || row.action === "company.deactivate") {
    return <div className="text-xs text-muted-foreground">狀態：{m.old_status ?? "—"} → {m.new_status ?? "—"}</div>;
  }
  if (row.action === "company.create") {
    return <div className="text-xs text-muted-foreground">建立公司，初始狀態：{m.initial_status ?? "active"}</div>;
  }
  if (row.action === "company.delete") {
    return <div className="text-xs text-muted-foreground">已刪除公司資料</div>;
  }
  return <div className="text-xs text-muted-foreground">—</div>;
}

export function CompanyAuditHistoryCard() {
  const [action, setAction] = useState<string>("all");
  const [keyword, setKeyword] = useState("");

  const q = useQuery({
    queryKey: ["company-audit-history"],
    queryFn: async () => {
      const { data: logs, error } = await supabase
        .from("audit_logs")
        .select("id, created_at, user_id, action, entity_id, metadata")
        .eq("entity", "companies")
        .like("action", "company.%")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;

      const userIds = Array.from(new Set((logs ?? []).map((l) => l.user_id).filter(Boolean) as string[]));
      let profiles: ProfileRow[] = [];
      if (userIds.length > 0) {
        const { data: profs } = await supabase
          .from("profiles").select("id, name, email").in("id", userIds);
        profiles = (profs ?? []) as ProfileRow[];
      }
      const map = new Map(profiles.map((p) => [p.id, p]));
      return (logs ?? []).map((l) => ({
        ...l,
        actor: l.user_id ? map.get(l.user_id) ?? null : null,
      })) as (AuditRow & { actor: ProfileRow | null })[];
    },
  });

  const filtered = useMemo(() => {
    const list = q.data ?? [];
    const kw = keyword.trim().toLowerCase();
    return list.filter((r) => {
      if (action !== "all" && r.action !== action) return false;
      if (!kw) return true;
      const m = r.metadata ?? {};
      const hay = [
        m.company_name, r.actor?.name, r.actor?.email,
        m.field_label, m.old_value, m.new_value,
      ].filter(Boolean).map(String).join(" ").toLowerCase();
      return hay.includes(kw);
    });
  }, [q.data, keyword, action]);

  return (
    <Card className="bg-card/60 backdrop-blur border-border/60">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 space-y-0">
        <CardTitle className="text-base flex items-center gap-2">
          <History className="h-4 w-4 text-primary" /> 公司資料異動紀錄
          {q.data && <Badge variant="outline" className="ml-1 text-xs">{q.data.length}</Badge>}
        </CardTitle>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={action} onValueChange={setAction}>
            <SelectTrigger className="h-9 w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部動作</SelectItem>
              <SelectItem value="company.create">新增</SelectItem>
              <SelectItem value="company.update_field">更新欄位</SelectItem>
              <SelectItem value="company.activate">啟用</SelectItem>
              <SelectItem value="company.deactivate">停用</SelectItem>
              <SelectItem value="company.delete">刪除</SelectItem>
            </SelectContent>
          </Select>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={keyword} onChange={(e) => setKeyword(e.target.value)}
              placeholder="搜尋公司/使用者/欄位"
              className="h-9 pl-7 w-[220px]"
            />
          </div>
          <Button size="sm" variant="outline" onClick={() => q.refetch()} disabled={q.isFetching}>
            {q.isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {q.isLoading ? (
          <div className="py-10 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>
        ) : q.isError ? (
          <div className="py-10 text-center text-sm text-destructive">載入失敗：{(q.error as any)?.message ?? "未知錯誤"}</div>
        ) : filtered.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">尚無紀錄</div>
        ) : (
          <div className="overflow-x-auto -mx-2 sm:mx-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-[160px]">時間</TableHead>
                  <TableHead className="min-w-[160px]">操作者</TableHead>
                  <TableHead className="min-w-[110px]">動作</TableHead>
                  <TableHead className="min-w-[160px]">公司</TableHead>
                  <TableHead className="min-w-[260px]">變更內容</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => {
                  const m = r.metadata ?? {};
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{fmtTime(r.created_at)}</TableCell>
                      <TableCell className="text-xs">
                        <div className="font-medium">{r.actor?.name ?? r.actor?.email ?? "—"}</div>
                        {r.actor?.email && r.actor?.name && (
                          <div className="text-[10px] text-muted-foreground break-all">{r.actor.email}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={ACTION_TONE[r.action] ?? "bg-muted"}>
                          {ACTION_LABEL[r.action] ?? r.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        <div className="font-medium break-all">{m.company_name ?? "—"}</div>
                        <div className="text-[10px] text-muted-foreground font-mono break-all">{r.entity_id?.slice(0, 8) ?? ""}</div>
                      </TableCell>
                      <TableCell><Diff row={r} /></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
