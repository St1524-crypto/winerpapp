import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Search, Users, Filter, RotateCw, Loader2, UserCircle, Crown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type AppRole } from "@/hooks/use-auth";
import { ForbiddenScreen } from "@/components/ForbiddenScreen";
import { APP_ROLES } from "@/lib/admin-roles.functions";
import { ROLE_LABELS } from "@/lib/nav";

export const Route = createFileRoute("/_authenticated/admin/member-search")({
  head: () => ({
    meta: [
      { title: "進階會員查詢 — 源倍力 ERP" },
      { name: "description", content: "後台進階查詢：依角色、關鍵字、VIP 狀態多條件搜尋會員。" },
    ],
  }),
  component: MemberSearchPage,
});

const ROLE_TONES: Record<AppRole, string> = {
  super_admin: "bg-rose-500/15 text-rose-400 border-rose-500/30",
  admin: "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
  finance: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  warehouse: "bg-sky-500/15 text-sky-400 border-sky-500/30",
  sales: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  vendor: "bg-violet-500/15 text-violet-400 border-violet-500/30",
  member: "bg-muted text-muted-foreground border-border",
};

type Row = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  member_no: string | null;
  created_at: string;
  is_vip: boolean | null;
  vip_expires_at: string | null;
  roles: AppRole[];
};

type RoleMode = "any" | "all" | "none";
type VipFilter = "all" | "vip" | "non_vip" | "expiring";

