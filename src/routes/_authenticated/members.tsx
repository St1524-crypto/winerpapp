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
import { Search, Shield, UserCircle } from "lucide-react";
import type { AppRole } from "@/hooks/use-auth";
import { ROLE_LABELS } from "@/lib/nav";

interface Profile { id: string; name: string | null; email: string | null; avatar_url: string | null; created_at: string; }
interface Member extends Profile { roles: AppRole[]; }

const ALL_ROLES: AppRole[] = ["super_admin", "finance", "warehouse", "sales", "vendor", "member"];
const ROLE_COLORS: Record<AppRole, string> = {
  super_admin: "bg-red-500/20 text-red-400 border-red-500/30",
  finance: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  warehouse: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  sales: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  vendor: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  member: "bg-slate-500/20 text-slate-300 border-slate-500/30",
};

function Page() {
  const [list, setList] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Member | null>(null);
  const [selectedRoles, setSelectedRoles] = useState<AppRole[]>([]);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const [{ data: profiles, error: e1 }, { data: roles, error: e2 }] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at", { ascending: false }),
      supabase.from("user_roles").select("user_id, role"),
    ]);
    if (e1 || e2) { toast.error(e1?.message ?? e2?.message ?? "載入失敗"); setLoading(false); return; }
    const rolesMap = new Map<string, AppRole[]>();
    (roles ?? []).forEach((r: any) => {
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
    return (m.name ?? "").toLowerCase().includes(q) || (m.email ?? "").toLowerCase().includes(q);
  }), [list, search]);

  function openEdit(m: Member) { setEditing(m); setSelectedRoles([...m.roles]); }

  async function saveRoles() {
    if (!editing) return;
    setSaving(true);
    const current = new Set(editing.roles);
    const next = new Set(selectedRoles);
    const toAdd = [...next].filter((r) => !current.has(r));
    const toRemove = [...current].filter((r) => !next.has(r));
    try {
      if (toRemove.length) {
        const { error } = await supabase.from("user_roles").delete().eq("user_id", editing.id).in("role", toRemove);
        if (error) throw error;
      }
      if (toAdd.length) {
        const { error } = await supabase.from("user_roles").insert(toAdd.map((r) => ({ user_id: editing.id, role: r })));
        if (error) throw error;
      }
      toast.success("角色已更新");
      setEditing(null);
      load();
    } catch (e: any) {
      toast.error(e.message ?? "儲存失敗");
    } finally { setSaving(false); }
  }

  function toggleRole(r: AppRole) {
    setSelectedRoles((s) => s.includes(r) ? s.filter((x) => x !== r) : [...s, r]);
  }

  return (
    <div className="max-w-[1600px] mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><UserCircle className="h-6 w-6 text-primary" />會員管理</h1>
        <p className="text-sm text-muted-foreground mt-1">管理會員帳號與角色權限指派</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="relative max-w-md">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="搜尋名稱或 Email..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>會員</TableHead><TableHead>Email</TableHead><TableHead>角色</TableHead>
                <TableHead>建立日期</TableHead><TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}><TableCell colSpan={5}><Skeleton className="h-10 w-full" /></TableCell></TableRow>
              )) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-10">尚無會員</TableCell></TableRow>
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
                  <TableCell className="text-muted-foreground">{m.email ?? "—"}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {m.roles.length === 0 ? <span className="text-xs text-muted-foreground">無</span>
                        : m.roles.map((r) => (
                          <Badge key={r} variant="outline" className={ROLE_COLORS[r]}>{ROLE_LABELS[r]}</Badge>
                        ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm">{new Date(m.created_at).toLocaleDateString()}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(m)}><Shield className="h-4 w-4 mr-1" />管理角色</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>管理角色權限</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-4 py-2">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/40">
                <Avatar className="h-10 w-10">
                  {editing.avatar_url && <AvatarImage src={editing.avatar_url} />}
                  <AvatarFallback>{(editing.name ?? editing.email ?? "?").charAt(0).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div>
                  <div className="font-medium">{editing.name ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">{editing.email}</div>
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
            <Button variant="ghost" onClick={() => setEditing(null)}>取消</Button>
            <Button onClick={saveRoles} disabled={saving} className="bg-gradient-primary">儲存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/members")({ component: Page });
