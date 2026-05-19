import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ShieldCheck, Search, Users, Save, RotateCw, Loader2, LogOut, Crown,
  KeyRound, Filter, CheckCheck, AlertTriangle,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/hooks/use-auth";
import { ForbiddenScreen } from "@/components/ForbiddenScreen";
import {
  APP_ROLES, type AppRole,
  listUsersWithRoles, batchUpdateRoles, forceSignOutUser,
} from "@/lib/admin-roles.functions";

export const Route = createFileRoute("/_authenticated/admin/role-manager")({
  head: () => ({
    meta: [
      { title: "角色批次管理 — 源倍力 ERP" },
      { name: "description", content: "Super Admin 控制面板：批次調整使用者角色並即時套用。" },
    ],
  }),
  component: RoleManagerPage,
});

const ROLE_LABELS: Record<AppRole, string> = {
  super_admin: "超級管理員",
  finance: "財務",
  warehouse: "倉儲",
  sales: "業務",
  vendor: "廠商",
  member: "一般會員",
};

const ROLE_TONES: Record<AppRole, string> = {
  super_admin: "bg-rose-500/15 text-rose-400 border-rose-500/30",
  finance: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  warehouse: "bg-sky-500/15 text-sky-400 border-sky-500/30",
  sales: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  vendor: "bg-violet-500/15 text-violet-400 border-violet-500/30",
  member: "bg-muted text-muted-foreground border-border",
};

type DraftMap = Record<string, Set<AppRole>>;

