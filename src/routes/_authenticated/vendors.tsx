import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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
import { Plus, Search, Pencil, Trash2, Factory } from "lucide-react";

interface Vendor {
  id: string; code: string; name: string;
  contact: string | null; phone: string | null; email: string | null;
  tax_id: string | null; bank_account: string | null; payment_terms: string | null;
  shipping_method: string | null;
  address: string | null; notes: string | null; status: string; created_at: string;
}

const empty = { code: "", name: "", contact: "", phone: "", email: "", tax_id: "", bank_account: "", payment_terms: "", shipping_method: "", address: "", notes: "", status: "active" };

function Page() {
  const [list, setList] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Vendor | null>(null);
  const [delId, setDelId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...empty });

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.from("vendors").select("*").order("created_at", { ascending: false });
    if (error) toast.error(error.message); else setList(data ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => list.filter((v) => {
    if (statusFilter !== "all" && v.status !== statusFilter) return false;
    if (search && ![v.code, v.name, v.contact, v.phone, v.email, v.tax_id].some((x) => x?.toLowerCase().includes(search.toLowerCase()))) return false;
    return true;
  }), [list, search, statusFilter]);

  function openNew() { setEditing(null); setForm({ ...empty }); setOpen(true); }
  function openEdit(v: Vendor) {
    setEditing(v);
    setForm({ code: v.code, name: v.name, contact: v.contact ?? "", phone: v.phone ?? "", email: v.email ?? "", tax_id: v.tax_id ?? "", bank_account: v.bank_account ?? "", payment_terms: v.payment_terms ?? "", shipping_method: v.shipping_method ?? "", address: v.address ?? "", notes: v.notes ?? "", status: v.status });
    setOpen(true);
  }
  async function save() {
    if (!form.code.trim() || !form.name.trim()) { toast.error("代號與名稱為必填"); return; }
    const res = editing
      ? await supabase.from("vendors").update(form).eq("id", editing.id)
      : await supabase.from("vendors").insert(form);
    if (res.error) toast.error(res.error.message);
    else { toast.success(editing ? "已更新" : "已新增"); setOpen(false); load(); }
  }
  async function remove() {
    if (!delId) return;
    const { error } = await supabase.from("vendors").delete().eq("id", delId);
    if (error) toast.error(error.message); else { toast.success("已刪除"); load(); }
    setDelId(null);
  }

  return (
    <div className="max-w-[1600px] mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Factory className="h-6 w-6 text-primary" />廠商管理</h1>
          <p className="text-sm text-muted-foreground mt-1">管理供應廠商、聯絡資訊與付款條件</p>
        </div>
        <Button onClick={openNew} className="bg-gradient-primary"><Plus className="h-4 w-4 mr-1" />新增廠商</Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="搜尋代號、名稱、統編..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
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
                <TableHead>代號</TableHead><TableHead>名稱</TableHead><TableHead>聯絡人</TableHead>
                <TableHead>電話</TableHead><TableHead>統編</TableHead><TableHead>付款條件</TableHead>
                <TableHead>狀態</TableHead><TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}><TableCell colSpan={8}><Skeleton className="h-8 w-full" /></TableCell></TableRow>
              )) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-10">尚無資料</TableCell></TableRow>
              ) : filtered.map((v) => (
                <TableRow key={v.id}>
                  <TableCell className="font-mono text-xs">{v.code}</TableCell>
                  <TableCell className="font-medium">{v.name}</TableCell>
                  <TableCell>{v.contact ?? "—"}</TableCell>
                  <TableCell>{v.phone ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{v.tax_id ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{v.payment_terms ?? "—"}</TableCell>
                  <TableCell><Badge variant={v.status === "active" ? "default" : "secondary"}>{v.status === "active" ? "啟用" : "停用"}</Badge></TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(v)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => setDelId(v.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editing ? "編輯廠商" : "新增廠商"}</DialogTitle></DialogHeader>
          <div className="grid sm:grid-cols-2 gap-4 py-2 max-h-[60vh] overflow-y-auto">
            <div className="space-y-2"><Label>代號 *</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="V-0001" className="font-mono" /></div>
            <div className="space-y-2"><Label>名稱 *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="space-y-2"><Label>聯絡人</Label><Input value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} /></div>
            <div className="space-y-2"><Label>電話</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div className="space-y-2"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div className="space-y-2"><Label>統一編號</Label><Input value={form.tax_id} onChange={(e) => setForm({ ...form, tax_id: e.target.value })} className="font-mono" /></div>
            <div className="space-y-2"><Label>銀行帳號</Label><Input value={form.bank_account} onChange={(e) => setForm({ ...form, bank_account: e.target.value })} className="font-mono" /></div>
            <div className="space-y-2"><Label>付款條件</Label><Input value={form.payment_terms} onChange={(e) => setForm({ ...form, payment_terms: e.target.value })} placeholder="月結30天" /></div>
            <div className="space-y-2"><Label>狀態</Label>
              <Select value={form.status} onValueChange={(s) => setForm({ ...form, status: s })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="active">啟用</SelectItem><SelectItem value="inactive">停用</SelectItem></SelectContent>
              </Select>
            </div>
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

export const Route = createFileRoute("/_authenticated/vendors")({ component: Page });