function MemberSearchPage() {
  const { roles: myRoles } = useAuth();
  const isAdmin = myRoles.includes("super_admin") || myRoles.includes("admin");

  const [list, setList] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedRoles, setSelectedRoles] = useState<Set<AppRole>>(new Set());
  const [roleMode, setRoleMode] = useState<RoleMode>("any");
  const [vip, setVip] = useState<VipFilter>("all");

  async function load() {
    setLoading(true);
    const [{ data: profiles, error: e1 }, { data: rolesData, error: e2 }] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, name, email, phone, member_no, created_at, is_vip, vip_expires_at")
        .order("created_at", { ascending: false }),
      supabase.from("user_roles").select("user_id, role"),
    ]);
    if (e1 || e2) {
      toast.error(e1?.message ?? e2?.message ?? "載入失敗");
      setLoading(false);
      return;
    }
    const rolesMap = new Map<string, AppRole[]>();
    (rolesData ?? []).forEach((r: any) => {
      const arr = rolesMap.get(r.user_id) ?? [];
      arr.push(r.role as AppRole);
      rolesMap.set(r.user_id, arr);
    });
    setList(
      (profiles ?? []).map((p: any) => ({
        ...p,
        roles: rolesMap.get(p.id) ?? [],
      })),
    );
    setLoading(false);
  }

  useEffect(() => {
    if (isAdmin) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  function toggleRole(r: AppRole) {
    setSelectedRoles((prev) => {
      const next = new Set(prev);
      if (next.has(r)) next.delete(r);
      else next.add(r);
      return next;
    });
  }

  function resetFilters() {
    setSearch("");
    setSelectedRoles(new Set());
    setRoleMode("any");
    setVip("all");
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const sel = [...selectedRoles];
    const now = Date.now();
    const in30d = now + 30 * 24 * 60 * 60 * 1000;
    return list.filter((m) => {
      // keyword
      if (q) {
        const hay = `${m.name ?? ""} ${m.email ?? ""} ${m.phone ?? ""} ${m.member_no ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      // role filter
      if (sel.length > 0) {
        if (roleMode === "any" && !sel.some((r) => m.roles.includes(r))) return false;
        if (roleMode === "all" && !sel.every((r) => m.roles.includes(r))) return false;
        if (roleMode === "none" && sel.some((r) => m.roles.includes(r))) return false;
      }
      // vip filter
      if (vip !== "all") {
        const exp = m.vip_expires_at ? Date.parse(m.vip_expires_at) : null;
        const isVipActive = !!m.is_vip && (exp == null || exp > now);
        if (vip === "vip" && !isVipActive) return false;
        if (vip === "non_vip" && isVipActive) return false;
        if (vip === "expiring") {
          if (!isVipActive || exp == null || exp > in30d) return false;
        }
      }
      return true;
    });
  }, [list, search, selectedRoles, roleMode, vip]);

  const roleCounts = useMemo(() => {
    const m = new Map<AppRole, number>();
    APP_ROLES.forEach((r) => m.set(r, 0));
    list.forEach((u) => u.roles.forEach((r) => m.set(r, (m.get(r) ?? 0) + 1)));
    return m;
  }, [list]);

  if (!isAdmin) {
    return <ForbiddenScreen requiredRoles={["super_admin", "admin"]} pageName="進階會員查詢" />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Search className="h-6 w-6 text-primary" />
            進階會員查詢
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            依角色、關鍵字、VIP 狀態組合條件，快速定位特定會員。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={resetFilters}>
            <RotateCw className="h-4 w-4 mr-2" />重設條件
          </Button>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RotateCw className="h-4 w-4 mr-2" />}
            重新整理
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="h-4 w-4" /> 查詢條件
          </CardTitle>
          <CardDescription className="text-xs">勾選的條件以 AND 組合，角色內部可選擇 包含任一 / 全部包含 / 皆不包含。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1.5 md:col-span-2">
              <Label className="text-xs">關鍵字（姓名 / Email / 電話 / 會員編號）</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="輸入關鍵字..."
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">VIP 狀態</Label>
              <Select value={vip} onValueChange={(v) => setVip(v as VipFilter)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部</SelectItem>
                  <SelectItem value="vip">VIP（有效中）</SelectItem>
                  <SelectItem value="non_vip">非 VIP</SelectItem>
                  <SelectItem value="expiring">30 天內到期</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <Label className="text-xs">角色篩選</Label>
              <Select value={roleMode} onValueChange={(v) => setRoleMode(v as RoleMode)}>
                <SelectTrigger className="h-8 w-[160px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">包含任一所選角色</SelectItem>
                  <SelectItem value="all">全部包含所選角色</SelectItem>
                  <SelectItem value="none">皆不包含所選角色</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-wrap gap-2">
              {APP_ROLES.map((r) => {
                const checked = selectedRoles.has(r);
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => toggleRole(r)}
                    className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
                      checked ? `${ROLE_TONES[r]} ring-1 ring-primary/40` : "bg-background border-border hover:bg-accent"
                    }`}
                  >
                    <Checkbox checked={checked} className="h-3.5 w-3.5 pointer-events-none" />
                    <span>{ROLE_LABELS[r]}</span>
                    <Badge variant="outline" className="text-[10px]">{roleCounts.get(r) ?? 0}</Badge>
                  </button>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" />
            查詢結果（{filtered.length} / {list.length}）
          </CardTitle>
          {loading && <Badge variant="outline" className="text-xs">載入中...</Badge>}
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground text-sm">載入中...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">沒有符合條件的會員</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[220px]">會員</TableHead>
                    <TableHead>會員編號</TableHead>
                    <TableHead>電話</TableHead>
                    <TableHead>角色</TableHead>
                    <TableHead>VIP</TableHead>
                    <TableHead>建立時間</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((m) => {
                    const exp = m.vip_expires_at ? new Date(m.vip_expires_at) : null;
                    const isVipActive = !!m.is_vip && (!exp || exp.getTime() > Date.now());
                    return (
                      <TableRow key={m.id}>
                        <TableCell>
                          <div className="flex items-center gap-2 min-w-0">
                            {m.roles.includes("super_admin") && <Crown className="h-3.5 w-3.5 text-amber-400 shrink-0" />}
                            <UserCircle className="h-4 w-4 text-muted-foreground shrink-0" />
                            <div className="min-w-0">
                              <div className="text-sm font-medium truncate">{m.name ?? "—"}</div>
                              <div className="text-xs text-muted-foreground truncate">{m.email ?? "—"}</div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{m.member_no ?? "—"}</TableCell>
                        <TableCell className="text-xs">{m.phone ?? "—"}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {m.roles.length === 0 ? (
                              <span className="text-xs text-muted-foreground">—</span>
                            ) : (
                              m.roles.map((r) => (
                                <Badge key={r} variant="outline" className={`text-[10px] ${ROLE_TONES[r]}`}>
                                  {ROLE_LABELS[r]}
                                </Badge>
                              ))
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {isVipActive ? (
                            <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 text-[10px]">
                              VIP{exp ? ` · ${exp.toISOString().slice(0, 10)}` : ""}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs whitespace-nowrap">
                          {new Date(m.created_at).toISOString().slice(0, 10)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button asChild size="sm" variant="ghost">
                            <Link to="/members">前往管理</Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
