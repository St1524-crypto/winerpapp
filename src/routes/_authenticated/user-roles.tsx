import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type AppRole } from "@/hooks/use-auth";
import { ROLE_LABELS, NAV_ITEMS } from "@/lib/nav";
import { ForbiddenScreen } from "@/components/ForbiddenScreen";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  Search, Shield, ShieldCheck, CheckCircle2, XCircle, Loader2,
  Save, RefreshCw, UserCog, Layers, Activity,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/user-roles")({
  head: () => ({
    meta: [
      { title: "使用者角色管理 — 源倍力 ERP" },
      { name: "description", content: "查看、修改使用者角色，並即時驗證 RBAC 權限是否生效。" },
    ],
  }),
  component: Page,
});

const ALL_ROLES: AppRole[] = ["super_admin", "finance", "warehouse", "sales", "vendor", "member"];
const ROLE_COLORS: Record<AppRole, string> = {
  super_admin: "bg-red-500/20 text-red-400 border-red-500/30",
  finance: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  warehouse: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  sales: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  vendor: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  member: "bg-slate-500/20 text-slate-300 border-slate-500/30",
};

interface Member {
  id: string;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
  created_at: string;
  roles: AppRole[];
}

type VerifyState = "pending" | "ok" | "fail";

function Page() {
  const { roles: myRoles } = useAuth();
  const isAdmin = myRoles.includes("super_admin");

  const [list, setList] = useState<Member[] | null>(null);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<AppRole[]>([]);
  const [saving, setSaving] = useState(false);
  const [verify, setVerify] = useState<Record<AppRole, VerifyState> | null>(null);
  const [verifying, setVerifying] = useState(false);

  async function load() {
    const [{ data: profiles, error: e1 }, { data: rs, error: e2 }] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: false }),
      supabase.from("user_roles").select("user_id, role"),
    ]);
    if (e1 || e2) {
      toast.error(e1?.message ?? e2?.message ?? "載入失敗");
      return;
    }
    const map = new Map<string, AppRole[]>();
    (rs ?? []).forEach((r: any) => {
      const arr = map.get(r.user_id) ?? [];
      arr.push(r.role as AppRole);
      map.set(r.user_id, arr);
    });
    const ms = (profiles ?? []).map((p: any) => ({ ...p, roles: map.get(p.id) ?? [] }));
    setList(ms);
    if (!selectedId && ms.length) {
      setSelectedId(ms[0].id);
      setDraft([...ms[0].roles]);
    }
  }

  useEffect(() => {
    if (isAdmin) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const selected = useMemo(
    () => list?.find((m) => m.id === selectedId) ?? null,
    [list, selectedId],
  );

  const filtered = useMemo(() => {
    if (!list) return [];
    if (!search) return list;
    const q = search.toLowerCase();
    return list.filter(
      (m) =>
        (m.name ?? "").toLowerCase().includes(q) ||
        (m.email ?? "").toLowerCase().includes(q),
    );
  }, [list, search]);

  const dirty = useMemo(() => {
    if (!selected) return false;
    const a = new Set(selected.roles);
    const b = new Set(draft);
    if (a.size !== b.size) return true;
    for (const r of a) if (!b.has(r)) return true;
    return false;
  }, [selected, draft]);

  function selectUser(m: Member) {
    setSelectedId(m.id);
    setDraft([...m.roles]);
    setVerify(null);
  }

  function toggle(r: AppRole) {
    setDraft((s) => (s.includes(r) ? s.filter((x) => x !== r) : [...s, r]));
  }

  async function save() {
    if (!selected) return;
    setSaving(true);
    const current = new Set(selected.roles);
    const next = new Set(draft);
    const toAdd = [...next].filter((r) => !current.has(r));
    const toRemove = [...current].filter((r) => !next.has(r));
    try {
      if (toRemove.length) {
        const { error } = await supabase
          .from("user_roles")
          .delete()
          .eq("user_id", selected.id)
          .in("role", toRemove);
        if (error) throw error;
      }
      if (toAdd.length) {
        const { error } = await supabase
          .from("user_roles")
          .insert(toAdd.map((r) => ({ user_id: selected.id, role: r })));
        if (error) throw error;
      }
      toast.success("角色已更新");
      await load();
      await runVerify(selected.id, draft);
    } catch (e: any) {
      toast.error(e.message ?? "儲存失敗");
    } finally {
      setSaving(false);
    }
  }

  async function runVerify(userId: string, expected: AppRole[]) {
    setVerifying(true);
    const state = {} as Record<AppRole, VerifyState>;
    ALL_ROLES.forEach((r) => (state[r] = "pending"));
    setVerify({ ...state });
    for (const r of ALL_ROLES) {
      const { data, error } = await supabase.rpc("has_role", {
        _user_id: userId,
        _role: r,
      });
      const ok = !error && !!data;
      const expectsTrue = expected.includes(r);
      state[r] = ok === expectsTrue ? "ok" : "fail";
      setVerify({ ...state });
    }
    setVerifying(false);
  }

  const visibleModules = useMemo(() => {
    const rs = draft;
    return NAV_ITEMS.filter(
      (i) => i.roles.length === 0 || i.roles.some((r) => rs.includes(r)) || rs.includes("super_admin"),
    );
  }, [draft]);

  if (!isAdmin) {
    return <ForbiddenScreen requiredRoles={["super_admin"]} pageName="使用者角色管理" />;
  }

  return (
    <div className="max-w-[1600px] mx-auto space-y-6 p-2 md:p-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <UserCog className="h-6 w-6 text-primary" /> 使用者角色管理
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            指派 RBAC 角色並透過 has_role() 即時驗證資料庫端的權限是否同步生效。
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="h-4 w-4 mr-2" />重新整理
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4">
        {/* User list */}
        <Card className="bg-card/60 backdrop-blur border-border/60">
          <CardHeader className="pb-3 space-y-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" /> 使用者
              <Badge variant="outline" className="ml-auto text-[10px]">{list?.length ?? 0}</Badge>
            </CardTitle>
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="搜尋名稱 / Email..."
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[520px]">
              <div className="divide-y divide-border/60">
                {list === null
                  ? Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="p-3"><Skeleton className="h-12 w-full" /></div>
                    ))
                  : filtered.length === 0
                    ? <div className="p-8 text-center text-sm text-muted-foreground">查無使用者</div>
                    : filtered.map((m) => {
                        const active = m.id === selectedId;
                        return (
                          <button
                            key={m.id}
                            onClick={() => selectUser(m)}
                            className={`w-full text-left flex items-center gap-3 px-3 py-3 transition-colors ${
                              active ? "bg-primary/10 border-l-2 border-primary" : "hover:bg-muted/40 border-l-2 border-transparent"
                            }`}
                          >
                            <Avatar className="h-9 w-9 shrink-0">
                              {m.avatar_url && <AvatarImage src={m.avatar_url} />}
                              <AvatarFallback>{(m.name ?? m.email ?? "?").charAt(0).toUpperCase()}</AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium truncate">{m.name ?? "—"}</div>
                              <div className="text-xs text-muted-foreground truncate">{m.email}</div>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {m.roles.length === 0 ? (
                                  <span className="text-[10px] text-muted-foreground">無角色</span>
                                ) : m.roles.slice(0, 3).map((r) => (
                                  <span key={r} className={`text-[10px] px-1.5 py-0.5 rounded border ${ROLE_COLORS[r]}`}>
                                    {ROLE_LABELS[r]}
                                  </span>
                                ))}
                                {m.roles.length > 3 && (
                                  <span className="text-[10px] text-muted-foreground">+{m.roles.length - 3}</span>
                                )}
                              </div>
                            </div>
                          </button>
                        );
                      })}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Right: edit + verify */}
        <div className="space-y-4">
          {!selected ? (
            <Card className="bg-card/60 backdrop-blur border-border/60">
              <CardContent className="p-10 text-center text-sm text-muted-foreground">
                請先從左側選擇使用者
              </CardContent>
            </Card>
          ) : (
            <>
              <Card className="bg-card/60 backdrop-blur border-border/60">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Shield className="h-4 w-4 text-primary" /> 角色指派
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/40 border border-border/60">
                    <Avatar className="h-12 w-12">
                      {selected.avatar_url && <AvatarImage src={selected.avatar_url} />}
                      <AvatarFallback>{(selected.name ?? selected.email ?? "?").charAt(0).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{selected.name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground truncate">{selected.email}</div>
                      <div className="text-[10px] text-muted-foreground font-mono mt-0.5 truncate">{selected.id}</div>
                    </div>
                    <div className="flex flex-wrap gap-1 justify-end">
                      {selected.roles.length === 0 ? (
                        <Badge variant="outline">未指派</Badge>
                      ) : selected.roles.map((r) => (
                        <Badge key={r} variant="outline" className={ROLE_COLORS[r]}>{ROLE_LABELS[r]}</Badge>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {ALL_ROLES.map((r) => (
                      <label
                        key={r}
                        className={`flex items-center gap-2 p-3 rounded-lg border cursor-pointer transition-colors ${
                          draft.includes(r) ? "border-primary/60 bg-primary/5" : "border-border hover:bg-muted/40"
                        }`}
                      >
                        <Checkbox checked={draft.includes(r)} onCheckedChange={() => toggle(r)} />
                        <span className="text-sm">{ROLE_LABELS[r]}</span>
                        <span className="ml-auto text-[10px] text-muted-foreground font-mono">{r}</span>
                      </label>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-border/60">
                    <div className="text-xs text-muted-foreground">
                      {dirty ? <span className="text-amber-500">● 有未儲存的變更</span> : "已同步資料庫"}
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => runVerify(selected.id, selected.roles)}
                        disabled={verifying}
                      >
                        {verifying ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ShieldCheck className="h-4 w-4 mr-2" />}
                        驗證權限
                      </Button>
                      <Button
                        size="sm"
                        className="bg-gradient-primary"
                        onClick={save}
                        disabled={!dirty || saving}
                      >
                        {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                        儲存變更
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="bg-card/60 backdrop-blur border-border/60">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Activity className="h-4 w-4 text-primary" /> has_role() 即時驗證
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {verify === null ? (
                      <p className="text-xs text-muted-foreground">
                        點擊「驗證權限」呼叫資料庫 <code className="font-mono">has_role()</code>，
                        確認儲存後的角色實際在 Postgres 端生效。
                      </p>
                    ) : (
                      ALL_ROLES.map((r) => {
                        const s = verify[r];
                        const expected = draft.includes(r);
                        return (
                          <div key={r} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 text-sm">
                            <div className="flex items-center gap-2">
                              {s === "pending" && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                              {s === "ok" && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                              {s === "fail" && <XCircle className="h-4 w-4 text-destructive" />}
                              <span>{ROLE_LABELS[r]}</span>
                              <span className="text-[10px] text-muted-foreground font-mono">{r}</span>
                            </div>
                            <div className="text-xs text-muted-foreground">
                              預期 <span className={expected ? "text-emerald-500" : "text-muted-foreground"}>{expected ? "TRUE" : "FALSE"}</span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </CardContent>
                </Card>

                <Card className="bg-card/60 backdrop-blur border-border/60">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Layers className="h-4 w-4 text-primary" /> 可見模組預覽
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-muted-foreground mb-3">
                      根據目前勾選的角色，此使用者登入後可看到的選單模組（{visibleModules.length} 項）：
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {visibleModules.map((m) => (
                        <Badge key={m.url} variant="secondary" className="gap-1">
                          <m.icon className="h-3 w-3" /> {m.title}
                        </Badge>
                      ))}
                      {visibleModules.length === 0 && (
                        <span className="text-xs text-muted-foreground">無可見模組</span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
