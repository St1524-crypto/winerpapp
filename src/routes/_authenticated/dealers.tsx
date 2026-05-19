import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Plus, Search, Pencil, Trash2, Store } from "lucide-react";

interface Dealer {
  id: string; code: string; name: string; tier: string;
  contact: string | null; phone: string | null; email: string | null;
  address: string | null; credit_limit: number; notes: string | null;
  status: string; created_at: string;
}

const TIERS = [
  { value: "gold", label: "金級", color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
  { value: "silver", label: "銀級", color: "bg-slate-400/20 text-slate-300 border-slate-400/30" },
  { value: "bronze", label: "銅級", color: "bg-orange-700/20 text-orange-400 border-orange-700/30" },
];

const empty = { code: "", name: "", tier: "bronze", contact: "", phone: "", email: "", address: "", credit_limit: 0, notes: "", status: "active" };

function Page() {
  const [list, setList] = useState<Dealer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Dealer | null>(null);
  const [delId, setDelId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...empty });

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.from("dealers").select("*").order("created_at", { ascending: false });
    if (error) toast.error(error.message); else setList(data ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => list.filter((d) => {
    if (tierFilter !== "all" && d.tier !== tierFilter) return false;
    if (statusFilter !== "all" && d.status !== statusFilter) return false;
    if (search && ![d.code, d.name, d.contact, d.phone, d.email].some((v) => v?.toLowerCase().includes(search.toLowerCase()))) return false;
    return true;
  }), [list, search, tierFilter, statusFilter]);

  function openNew() { setEditing(null); setForm({ ...empty }); setOpen(true); }
  function openEdit(d: Dealer) {
    setEditing(d);
    setForm({ code: d.code, name: d.name, tier: d.tier, contact: d.contact ?? "", phone: d.phone ?? "", email: d.email ?? "", address: d.address ?? "", credit_limit: Number(d.credit_limit), notes: d.notes ?? "", status: d.status });
    setOpen(true);
  }
  async function save() {
    if (!form.code.trim() || !form.name.trim()) { toast.error("代號與名稱為必填"); return; }
    const payload = { ...form, credit_limit: Number(form.credit_limit) || 0 };
    const res = editing
      ? await supabase.from("dealers").update(payload).eq("id", editing.id)
      : await supabase.from("dealers").insert(payload);
    if (res.error) toast.error(res.error.message);
    else { toast.success(editing ? "已更新" : "已新增"); setOpen(false); load(); }
  }
  async function remove() {
    if (!delId) return;
    const { error } = await supabase.from("dealers").delete().eq("id", delId);
    if (error) toast.error(error.message); else { toast.success("已刪除"); load(); }
    setDelId(null);
  }

  return (
    <div className="max-w-[1600px] mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Store className="h-6 w-6 text-primary" />經銷商管理</h1>
          <p className="text-sm text-muted-foreground mt-1">管理經銷夥伴、等級與信用額度</p>
        </div>
        <Button onClick={openNew} className="bg-gradient-primary"><Plus className="h-4 w-4 mr-1" />新增經銷商</Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="搜尋代號、名稱、聯絡人..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={tierFilter} onValueChange={setTierFilter}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部等級</SelectItem>
                {TIERS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部狀態</SelectItem>
                <SelectItem value="active">啟用</SelectItem>
                <SelectItem value="inactive">停用</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>代號</TableHead><TableHead>名稱</TableHead><TableHead>等級</TableHead>
                <TableHead>聯絡人</TableHead><TableHead>電話</TableHead><TableHead>Email</TableHead>
                <TableHead className="text-right">信用額度</TableHead><TableHead>狀態</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}><TableCell colSpan={9}><Skeleton className="h-8 w-full" /></TableCell></TableRow>
              )) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-10">尚無資料</TableCell></TableRow>
              ) : filtered.map((d) => {
                const tier = TIERS.find((t) => t.value === d.tier);
                return (
                  <TableRow key={d.id}>
                    <TableCell className="font-mono text-xs">{d.code}</TableCell>
                    <TableCell className="font-medium">{d.name}</TableCell>
                    <TableCell><Badge variant="outline" className={tier?.color}>{tier?.label ?? d.tier}</Badge></TableCell>
                    <TableCell>{d.contact ?? "—"}</TableCell>
                    <TableCell>{d.phone ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{d.email ?? "—"}</TableCell>
                    <TableCell className="text-right font-mono">${Number(d.credit_limit).toLocaleString()}</TableCell>
                    <TableCell><Badge variant={d.status === "active" ? "default" : "secondary"}>{d.status === "active" ? "啟用" : "停用"}</Badge></TableCell>
                    <TableCell className="text-right">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(d)}><Pencil className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => setDelId(d.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editing ? "編輯經銷商" : "新增經銷商"}</DialogTitle></DialogHeader>
          <div className="grid sm:grid-cols-2 gap-4 py-2">
            <div className="space-y-2"><Label>代號 *</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="D-0001" className="font-mono" /></div>
            <div className="space-y-2"><Label>名稱 *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="space-y-2"><Label>等級</Label>
              <Select value={form.tier} onValueChange={(v) => setForm({ ...form, tier: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{TIERS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>狀態</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="active">啟用</SelectItem><SelectItem value="inactive">停用</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>聯絡人</Label><Input value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} /></div>
            <div className="space-y-2"><Label>電話</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div className="space-y-2"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div className="space-y-2"><Label>信用額度</Label><Input type="number" value={form.credit_limit} onChange={(e) => setForm({ ...form, credit_limit: +e.target.value })} /></div>
            <div className="space-y-2 sm:col-span-2"><Label>地址</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
            <div className="space-y-2 sm:col-span-2"><Label>備註</Label><Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>取消</Button>
            <Button onClick={save} className="bg-gradient-primary">{editing ? "儲存變更" : "建立"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!delId} onOpenChange={(v) => !v && setDelId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>確認刪除？</AlertDialogTitle><AlertDialogDescription>此動作無法復原。</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>取消</AlertDialogCancel><AlertDialogAction onClick={remove}>刪除</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/dealers")({ component: Page });
