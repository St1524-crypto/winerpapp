import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Warehouse } from "lucide-react";

const sb: any = supabase;
interface WH { id: string; warehouse_code: string; name: string; address: string | null; status: string; notes: string | null; created_at: string; }
const empty = { warehouse_code: "", name: "", address: "", notes: "", status: "active" };

function Page() {
  const [list, setList] = useState<WH[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<WH | null>(null);
  const [form, setForm] = useState({ ...empty });
  const [counts, setCounts] = useState<Record<string, number>>({});

  async function load() {
    setLoading(true);
    const { data, error } = await sb.from("warehouses").select("*").order("warehouse_code");
    if (error) toast.error(error.message); else setList(data ?? []);
    const { data: inv } = await sb.from("warehouse_inventory").select("warehouse_id, stock");
    const c: Record<string, number> = {};
    (inv ?? []).forEach((r: any) => { c[r.warehouse_id] = (c[r.warehouse_id] ?? 0) + (r.stock ?? 0); });
    setCounts(c);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function openNew() { setEditing(null); setForm({ ...empty }); setOpen(true); }
  function openEdit(w: WH) { setEditing(w); setForm({ warehouse_code: w.warehouse_code, name: w.name, address: w.address ?? "", notes: w.notes ?? "", status: w.status }); setOpen(true); }
  async function save() {
    if (!form.warehouse_code.trim() || !form.name.trim()) return toast.error("代號與名稱為必填");
    const res = editing
      ? await sb.from("warehouses").update(form).eq("id", editing.id)
      : await sb.from("warehouses").insert(form);
    if (res.error) toast.error(res.error.message); else { toast.success(editing ? "已更新" : "已新增"); setOpen(false); load(); }
  }
  async function remove(w: WH) {
    if (!confirm(`確定刪除「${w.name}」？`)) return;
    const { error } = await sb.from("warehouses").delete().eq("id", w.id);
    if (error) toast.error(error.message); else { toast.success("已刪除"); load(); }
  }

  return (
    <div className="max-w-[1400px] mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Warehouse className="h-6 w-6 text-primary" />倉庫管理</h1>
          <p className="text-sm text-muted-foreground mt-1">管理多個倉庫與其庫存總量</p>
        </div>
        <Button onClick={openNew} className="bg-gradient-primary"><Plus className="h-4 w-4 mr-1" />新增倉庫</Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>代號</TableHead><TableHead>名稱</TableHead><TableHead>地址</TableHead>
                <TableHead className="text-right">總庫存</TableHead><TableHead>狀態</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}><TableCell colSpan={6}><Skeleton className="h-8 w-full" /></TableCell></TableRow>
              )) : list.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-10">尚無倉庫</TableCell></TableRow>
              ) : list.map((w) => (
                <TableRow key={w.id}>
                  <TableCell className="font-mono text-xs">{w.warehouse_code}</TableCell>
                  <TableCell className="font-medium">{w.name}</TableCell>
                  <TableCell className="text-muted-foreground">{w.address ?? "—"}</TableCell>
                  <TableCell className="text-right font-mono">{(counts[w.id] ?? 0).toLocaleString()}</TableCell>
                  <TableCell><Badge variant={w.status === "active" ? "default" : "secondary"}>{w.status === "active" ? "啟用" : "停用"}</Badge></TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(w)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => remove(w)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "編輯倉庫" : "新增倉庫"}</DialogTitle></DialogHeader>
          <div className="grid sm:grid-cols-2 gap-4 py-2">
            <div className="space-y-2"><Label>代號 *</Label><Input value={form.warehouse_code} onChange={(e) => setForm({ ...form, warehouse_code: e.target.value })} className="font-mono" placeholder="WH-001" /></div>
            <div className="space-y-2"><Label>名稱 *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="space-y-2 sm:col-span-2"><Label>地址</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
            <div className="space-y-2"><Label>狀態</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="active">啟用</SelectItem><SelectItem value="inactive">停用</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2"><Label>備註</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>取消</Button>
            <Button onClick={save} className="bg-gradient-primary">{editing ? "儲存" : "建立"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/warehouses")({ component: Page });
