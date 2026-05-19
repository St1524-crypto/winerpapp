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
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Plus, Search, Pencil, Trash2, Truck, Power } from "lucide-react";

interface Supplier {
  id: string; code: string; name: string;
  contact: string | null; phone: string | null; email: string | null;
  tax_id: string | null; bank_account: string | null; payment_terms: string | null;
  shipping_method: string | null;
  address: string | null; notes: string | null; status: string; created_at: string;
}

const empty = {
  code: "", name: "", contact: "", phone: "", email: "", tax_id: "",
  bank_account: "", payment_terms: "", shipping_method: "", address: "", notes: "",
  status: "active",
};

function Page() {
  const [list, setList] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [delId, setDelId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...empty });

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("vendors")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setList((data as Supplier[]) ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => list.filter((v) => {
    if (statusFilter !== "all" && v.status !== statusFilter) return false;
    if (search && ![v.code, v.name, v.contact, v.phone, v.email, v.tax_id]
      .some((x) => x?.toLowerCase().includes(search.toLowerCase()))) return false;
    return true;
  }), [list, search, statusFilter]);

  const activeCount = useMemo(() => list.filter((v) => v.status === "active").length, [list]);

  function openNew() { setEditing(null); setForm({ ...empty }); setOpen(true); }
  function openEdit(v: Supplier) {
    setEditing(v);
    setForm({
      code: v.code, name: v.name,
      contact: v.contact ?? "", phone: v.phone ?? "", email: v.email ?? "",
      tax_id: v.tax_id ?? "", bank_account: v.bank_account ?? "",
      payment_terms: v.payment_terms ?? "", shipping_method: v.shipping_method ?? "",
      address: v.address ?? "", notes: v.notes ?? "", status: v.status,
    });
    setOpen(true);
  }
  async function save() {
    if (!form.code.trim() || !form.name.trim()) { toast.error("代號與名稱為必填"); return; }
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      toast.error("Email 格式錯誤"); return;
    }
    const payload = {
      ...form,
      email: form.email || null,
      contact: form.contact || null,
      phone: form.phone || null,
      tax_id: form.tax_id || null,
      bank_account: form.bank_account || null,
      payment_terms: form.payment_terms || null,
      shipping_method: form.shipping_method || null,
      address: form.address || null,
      notes: form.notes || null,
    };
    const res = editing
      ? await supabase.from("vendors").update(payload).eq("id", editing.id)
      : await supabase.from("vendors").insert(payload);
    if (res.error) toast.error(res.error.message);
    else { toast.success(editing ? "已更新供應商" : "已新增供應商"); setOpen(false); load(); }
  }
  async function toggleStatus(v: Supplier) {
    const next = v.status === "active" ? "inactive" : "active";
    const { error } = await supabase.from("vendors").update({ status: next }).eq("id", v.id);
    if (error) toast.error(error.message);
    else { toast.success(`已${next === "active" ? "啟用" : "停用"}：${v.name}`); load(); }
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
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Truck className="h-6 w-6 text-primary" />供應商管理
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            管理進貨供應商基本資料、付款條件與配送方式
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="hidden md:inline-flex">
            共 {list.length} 家 / 啟用 {activeCount}
          </Badge>
          <Button onClick={openNew} className="bg-gradient-primary">
            <Plus className="h-4 w-4 mr-1" />新增供應商
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="搜尋代號、名稱、聯絡人、電話、Email、統編..."
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
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
                <TableHead>代號</TableHead>
                <TableHead>供應商名稱</TableHead>
                <TableHead>聯絡人</TableHead>
                <TableHead>電話</TableHead>
                <TableHead>統一編號</TableHead>
                <TableHead>付款條件</TableHead>
                <TableHead>配送方式</TableHead>
                <TableHead>狀態</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}><TableCell colSpan={9}><Skeleton className="h-8 w-full" /></TableCell></TableRow>
              )) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-10">
                    尚無供應商資料
                  </TableCell>
                </TableRow>
              ) : filtered.map((v) => (
                <TableRow key={v.id}>
                  <TableCell className="font-mono text-xs">{v.code}</TableCell>
                  <TableCell className="font-medium">{v.name}</TableCell>
                  <TableCell>{v.contact ?? "—"}</TableCell>
                  <TableCell>{v.phone ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{v.tax_id ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{v.payment_terms ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{v.shipping_method ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={v.status === "active" ? "default" : "secondary"}>
                      {v.status === "active" ? "啟用" : "停用"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" onClick={() => toggleStatus(v)} title={v.status === "active" ? "停用" : "啟用"}>
                      <Power className={`h-4 w-4 ${v.status === "active" ? "text-emerald-500" : "text-muted-foreground"}`} />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => openEdit(v)} title="編輯">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => setDelId(v.id)} title="刪除">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "編輯供應商" : "新增供應商"}</DialogTitle>
          </DialogHeader>
          <div className="grid sm:grid-cols-2 gap-4 py-2 max-h-[65vh] overflow-y-auto pr-1">
            <div className="space-y-2 sm:col-span-2">
              <p className="text-xs font-semibold text-muted-foreground tracking-wider">基本資料</p>
            </div>
            <div className="space-y-2">
              <Label>代號 *</Label>
              <Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="S-0001" className="font-mono" />
            </div>
            <div className="space-y-2">
              <Label>供應商名稱 *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="○○有限公司" />
            </div>
            <div className="space-y-2">
              <Label>統一編號</Label>
              <Input value={form.tax_id} onChange={(e) => setForm({ ...form, tax_id: e.target.value })} className="font-mono" placeholder="12345678" />
            </div>
            <div className="space-y-2">
              <Label>聯絡人</Label>
              <Input value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>電話</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="02-1234-5678" />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>地址</Label>
              <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>

            <div className="space-y-2 sm:col-span-2 pt-2">
              <p className="text-xs font-semibold text-muted-foreground tracking-wider">商業資訊</p>
            </div>
            <div className="space-y-2">
              <Label>付款條件</Label>
              <Input value={form.payment_terms} onChange={(e) => setForm({ ...form, payment_terms: e.target.value })} placeholder="月結30天" />
            </div>
            <div className="space-y-2">
              <Label>配送方式</Label>
              <Input value={form.shipping_method} onChange={(e) => setForm({ ...form, shipping_method: e.target.value })} placeholder="貨運 / 自取" />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>銀行帳號</Label>
              <Input value={form.bank_account} onChange={(e) => setForm({ ...form, bank_account: e.target.value })} className="font-mono" />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>備註</Label>
              <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>

            <div className="space-y-2 sm:col-span-2 pt-2 flex items-center justify-between border-t border-border/40">
              <div>
                <Label className="text-sm">啟用狀態</Label>
                <p className="text-xs text-muted-foreground mt-1">
                  停用後將無法在採購單中選用此供應商
                </p>
              </div>
              <Switch
                checked={form.status === "active"}
                onCheckedChange={(c) => setForm({ ...form, status: c ? "active" : "inactive" })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>取消</Button>
            <Button onClick={save} className="bg-gradient-primary">
              {editing ? "儲存變更" : "建立供應商"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!delId} onOpenChange={(v) => !v && setDelId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認刪除供應商？</AlertDialogTitle>
            <AlertDialogDescription>
              此動作無法復原。若該供應商已用於採購單，建議改為「停用」而非刪除。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={remove}>確認刪除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/suppliers")({ component: Page });
