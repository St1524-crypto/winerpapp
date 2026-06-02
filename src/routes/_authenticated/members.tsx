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
import { Search, Shield, UserCircle, UserPlus, Pencil, Handshake, KeyRound, Copy, LogIn, Sparkles, Link2, ExternalLink } from "lucide-react";
import { CopyButton } from "@/components/CopyButton";
import type { AppRole } from "@/hooks/use-auth";
import { ROLE_LABELS } from "@/lib/nav";
import { useAuth } from "@/hooks/use-auth";
import { adminCreateMember, adminUpdateMember, adminResetMemberPassword, adminImpersonateMember } from "@/lib/members-admin.functions";

interface Profile { id: string; name: string | null; email: string | null; phone: string | null; member_no: string | null; avatar_url: string | null; created_at: string; is_dealer?: boolean; referred_by?: string | null; marketing_slug?: string | null; legacy_rank?: string | null; }
interface Member extends Profile { roles: AppRole[]; referrer_member_no?: string | null; referrer_name?: string | null; current_tier?: string | null; }

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
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "", referrerMemberNo: "", marketingSlug: "" });

  // Password tools dialog state
  const [pwTarget, setPwTarget] = useState<Member | null>(null);
  const [pwNew, setPwNew] = useState("");
  const [pwForceChange, setPwForceChange] = useState(true);
  const [pwResult, setPwResult] = useState<{ password?: string; email?: string | null; actionLink?: string | null } | null>(null);
  const [pwBusy, setPwBusy] = useState<null | "reset" | "temp" | "impersonate">(null);

  async function load() {
    setLoading(true);
    const [{ data: profiles, error: e1 }, { data: rolesData, error: e2 }, { data: tierData }] = await Promise.all([
      supabase.from("profiles").select("id, name, email, phone, member_no, avatar_url, created_at, is_dealer, referred_by, marketing_slug, legacy_rank").order("created_at", { ascending: false }),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("dealer_tier_status").select("user_id, current_tier"),
    ]);
    if (e1 || e2) { toast.error(e1?.message ?? e2?.message ?? "載入失敗"); setLoading(false); return; }
    const rolesMap = new Map<string, AppRole[]>();
    (rolesData ?? []).forEach((r: any) => {
      const arr = rolesMap.get(r.user_id) ?? [];
      arr.push(r.role as AppRole);
      rolesMap.set(r.user_id, arr);
    });
    const tierMap = new Map<string, string>();
    (tierData ?? []).forEach((t: any) => { if (t.current_tier) tierMap.set(t.user_id, t.current_tier); });
    const byId = new Map<string, any>((profiles ?? []).map((p: any) => [p.id, p]));
    setList((profiles ?? []).map((p: any) => {
      const ref = p.referred_by ? byId.get(p.referred_by) : null;
      return {
        ...p,
        roles: rolesMap.get(p.id) ?? [],
        referrer_member_no: ref?.member_no ?? null,
        referrer_name: ref?.name ?? null,
        current_tier: tierMap.get(p.id) ?? null,
      };
    }));
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
    setForm({ name: "", email: "", phone: "", password: "", referrerMemberNo: "", marketingSlug: "" });
    setCreateOpen(true);
  }
  function openEditProfile(m: Member) {
    setEditProfile(m);
    setForm({ name: m.name ?? "", email: m.email ?? "", phone: m.phone ?? "", password: "", referrerMemberNo: m.referrer_member_no ?? "", marketingSlug: m.marketing_slug ?? "" });
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
      const trimmedRef = form.referrerMemberNo.trim();
      const originalRef = editProfile.referrer_member_no ?? "";
      await adminUpdateMember({
        data: {
          userId: editProfile.id,
          name: form.name,
          email: form.email,
          phone: form.phone,
          password: form.password || undefined,
          referrerMemberNo: trimmedRef || undefined,
          clearReferrer: !trimmedRef && !!originalRef,
          marketingSlug: form.marketingSlug.trim() || "",
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
                <TableHead>推薦人</TableHead>
                <TableHead>角色</TableHead>
                <TableHead>位階</TableHead>
                <TableHead>經銷商</TableHead>
                <TableHead>建立日期</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}><TableCell colSpan={10}><Skeleton className="h-10 w-full" /></TableCell></TableRow>
              )) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-10">尚無會員</TableCell></TableRow>
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
                    {m.referrer_member_no ? (
                      <div className="text-xs leading-tight">
                        <div className="font-mono">{m.referrer_member_no}</div>
                        <div className="text-muted-foreground">{m.referrer_name ?? "—"}</div>
                      </div>
                    ) : <span className="text-xs text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {m.roles.length === 0 ? <span className="text-xs text-muted-foreground">無</span>
                        : m.roles.map((r) => (
                          <Badge key={r} variant="outline" className={ROLE_COLORS[r]}>{ROLE_LABELS[r]}</Badge>
                        ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    {m.current_tier ? (
                      <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 font-mono">{m.current_tier}</Badge>
                    ) : m.legacy_rank ? (
                      <span className="text-xs text-muted-foreground">{m.legacy_rank}</span>
                    ) : <span className="text-xs text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell>
                    {m.is_dealer
                      ? <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30" variant="outline">經銷商</Badge>
                      : <span className="text-xs text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">{new Date(m.created_at).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1 items-center">
                      {(m.marketing_slug || m.phone) && (
                        <>
                          <a
                            href={`/r/${m.marketing_slug || m.phone}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline mr-1"
                            title="預覽行銷網頁"
                          >
                            <ExternalLink className="h-3 w-3" />
                            預覽
                          </a>
                          <CopyButton
                            value={`${typeof window !== "undefined" ? window.location.origin : ""}/r/${m.marketing_slug || m.phone}`}
                            label="行銷網址"
                            size="sm"
                            iconSize={3.5}
                            className="h-7 w-7 mr-1"
                            stopPropagation={false}
                          />
                        </>
                      )}
                      {isAdmin && (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => toggleDealer(m)} title="切換經銷商">
                            <Handshake className={`h-4 w-4 mr-1 ${m.is_dealer ? "text-emerald-600" : ""}`} />
                            {m.is_dealer ? "取消經銷" : "設為經銷"}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => openEditProfile(m)}><Pencil className="h-4 w-4 mr-1" />編輯</Button>
                          <Button size="sm" variant="ghost" onClick={() => openPasswordTools(m)} title="密碼 / 代登入"><KeyRound className="h-4 w-4 mr-1" />密碼</Button>
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
              <div className="space-y-1">
                <Label>推薦人會員編號（留空則清除）</Label>
                <Input value={form.referrerMemberNo} onChange={(e) => setForm({ ...form, referrerMemberNo: e.target.value })} placeholder="例如 M000123" className="font-mono" />
                {editProfile.referrer_name && (
                  <p className="text-[11px] text-muted-foreground">目前推薦人：{editProfile.referrer_member_no} · {editProfile.referrer_name}</p>
                )}
              </div>
              <div className="space-y-1">
                <Label>行銷網址代稱（marketing slug，3-32 字元，可含 A-Z a-z 0-9 _ -）</Label>
                <Input
                  value={form.marketingSlug}
                  onChange={(e) => setForm({ ...form, marketingSlug: e.target.value })}
                  placeholder="例如 alice-wang"
                />
                <p className="text-[11px] text-muted-foreground">
                  留空則使用會員電話作為行銷網址：/r/{form.marketingSlug.trim() || form.phone || "電話"}
                </p>
              </div>
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

      {/* Password tools */}
      <Dialog open={!!pwTarget} onOpenChange={(v) => { if (!v) { setPwTarget(null); setPwResult(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5 text-primary" />密碼工具 · {pwTarget?.name ?? pwTarget?.email}</DialogTitle></DialogHeader>
          {pwTarget && (
            <div className="space-y-4 py-2">
              <div className="rounded-md bg-amber-500/10 border border-amber-500/30 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                基於資安原則，系統無法查詢原始密碼（單向雜湊儲存）。您可以重設、產生臨時密碼，或以一次性連結代登入。
              </div>

              <div className="space-y-2">
                <Label>方式一：直接指定新密碼</Label>
                <div className="flex gap-2">
                  <Input type="text" value={pwNew} onChange={(e) => setPwNew(e.target.value)} placeholder="至少 6 碼" />
                  <Button onClick={() => doResetPassword(false)} disabled={pwBusy !== null || pwNew.length < 6} className="bg-gradient-primary shrink-0">重設</Button>
                </div>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Checkbox checked={pwForceChange} onCheckedChange={(v) => setPwForceChange(!!v)} />
                  下次登入時要求會員自行變更密碼
                </label>
              </div>

              <div className="space-y-2">
                <Label>方式二：產生一次性臨時密碼</Label>
                <Button variant="outline" onClick={() => doResetPassword(true)} disabled={pwBusy !== null} className="w-full">
                  <Sparkles className="h-4 w-4 mr-2" />產生 12 碼強密碼
                </Button>
              </div>

              <div className="space-y-2">
                <Label>方式三：代登入連結（Impersonate）</Label>
                <Button variant="outline" onClick={doImpersonate} disabled={pwBusy !== null || !pwTarget.email} className="w-full">
                  <LogIn className="h-4 w-4 mr-2" />產生一次性登入連結
                </Button>
                {!pwTarget.email && <p className="text-[11px] text-muted-foreground">會員缺少 Email，無法產生代登入連結</p>}
              </div>

              {pwResult?.password && (
                <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-2">
                  <div className="text-xs text-muted-foreground">新密碼（請立即複製並交付會員，僅顯示一次）</div>
                  <div className="flex gap-2 items-center">
                    <code className="flex-1 font-mono text-sm bg-background rounded px-2 py-1 border">{pwResult.password}</code>
                    <Button size="sm" variant="ghost" onClick={() => copyText(pwResult.password!, "密碼")}><Copy className="h-4 w-4" /></Button>
                  </div>
                  {pwResult.email && <div className="text-[11px] text-muted-foreground">帳號：{pwResult.email}</div>}
                </div>
              )}

              {pwResult?.actionLink && (
                <div className="rounded-md border border-primary/30 bg-primary/5 p-3 space-y-2">
                  <div className="text-xs text-muted-foreground">一次性代登入連結（60 分鐘內有效）</div>
                  <div className="flex gap-2 items-center">
                    <code className="flex-1 font-mono text-xs bg-background rounded px-2 py-1 border break-all">{pwResult.actionLink}</code>
                    <Button size="sm" variant="ghost" onClick={() => copyText(pwResult.actionLink!, "連結")}><Copy className="h-4 w-4" /></Button>
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setPwTarget(null); setPwResult(null); }}>關閉</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/members")({ component: Page });
