import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Pencil, Trash2, Boxes } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableHeader, TableBody, TableHead, TableRow, TableCell } from "@/components/ui/table";
import { useCategories } from "@/hooks/use-products";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Category } from "@/types/product";

export const Route = createFileRoute("/_authenticated/categories")({ component: CategoriesPage });

function CategoriesPage() {
  const { categories, refresh } = useCategories();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Category | null>(null);
  const [form, setForm] = useState({ name: "", parent_id: "", sort_order: 0, status: "active" });

  function openNew() { setEdit(null); setForm({ name: "", parent_id: "", sort_order: 0, status: "active" }); setOpen(true); }
  function openEdit(c: Category) { setEdit(c); setForm({ name: c.name, parent_id: c.parent_id ?? "", sort_order: c.sort_order, status: c.status }); setOpen(true); }

  async function save() {
    if (!form.name.trim()) { toast.error("請輸入分類名稱"); return; }
    const payload = { name: form.name.trim(), parent_id: form.parent_id || null, sort_order: +form.sort_order || 0, status: form.status };
    const { error } = edit
      ? await supabase.from("categories").update(payload).eq("id", edit.id)
      : await supabase.from("categories").insert(payload);
    if (error) toast.error(error.message);
    else { toast.success("已儲存"); refresh(); setOpen(false); }
  }

  async function del(c: Category) {
    if (!confirm(`刪除分類「${c.name}」？`)) return;
    const { error } = await supabase.from("categories").delete().eq("id", c.id);
    if (error) toast.error(error.message);
    else { toast.success("已刪除"); refresh(); }
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Boxes className="h-6 w-6 text-primary" />商品分類管理</h1>
          <p className="text-sm text-muted-foreground mt-1">維護主分類、子分類與顯示順序</p>
        </div>
        <Button className="bg-gradient-primary" onClick={openNew}><Plus className="h-4 w-4 mr-2" />新增分類</Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow><TableHead>名稱</TableHead><TableHead>上層</TableHead><TableHead>排序</TableHead><TableHead>狀態</TableHead><TableHead className="text-right">操作</TableHead></TableRow>
            </TableHeader>
            <TableBody>
              {categories.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="text-muted-foreground">{categories.find((x) => x.id === c.parent_id)?.name ?? "—"}</TableCell>
                  <TableCell>{c.sort_order}</TableCell>
                  <TableCell><Badge variant={c.status === "active" ? "default" : "outline"}>{c.status}</Badge></TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(c)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => del(c)}><Trash2 className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{edit ? "編輯分類" : "新增分類"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>名稱</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="space-y-2">
              <Label>上層分類</Label>
              <Select value={form.parent_id || "none"} onValueChange={(v) => setForm({ ...form, parent_id: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">無（主分類）</SelectItem>
                  {categories.filter((c) => c.id !== edit?.id).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>排序</Label><Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: +e.target.value })} /></div>
              <div className="space-y-2">
                <Label>狀態</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="active">啟用</SelectItem><SelectItem value="inactive">停用</SelectItem></SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>取消</Button>
            <Button onClick={save} className="bg-gradient-primary">儲存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
