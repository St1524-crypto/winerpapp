import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Search, Shield, UserCircle, UserPlus, Pencil, Handshake, KeyRound, Copy, LogIn, Sparkles } from "lucide-react";
import type { AppRole } from "@/hooks/use-auth";
import { ROLE_LABELS } from "@/lib/nav";
import { useAuth } from "@/hooks/use-auth";
import { adminCreateMember, adminUpdateMember, adminResetMemberPassword, adminImpersonateMember } from "@/lib/members-admin.functions";

interface Profile { id: string; name: string | null; email: string | null; phone: string | null; member_no: string | null; avatar_url: string | null; created_at: string; is_dealer?: boolean; }
interface Member extends Profile { roles: AppRole[]; }

const ALL_ROLES: AppRole[] = ["super_admin", "admin", "finance", "warehouse", "sales", "vendor", "member"];
const ROLE_COLORS: Record<AppRole, string> = {
  super_admin: "bg-red-500/20 text-red-400 border-red-500/30",
  admin: "bg-indigo-500/20 text-indigo-400 border-indigo-500/30",
  finance: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  warehouse: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  sales: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  vendor: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  member: "bg-slate-500/20 text-slate-300 border-slate-500/30",
};

function Page() {
  const { roles: myRoles } = useAuth();
  const isAdmin = myRoles.includes("super_admin") || myRoles.includes("admin");

  const [list, setList] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editingRoles, setEditingRoles] = useState<Member | null>(null);
  const [selectedRoles, setSelectedRoles] = useState<AppRole[]>([]);
  const [saving, setSaving] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [editProfile, setEditProfile] = useState<Member | null>(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "" });

  // Password tools dialog state
  const [pwTarget, setPwTarget] = useState<Member | null>(null);
  const [pwNew, setPwNew] = useState("");
  const [pwForceChange, setPwForceChange] = useState(true);
  const [pwResult, setPwResult] = useState<{ password?: string; email?: string | null; actionLink?: string | null } | null>(null);
  const [pwBusy, setPwBusy] = useState<null | "reset" | "temp" | "impersonate">(null);

  async function load() {
    setLoading(true);
    const [{ data: profiles, error: e1 }, { data: rolesData, error: e2 }] = await Promise.all([
      supabase.from("profiles").select("id, name, email, phone, member_no, avatar_url, created_at, is_dealer").order("created_at", { ascending: false }),
      supabase.from("user_roles").select("user_id, role"),
    ]);
    if (e1 || e2) { toast.error(e1?.message ?? e2?.message ?? "載入失敗"); setLoading(false); return; }
    const rolesMap = new Map<string, AppRole[]>();
    (rolesData ?? []).forEach((r: any) => {
      const arr = rolesMap.get(r.user_id) ?? [];
      arr.push(r.role as AppRole);
      rolesMap.set(r.user_id, arr);
    });
    setList((profiles ?? []).map((p: any) => ({ ...p, roles: rolesMap.get(p.id) ?? [] })));
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => list.filter((m) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (m.name ?? "").toLowerCase().includes(q)
      || (m.email ?? "").toLowerCase().includes(q)
      || (m.phone ?? "").toLowerCase().includes(q)
      || (m.member_no ?? "").toLowerCase().includes(q);
  }), [list, search]);

  function openEditRoles(m: Member) { setEditingRoles(m); setSelectedRoles([...m.roles]); }
  function openCreate() {
    setForm({ name: "", email: "", phone: "", password: "" });
    setCreateOpen(true);
  }
  function openEditProfile(m: Member) {
    setEditProfile(m);
    setForm({ name: m.name ?? "", email: m.email ?? "", phone: m.phone ?? "", password: "" });
  }

  async function submitCreate() {
    setSaving(true);
    try {
      await adminCreateMember({ data: form });
      toast.success("會員已建立");
      setCreateOpen(false);
      load();
    } catch (e: any) { toast.error(e.message ?? "建立失敗"); }
    finally { setSaving(false); }
  }

  async function submitEditProfile() {
    if (!editProfile) return;
    setSaving(true);
    try {
      await adminUpdateMember({
        data: {
          userId: editProfile.id,
          name: form.name,
          email: form.email,
          phone: form.phone,
          password: form.password || undefined,
        },
      });
      toast.success("資料已更新");
      setEditProfile(null);
      load();
    } catch (e: any) { toast.error(e.message ?? "更新失敗"); }
    finally { setSaving(false); }
  }

  async function saveRoles() {
    if (!editingRoles) return;
    setSaving(true);
    const current = new Set(editingRoles.roles);
    const next = new Set(selectedRoles);
    const toAdd = [...next].filter((r) => !current.has(r));
    const toRemove = [...current].filter((r) => !next.has(r));
    try {
      if (toRemove.length) {
        const { error } = await supabase.from("user_roles").delete().eq("user_id", editingRoles.id).in("role", toRemove);
        if (error) throw error;
      }
      if (toAdd.length) {
        const { error } = await supabase.from("user_roles").insert(toAdd.map((r) => ({ user_id: editingRoles.id, role: r })));
        if (error) throw error;
      }
      toast.success("角色已更新");
      setEditingRoles(null);
      load();
    } catch (e: any) { toast.error(e.message ?? "儲存失敗"); }
    finally { setSaving(false); }
  }

  function toggleRole(r: AppRole) {
    setSelectedRoles((s) => s.includes(r) ? s.filter((x) => x !== r) : [...s, r]);
  }

  async function toggleDealer(m: Member) {
    const next = !m.is_dealer;
    const { error } = await supabase.from("profiles").update({ is_dealer: next } as any).eq("id", m.id);
    if (error) { toast.error(error.message); return; }
    toast.success(next ? `已將 ${m.name ?? "會員"} 設為經銷商` : `已取消 ${m.name ?? "會員"} 的經銷商身份`);
    setList((ls) => ls.map((x) => x.id === m.id ? { ...x, is_dealer: next } : x));
  }

  function openPasswordTools(m: Member) {
    setPwTarget(m);
    setPwNew("");
    setPwForceChange(true);
    setPwResult(null);
  }

  async function doResetPassword(useTemp: boolean) {
    if (!pwTarget) return;
    setPwBusy(useTemp ? "temp" : "reset");
    setPwResult(null);
    try {
      const res = await adminResetMemberPassword({
        data: {
          userId: pwTarget.id,
          password: useTemp ? undefined : pwNew,
          generateTemp: useTemp,
          forceChangeOnNextLogin: pwForceChange,
        },
      });
      setPwResult({ password: res.password, email: res.email });
      toast.success(useTemp ? "已產生臨時密碼" : "密碼已重設");
    } catch (e: any) { toast.error(e.message ?? "操作失敗"); }
    finally { setPwBusy(null); }
  }

  async function doImpersonate() {
    if (!pwTarget) return;
    setPwBusy("impersonate");
    setPwResult(null);
    try {
      const res = await adminImpersonateMember({ data: { userId: pwTarget.id } });
      setPwResult({ actionLink: res.actionLink, email: res.email });
      toast.success("已產生一次性代登入連結（60 分鐘內有效）");
    } catch (e: any) { toast.error(e.message ?? "產生失敗"); }
    finally { setPwBusy(null); }
  }

  async function copyText(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} 已複製`);
    } catch { toast.error("複製失敗"); }
  }


  return (
    <div className="max-w-[1600px] mx-auto space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><UserCircle className="h-6 w-6 text-primary" />會員管理</h1>
          <p className="text-sm text-muted-foreground mt-1">管理會員帳號、基本資料與角色權限</p>
        </div>
        {isAdmin && (
          <Button onClick={openCreate} className="bg-gradient-primary">
            <UserPlus className="h-4 w-4 mr-2" />新增會員
          </Button>
        )}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="relative max-w-md">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="搜尋姓名 / Email / 電話 / 會員編號..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>會員</TableHead>
                <TableHead>會員編號</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>電話</TableHead>
                <TableHead>角色</TableHead>
                <TableHead>經銷商</TableHead>
                <TableHead>建立日期</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}><TableCell colSpan={8}><Skeleton className="h-10 w-full" /></TableCell></TableRow>
              )) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-10">尚無會員</TableCell></TableRow>
              ) : filtered.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="h-9 w-9">
                        {m.avatar_url && <AvatarImage src={m.avatar_url} />}
                        <AvatarFallback>{(m.name ?? m.email ?? "?").charAt(0).toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <div className="font-medium">{m.name ?? "—"}</div>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{m.member_no ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{m.email ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{m.phone ?? "—"}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {m.roles.length === 0 ? <span className="text-xs text-muted-foreground">無</span>
                        : m.roles.map((r) => (
                          <Badge key={r} variant="outline" className={ROLE_COLORS[r]}>{ROLE_LABELS[r]}</Badge>
                        ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    {m.is_dealer
                      ? <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30" variant="outline">經銷商</Badge>
                      : <span className="text-xs text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">{new Date(m.created_at).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      {isAdmin && (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => toggleDealer(m)} title="切換經銷商">
                            <Handshake className={`h-4 w-4 mr-1 ${m.is_dealer ? "text-emerald-600" : ""}`} />
                            {m.is_dealer ? "取消經銷" : "設為經銷"}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => openEditProfile(m)}><Pencil className="h-4 w-4 mr-1" />編輯</Button>
                        </>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => openEditRoles(m)}><Shield className="h-4 w-4 mr-1" />角色</Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create member */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>新增會員</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1"><Label>姓名 *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="王小明" /></div>
            <div className="space-y-1"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="user@example.com" /></div>
            <div className="space-y-1"><Label>電話號碼</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="0912345678" /></div>
            <div className="space-y-1"><Label>初始密碼 *</Label><Input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="至少 6 碼" /></div>
            <p className="text-[11px] text-muted-foreground">Email 與電話至少需填一項；系統會自動產生會員編號（M 開頭 6 位數字）。</p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>取消</Button>
            <Button onClick={submitCreate} disabled={saving || !form.name || !form.password} className="bg-gradient-primary">建立</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit profile */}
      <Dialog open={!!editProfile} onOpenChange={(v) => !v && setEditProfile(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>編輯會員資料</DialogTitle></DialogHeader>
          {editProfile && (
            <div className="space-y-3 py-2">
              <div className="text-xs text-muted-foreground">會員編號：<span className="font-mono">{editProfile.member_no ?? "—"}</span></div>
              <div className="space-y-1"><Label>姓名</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div className="space-y-1"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div className="space-y-1"><Label>電話號碼</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              <div className="space-y-1"><Label>重設密碼 (留空則不變更)</Label><Input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="•••••" /></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditProfile(null)}>取消</Button>
            <Button onClick={submitEditProfile} disabled={saving} className="bg-gradient-primary">儲存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Roles */}
      <Dialog open={!!editingRoles} onOpenChange={(v) => !v && setEditingRoles(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>管理角色權限</DialogTitle></DialogHeader>
          {editingRoles && (
            <div className="space-y-4 py-2">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/40">
                <Avatar className="h-10 w-10">
                  {editingRoles.avatar_url && <AvatarImage src={editingRoles.avatar_url} />}
                  <AvatarFallback>{(editingRoles.name ?? editingRoles.email ?? "?").charAt(0).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div>
                  <div className="font-medium">{editingRoles.name ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">{editingRoles.email}</div>
                </div>
              </div>
              <div className="space-y-2">
                <Label>指派角色（可複選）</Label>
                <div className="grid grid-cols-2 gap-2">
                  {ALL_ROLES.map((r) => (
                    <label key={r} className="flex items-center gap-2 p-3 rounded-lg border border-border cursor-pointer hover:bg-muted/40">
                      <Checkbox checked={selectedRoles.includes(r)} onCheckedChange={() => toggleRole(r)} />
                      <span className="text-sm">{ROLE_LABELS[r]}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditingRoles(null)}>取消</Button>
            <Button onClick={saveRoles} disabled={saving} className="bg-gradient-primary">儲存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/members")({ component: Page });