function RoleManagerPage() {
  const { roles, user: me } = useAuth();
  const isAdmin = roles.includes("super_admin");
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<AppRole | "__all">("__all");
  const [draft, setDraft] = useState<DraftMap>({});
  const [signOutTarget, setSignOutTarget] = useState<{ id: string; email: string | null } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const params = useMemo(
    () => ({
      search: search.trim() || undefined,
      role: roleFilter === "__all" ? undefined : roleFilter,
      limit: 200,
    }),
    [search, roleFilter],
  );

  const usersQ = useQuery({
    queryKey: ["admin-users", params],
    queryFn: () => listUsersWithRoles({ data: params }),
    enabled: isAdmin,
  });

  // Effective roles for a user — draft if present, otherwise server value
  function effectiveRoles(userId: string, serverRoles: AppRole[]): Set<AppRole> {
    return draft[userId] ?? new Set(serverRoles);
  }

  function toggleRole(userId: string, serverRoles: AppRole[], role: AppRole) {
    setDraft((prev) => {
      const cur = new Set(prev[userId] ?? serverRoles);
      if (cur.has(role)) cur.delete(role);
      else cur.add(role);
      return { ...prev, [userId]: cur };
    });
  }

  const changes = useMemo(() => {
    const out: { userId: string; add: AppRole[]; remove: AppRole[] }[] = [];
    for (const u of usersQ.data ?? []) {
      const next = draft[u.id];
      if (!next) continue;
      const before = new Set(u.roles);
      const add = [...next].filter((r) => !before.has(r));
      const remove = [...before].filter((r) => !next.has(r));
      if (add.length || remove.length) out.push({ userId: u.id, add, remove });
    }
    return out;
  }, [draft, usersQ.data]);

  const applyMut = useMutation({
    mutationFn: () => batchUpdateRoles({ data: { changes } }),
    onSuccess: (res) => {
      toast.success(`已套用：${res.affected} 名使用者（+${res.added} / −${res.removed}）`);
      setDraft({});
      setConfirmOpen(false);
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: (e: any) => {
      const msg = String(e?.message ?? "");
      if (msg.includes("SUPER_ADMIN_ZERO")) {
        toast.error("套用後系統將沒有任何超級管理員，已由伺服器拒絕寫入。", {
          description: msg.replace(/^.*SUPER_ADMIN_ZERO:\s*/, ""),
        });
      } else {
        toast.error(msg || "套用失敗");
      }
    },
  });

  // Super admin impact analysis
  const superAdminImpact = useMemo(() => {
    const users = usersQ.data ?? [];
    const before = users.filter((u) => u.roles.includes("super_admin")).length;
    let after = before;
    let selfDemoting = false;
    for (const c of changes) {
      if (c.add.includes("super_admin")) after += 1;
      if (c.remove.includes("super_admin")) {
        after -= 1;
        if (c.userId === me?.id) selfDemoting = true;
      }
    }
    return { before, after, selfDemoting, willBeZero: after <= 0 };
  }, [changes, usersQ.data, me?.id]);

  const signOutMut = useMutation({
    mutationFn: (userId: string) => forceSignOutUser({ data: { userId } }),
    onSuccess: () => {
      toast.success("已強制該使用者登出所有裝置");
      setSignOutTarget(null);
    },
    onError: (e: any) => toast.error(e.message ?? "失敗"),
  });

  if (!isAdmin) {
    return <ForbiddenScreen requiredRoles={["super_admin"]} pageName="角色批次管理" />;
  }

  const pendingCount = changes.length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
            角色批次管理
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            勾選或取消勾選欄位即可暫存草稿，按「套用變更」後一次性寫入並即時生效。
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setDraft({})}
            disabled={pendingCount === 0 || applyMut.isPending}
          >
            <RotateCw className="h-4 w-4 mr-2" /> 取消草稿
          </Button>
          <Button
            className="bg-gradient-primary"
            onClick={() => setConfirmOpen(true)}
            disabled={pendingCount === 0 || applyMut.isPending}
          >
            {applyMut.isPending
              ? <Loader2 className="h-4 w-4 animate-spin mr-2" />
              : <Save className="h-4 w-4 mr-2" />}
            套用變更 {pendingCount > 0 && <Badge className="ml-2 bg-background/30">{pendingCount}</Badge>}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="h-4 w-4" /> 篩選使用者
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-1.5 md:col-span-2">
            <Label className="text-xs">搜尋姓名或 Email</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="輸入姓名或 email..."
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">角色</Label>
            <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as AppRole | "__all")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all">全部角色</SelectItem>
                {APP_ROLES.map((r) => (
                  <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Pending changes preview */}
      {pendingCount > 0 && (
        <Card className="border-primary/40 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <CheckCheck className="h-4 w-4 text-primary" />
              待套用 {pendingCount} 項變更
            </CardTitle>
            <CardDescription className="text-xs">
              將於按下「套用變更」後一次性寫入資料庫並即時生效。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2 text-xs">
              {changes.map((c) => {
                const u = usersQ.data?.find((x) => x.id === c.userId);
                return (
                  <div key={c.userId} className="rounded-md bg-background/60 border border-border px-2 py-1.5">
                    <div className="font-medium">{u?.name ?? u?.email ?? c.userId.slice(0, 8)}</div>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {c.add.map((r) => (
                        <Badge key={`a-${r}`} className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[10px]">+{ROLE_LABELS[r]}</Badge>
                      ))}
                      {c.remove.map((r) => (
                        <Badge key={`r-${r}`} className="bg-rose-500/15 text-rose-400 border-rose-500/30 text-[10px]">−{ROLE_LABELS[r]}</Badge>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Users table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4" /> 使用者 ({usersQ.data?.length ?? 0})
          </CardTitle>
          {usersQ.isFetching && <Badge variant="outline" className="text-xs">同步中...</Badge>}
        </CardHeader>
        <CardContent className="p-0">
          {usersQ.isLoading ? (
            <div className="p-8 text-center text-muted-foreground text-sm">載入中...</div>
          ) : !usersQ.data?.length ? (
            <div className="p-8 text-center text-muted-foreground text-sm">沒有符合條件的使用者</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[220px] sticky left-0 bg-background z-10">使用者</TableHead>
                    {APP_ROLES.map((r) => (
                      <TableHead key={r} className="text-center whitespace-nowrap">
                        <div className="text-xs">{ROLE_LABELS[r]}</div>
                      </TableHead>
                    ))}
                    <TableHead className="text-right whitespace-nowrap">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usersQ.data.map((u) => {
                    const eff = effectiveRoles(u.id, u.roles);
                    const dirty = !!draft[u.id];
                    const isMe = me?.id === u.id;
                    return (
                      <TableRow key={u.id} className={dirty ? "bg-primary/5" : ""}>
                        <TableCell className="sticky left-0 bg-background z-10">
                          <div className="flex items-center gap-2">
                            {u.roles.includes("super_admin") && (
                              <Crown className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                            )}
                            <div className="min-w-0">
                              <div className="font-medium text-sm truncate">{u.name ?? "—"}</div>
                              <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                            </div>
                            {isMe && <Badge variant="outline" className="text-[10px]">我</Badge>}
                            {dirty && <Badge className="text-[10px] bg-primary/15 text-primary border-primary/30">已修改</Badge>}
                          </div>
                        </TableCell>
                        {APP_ROLES.map((r) => {
                          const checked = eff.has(r);
                          const originally = u.roles.includes(r);
                          const changed = checked !== originally;
                          return (
                            <TableCell key={r} className="text-center">
                              <div className="flex flex-col items-center gap-1">
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={() => toggleRole(u.id, u.roles, r)}
                                />
                                {checked && (
                                  <span className={`text-[10px] rounded px-1 border ${changed ? "bg-primary/15 text-primary border-primary/40" : ROLE_TONES[r]}`}>
                                    {changed ? "新增" : "✓"}
                                  </span>
                                )}
                                {!checked && originally && (
                                  <span className="text-[10px] rounded px-1 border bg-rose-500/15 text-rose-400 border-rose-500/30">移除</span>
                                )}
                              </div>
                            </TableCell>
                          );
                        })}
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={isMe || signOutMut.isPending}
                            onClick={() => setSignOutTarget({ id: u.id, email: u.email })}
                            title={isMe ? "不可對自己執行" : "強制登出該使用者所有裝置"}
                          >
                            <LogOut className="h-3.5 w-3.5 mr-1" /> 強制登出
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

      {/* Confirm apply changes */}
      <AlertDialog open={confirmOpen} onOpenChange={(o) => !applyMut.isPending && setConfirmOpen(o)}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <CheckCheck className="h-5 w-5 text-primary" />
              確認套用 {pendingCount} 項角色變更？
            </AlertDialogTitle>
            <AlertDialogDescription>
              以下變更將一次性寫入資料庫並即時生效，被影響的使用者下次發送請求時即套用新權限。
            </AlertDialogDescription>
          </AlertDialogHeader>

          {/* Super admin warning */}
          {(superAdminImpact.willBeZero || superAdminImpact.selfDemoting) && (
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm space-y-1">
              <div className="flex items-center gap-2 font-medium text-destructive">
                <AlertTriangle className="h-4 w-4" /> 超級管理員警告
              </div>
              {superAdminImpact.willBeZero && (
                <p className="text-xs text-destructive/90">
                  套用後系統將沒有任何「超級管理員」（{superAdminImpact.before} → {superAdminImpact.after}）。
                  伺服器會擋下此次寫入以避免鎖死系統。
                </p>
              )}
              {superAdminImpact.selfDemoting && !superAdminImpact.willBeZero && (
                <p className="text-xs text-destructive/90">
                  您正在移除自己的「超級管理員」權限，套用後將無法再進入此頁面。
                </p>
              )}
            </div>
          )}

          {/* Change list */}
          <div className="max-h-[40vh] overflow-y-auto space-y-2 border rounded-md p-2 bg-muted/30">
            {changes.map((c) => {
              const u = usersQ.data?.find((x) => x.id === c.userId);
              return (
                <div key={c.userId} className="flex items-start gap-3 p-2 rounded bg-background border">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">
                      {u?.name ?? "—"}
                      {u?.id === me?.id && <Badge variant="outline" className="ml-2 text-[10px]">我</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">{u?.email}</div>
                  </div>
                  <div className="flex flex-wrap gap-1 justify-end max-w-[60%]">
                    {c.add.map((r) => (
                      <Badge key={`a-${r}`} className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[10px]">
                        +{ROLE_LABELS[r]}
                      </Badge>
                    ))}
                    {c.remove.map((r) => (
                      <Badge key={`r-${r}`} className="bg-rose-500/15 text-rose-400 border-rose-500/30 text-[10px]">
                        −{ROLE_LABELS[r]}
                      </Badge>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="text-xs text-muted-foreground flex items-center justify-between">
            <span>影響使用者：<span className="font-medium text-foreground">{pendingCount}</span></span>
            <span>
              超級管理員：<span className="font-medium text-foreground">{superAdminImpact.before}</span>
              {" → "}
              <span className={`font-medium ${superAdminImpact.willBeZero ? "text-destructive" : "text-foreground"}`}>
                {superAdminImpact.after}
              </span>
            </span>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={applyMut.isPending}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); applyMut.mutate(); }}
              disabled={applyMut.isPending || superAdminImpact.willBeZero}
              className="bg-gradient-primary"
            >
              {applyMut.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              確認套用
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!signOutTarget} onOpenChange={(o) => !o && setSignOutTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>強制登出該使用者？</AlertDialogTitle>
            <AlertDialogDescription>
              將立即作廢 <span className="font-mono">{signOutTarget?.email}</span> 的所有 session（包含其他裝置）。下次操作時需重新登入。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => signOutTarget && signOutMut.mutate(signOutTarget.id)}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              {signOutMut.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              確認強制登出
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
