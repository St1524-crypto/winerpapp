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

interface Profile { id: string; name: string | null; email: string | null; phone: string | null; member_no: string | null; avatar_url: string | null; created_at: string; is_dealer?: boolean; referred_by?: string | null; marketing_slug?: string | null; legacy_rank?: string | null; id_no?: string | null; apply_date?: string | null; sex?: string | null; addr_mail?: string | null; addr_home?: string | null; birthday?: string | null; vip_expires_at?: string | null; is_vip?: boolean | null; }
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

  const PAGE_SIZE = 15;

  const [list, setList] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [stats, setStats] = useState({ total: 0, id_no: 0, apply_date: 0, sex: 0, addr_mail: 0, addr_home: 0, birthday: 0 });
  const [editingRoles, setEditingRoles] = useState<Member | null>(null);
  const [selectedRoles, setSelectedRoles] = useState<AppRole[]>([]);
  const [saving, setSaving] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [editProfile, setEditProfile] = useState<Member | null>(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "", referrerMemberNo: "", marketingSlug: "", id_no: "", apply_date: "", sex: "", addr_mail: "", addr_home: "", birthday: "", vip_expires_at: "" });

  // Password tools dialog state
  const [pwTarget, setPwTarget] = useState<Member | null>(null);
  const [pwNew, setPwNew] = useState("");
  const [pwForceChange, setPwForceChange] = useState(true);
  const [pwResult, setPwResult] = useState<{ password?: string; email?: string | null; actionLink?: string | null } | null>(null);
  const [pwBusy, setPwBusy] = useState<null | "reset" | "temp" | "impersonate">(null);

  // Debounce search input -> committed search; reset to page 1
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  async function load() {
    setLoading(true);
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    let q = supabase
      .from("profiles")
      .select("id, name, email, phone, member_no, avatar_url, created_at, is_dealer, referred_by, marketing_slug, legacy_rank, id_no, apply_date, sex, addr_mail, addr_home, birthday, vip_expires_at, is_vip", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);
    if (search) {
      const esc = search.replace(/[%,]/g, "");
      q = q.or(`name.ilike.%${esc}%,email.ilike.%${esc}%,phone.ilike.%${esc}%,member_no.ilike.%${esc}%,id_no.ilike.%${esc}%`);
    }
    const { data: profiles, error: e1, count } = await q;
    if (e1) { toast.error(e1.message ?? "載入失敗"); setLoading(false); return; }
    setTotalCount(count ?? 0);

    const userIds = (profiles ?? []).map((p: any) => p.id);
    const [rolesRes, tierRes] = userIds.length === 0
      ? [{ data: [] as any[] }, { data: [] as any[] }]
      : await Promise.all([
          supabase.from("user_roles").select("user_id, role").in("user_id", userIds),
          supabase.from("dealer_tier_status").select("user_id, current_tier").in("user_id", userIds),
        ]);
    const rolesData = rolesRes.data ?? [];
    const tierData = tierRes.data ?? [];

    const rolesMap = new Map<string, AppRole[]>();
    rolesData.forEach((r: any) => {
      const arr = rolesMap.get(r.user_id) ?? [];
      arr.push(r.role as AppRole);
      rolesMap.set(r.user_id, arr);
    });
    const tierMap = new Map<string, string>();
    tierData.forEach((t: any) => { if (t.current_tier) tierMap.set(t.user_id, t.current_tier); });

    const refIds = Array.from(new Set(
      (profiles ?? [])
        .map((p: any) => p.referred_by)
        .filter((rid: string | null): rid is string => !!rid)
    ));
    const byId = new Map<string, any>();
    if (refIds.length > 0) {
      const { data: refProfiles } = await supabase
        .from("profiles")
        .select("id, member_no, name")
        .in("id", refIds);
      (refProfiles ?? []).forEach((r: any) => byId.set(r.id, r));
    }

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

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [page, search]);

  // Load lightweight profile-fill stats (counts only)
  useEffect(() => {
    (async () => {
      const fields: Array<keyof Profile> = ["id_no","apply_date","sex","addr_mail","addr_home","birthday"];
      const totalRes = await supabase.from("profiles").select("id", { count: "exact", head: true });
      const counts = await Promise.all(fields.map((f) =>
        supabase.from("profiles").select("id", { count: "exact", head: true }).not(f as string, "is", null)
      ));
      setStats({
        total: totalRes.count ?? 0,
        id_no: counts[0].count ?? 0,
        apply_date: counts[1].count ?? 0,
        sex: counts[2].count ?? 0,
        addr_mail: counts[3].count ?? 0,
        addr_home: counts[4].count ?? 0,
        birthday: counts[5].count ?? 0,
      });
    })();
  }, []);

  const filtered = list;
  const fieldStats = stats;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  function openEditRoles(m: Member) { setEditingRoles(m); setSelectedRoles([...m.roles]); }
  function openCreate() {
    setForm({ name: "", email: "", phone: "", password: "", referrerMemberNo: "", marketingSlug: "", id_no: "", apply_date: "", sex: "", addr_mail: "", addr_home: "", birthday: "", vip_expires_at: "" });
    setCreateOpen(true);
  }
  function fmtDate(d?: string | null) { if (!d) return ""; return d.length >= 10 ? d.slice(0, 10) : d; }
  function openEditProfile(m: Member) {
    setEditProfile(m);
    setForm({
      name: m.name ?? "", email: m.email ?? "", phone: m.phone ?? "", password: "",
      referrerMemberNo: m.referrer_member_no ?? "", marketingSlug: m.marketing_slug ?? "",
      id_no: m.id_no ?? "", apply_date: fmtDate(m.apply_date), sex: m.sex ?? "",
      addr_mail: m.addr_mail ?? "", addr_home: m.addr_home ?? "", birthday: fmtDate(m.birthday), vip_expires_at: fmtDate(m.vip_expires_at),
    });
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
          id_no: form.id_no,
          apply_date: form.apply_date,
          sex: form.sex,
          addr_mail: form.addr_mail,
          addr_home: form.addr_home,
          birthday: form.birthday,
          vip_expires_at: form.vip_expires_at,
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
    <div className="max-w-[1600px] mx-auto space-y-4 md:space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-bold tracking-tight flex items-center gap-2"><UserCircle className="h-5 w-5 md:h-6 md:w-6 text-primary" />會員管理</h1>
          <p className="text-xs md:text-sm text-muted-foreground mt-1">管理會員帳號、基本資料與角色權限</p>
        </div>
        {isAdmin && (
          <Button onClick={openCreate} size="sm" className="bg-gradient-primary">
            <UserPlus className="h-4 w-4 mr-2" />新增會員
          </Button>
        )}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="relative max-w-md">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="搜尋姓名 / Email / 電話 / 會員編號 / 身份證號..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {[
              { k: "id_no", label: "身份證號" },
              { k: "apply_date", label: "加入日期" },
              { k: "sex", label: "性別" },
              { k: "addr_mail", label: "通訊地址" },
              { k: "addr_home", label: "戶籍地址" },
              { k: "birthday", label: "生日" },
            ].map((f) => {
              const n = (fieldStats as any)[f.k] as number;
              const pct = fieldStats.total ? Math.round((n / fieldStats.total) * 100) : 0;
              return (
                <Badge key={f.k} variant="outline" className="font-normal">
                  {f.label}：<span className="font-mono ml-1">{n.toLocaleString()}</span>
                  <span className="text-muted-foreground ml-1">/ {fieldStats.total.toLocaleString()}（{pct}%）</span>
                </Badge>
              );
            })}
          </div>
        </CardHeader>
        <CardContent className="px-2 md:px-6">
          {/* Mobile card list */}
          <div className="md:hidden space-y-2">
            {loading ? Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-lg" />
            )) : filtered.length === 0 ? (
              <div className="text-center text-muted-foreground py-10 text-sm">尚無會員</div>
            ) : filtered.map((m) => (
              <div key={m.id} className="rounded-lg border border-border bg-card p-3 space-y-2">
                <div className="flex items-start gap-3">
                  <Avatar className="h-10 w-10 shrink-0">
                    {m.avatar_url && <AvatarImage src={m.avatar_url} />}
                    <AvatarFallback>{(m.name ?? m.email ?? "?").charAt(0).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="font-medium truncate">{m.name ?? "—"}</div>
                      {m.member_no && <span className="font-mono text-[11px] text-muted-foreground">{m.member_no}</span>}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">{m.email ?? m.phone ?? "—"}</div>
                    {m.phone && m.email && (
                      <div className="text-xs text-muted-foreground truncate">{m.phone}</div>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1 text-[11px]">
                  {m.roles.map((r) => (
                    <Badge key={r} variant="outline" className={ROLE_COLORS[r]}>{ROLE_LABELS[r]}</Badge>
                  ))}
                  {m.current_tier && (
                    <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 font-mono">{m.current_tier}</Badge>
                  )}
                  {m.is_dealer && <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30" variant="outline">經銷商</Badge>}
                  {m.vip_expires_at && (() => {
                    const exp = new Date(m.vip_expires_at);
                    const expired = exp.getTime() <= Date.now();
                    return (
                      <Badge variant="outline" className={expired ? "bg-red-500/15 text-red-500 border-red-500/30" : "bg-amber-500/15 text-amber-600 border-amber-500/30"}>
                        VIP {expired ? "已到期" : exp.toLocaleDateString()}
                      </Badge>
                    );
                  })()}
                </div>
                {m.referrer_member_no && (
                  <div className="text-[11px] text-muted-foreground">
                    推薦人：<span className="font-mono">{m.referrer_member_no}</span> · {m.referrer_name ?? "—"}
                  </div>
                )}
                <div className="flex flex-wrap gap-1 pt-1 border-t border-border/60">
                  {(m.marketing_slug || m.phone) && (
                    <Button asChild size="sm" variant="ghost" className="h-8 px-2 text-xs">
                      <a href={`/r/${m.marketing_slug || m.phone}`} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-3.5 w-3.5 mr-1" />預覽
                      </a>
                    </Button>
                  )}
                  {isAdmin && (
                    <>
                      <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => openEditProfile(m)}>
                        <Pencil className="h-3.5 w-3.5 mr-1" />編輯
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => openPasswordTools(m)}>
                        <KeyRound className="h-3.5 w-3.5 mr-1" />密碼
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => toggleDealer(m)}>
                        <Handshake className={`h-3.5 w-3.5 mr-1 ${m.is_dealer ? "text-emerald-600" : ""}`} />
                        {m.is_dealer ? "取消經銷" : "經銷"}
                      </Button>
                    </>
                  )}
                  <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={() => openEditRoles(m)}>
                    <Shield className="h-3.5 w-3.5 mr-1" />角色
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
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
                <TableHead>年費到期</TableHead>
                <TableHead>建立日期</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}><TableCell colSpan={11}><Skeleton className="h-10 w-full" /></TableCell></TableRow>
              )) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground py-10">尚無會員</TableCell></TableRow>
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
                  <TableCell>
                    {m.vip_expires_at ? (() => {
                      const exp = new Date(m.vip_expires_at);
                      const expired = exp.getTime() <= Date.now();
                      return (
                        <Badge variant="outline" className={expired ? "bg-red-500/15 text-red-500 border-red-500/30" : "bg-emerald-500/15 text-emerald-600 border-emerald-500/30"}>
                          {expired ? "已到期 " : ""}{exp.toLocaleDateString()}
                        </Badge>
                      );
                    })() : <span className="text-xs text-muted-foreground">—</span>}
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
          </div>
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
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
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
              <div className="pt-2 border-t border-border" />
              <div className="text-xs font-medium text-muted-foreground">個人資料</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1"><Label>身份證號</Label><Input value={form.id_no} onChange={(e) => setForm({ ...form, id_no: e.target.value })} placeholder="A123456789" className="font-mono" /></div>
                <div className="space-y-1">
                  <Label>性別</Label>
                  <select className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm" value={form.sex} onChange={(e) => setForm({ ...form, sex: e.target.value })}>
                    <option value="">—</option>
                    <option value="M">男 (M)</option>
                    <option value="F">女 (F)</option>
                  </select>
                </div>
                <div className="space-y-1"><Label>加入日期</Label><Input type="date" value={form.apply_date} onChange={(e) => setForm({ ...form, apply_date: e.target.value })} /></div>
                <div className="space-y-1"><Label>生日</Label><Input type="date" value={form.birthday} onChange={(e) => setForm({ ...form, birthday: e.target.value })} /></div>
              </div>
              <div className="space-y-1"><Label>通訊地址</Label><Input value={form.addr_mail} onChange={(e) => setForm({ ...form, addr_mail: e.target.value })} placeholder="郵遞區號 + 完整地址" /></div>
              <div className="space-y-1"><Label>戶籍地址</Label><Input value={form.addr_home} onChange={(e) => setForm({ ...form, addr_home: e.target.value })} placeholder="郵遞區號 + 完整地址" /></div>
              <div className="space-y-1">
                <Label>年費到期日（VIP）</Label>
                <Input type="date" value={form.vip_expires_at} onChange={(e) => setForm({ ...form, vip_expires_at: e.target.value })} />
                <p className="text-[11px] text-muted-foreground">留空＝非 VIP；到期後將無法領取獎勵點。</p>
              </div>
              <div className="pt-2 border-t border-border" />
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
