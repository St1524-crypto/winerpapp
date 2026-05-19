import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Tag, ArrowUp, ArrowDown, ChevronRight, Image as ImageIcon, Upload, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCategories } from "@/hooks/use-products";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Category } from "@/types/product";

export const Route = createFileRoute("/_authenticated/categories")({ component: CategoriesPage });

interface TreeNode extends Category { children: TreeNode[]; depth: number }

function buildTree(items: Category[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  items.forEach((c) => map.set(c.id, { ...c, children: [], depth: 0 }));
  const roots: TreeNode[] = [];
  map.forEach((n) => {
    if (n.parent_id && map.has(n.parent_id)) {
      const p = map.get(n.parent_id)!;
      n.depth = p.depth + 1;
      p.children.push(n);
    } else {
      roots.push(n);
    }
  });
  const sortRec = (arr: TreeNode[]) => {
    arr.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
    arr.forEach((x) => { x.children.forEach((c) => c.depth = x.depth + 1); sortRec(x.children); });
  };
  sortRec(roots);
  return roots;
}

function flatten(nodes: TreeNode[]): TreeNode[] {
  const out: TreeNode[] = [];
  const walk = (arr: TreeNode[]) => arr.forEach((n) => { out.push(n); walk(n.children); });
  walk(nodes);
  return out;
}

function CategoriesPage() {
  const { categories, loading, refresh } = useCategories();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<Category | null>(null);
  const [form, setForm] = useState({ name: "", parent_id: "", sort_order: 0, status: "active", image: "" });
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [delTarget, setDelTarget] = useState<Category | null>(null);

  const tree = useMemo(() => buildTree(categories), [categories]);
  const flat = useMemo(() => flatten(tree), [tree]);

  function openNew(parentId?: string) {
    setEdit(null);
    const siblings = categories.filter((c) => (c.parent_id ?? "") === (parentId ?? ""));
    const nextOrder = siblings.length ? Math.max(...siblings.map((s) => s.sort_order)) + 1 : 0;
    setForm({ name: "", parent_id: parentId ?? "", sort_order: nextOrder, status: "active", image: "" });
    setOpen(true);
  }
  function openEdit(c: Category) {
    setEdit(c);
    setForm({ name: c.name, parent_id: c.parent_id ?? "", sort_order: c.sort_order, status: c.status, image: c.image ?? "" });
    setOpen(true);
  }

  async function uploadImage(file: File) {
    if (file.size > 5 * 1024 * 1024) { toast.error("圖片超過 5MB"); return; }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() ?? "jpg";
      const path = `categories/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("product-images").upload(path, file, { cacheControl: "3600" });
      if (error) throw error;
      const { data } = supabase.storage.from("product-images").getPublicUrl(path);
      setForm((f) => ({ ...f, image: data.publicUrl }));
    } catch (e: any) { toast.error(e.message); }
    finally { setUploading(false); }
  }

  async function save() {
    if (!form.name.trim()) { toast.error("請輸入分類名稱"); return; }
    if (edit && form.parent_id === edit.id) { toast.error("不能將自己設為上層"); return; }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      parent_id: form.parent_id || null,
      sort_order: +form.sort_order || 0,
      status: form.status,
      image: form.image || null,
    };
    const { error } = edit
      ? await supabase.from("categories").update(payload).eq("id", edit.id)
      : await supabase.from("categories").insert(payload);
    setSaving(false);
    if (error) toast.error(error.message);
    else { toast.success(edit ? "已更新" : "已新增"); refresh(); setOpen(false); }
  }

  async function toggleStatus(c: Category) {
    const next = c.status === "active" ? "inactive" : "active";
    const { error } = await supabase.from("categories").update({ status: next }).eq("id", c.id);
    if (error) toast.error(error.message);
    else { toast.success(`已${next === "active" ? "啟用" : "停用"}「${c.name}」`); refresh(); }
  }

  async function move(node: TreeNode, dir: -1 | 1) {
    const siblings = categories
      .filter((c) => (c.parent_id ?? "") === (node.parent_id ?? ""))
      .sort((a, b) => a.sort_order - b.sort_order);
    const i = siblings.findIndex((s) => s.id === node.id);
    const j = i + dir;
    if (j < 0 || j >= siblings.length) return;
    const a = siblings[i], b = siblings[j];
    const { error } = await supabase.from("categories").upsert([
      { id: a.id, sort_order: b.sort_order, name: a.name, parent_id: a.parent_id, status: a.status },
      { id: b.id, sort_order: a.sort_order, name: b.name, parent_id: b.parent_id, status: b.status },
    ]);
    if (error) toast.error(error.message);
    else refresh();
  }

  async function confirmDelete() {
    if (!delTarget) return;
    const hasChildren = categories.some((c) => c.parent_id === delTarget.id);
    if (hasChildren) { toast.error("此分類底下還有子分類，請先處理"); setDelTarget(null); return; }
    const { error } = await supabase.from("categories").delete().eq("id", delTarget.id);
    if (error) toast.error(error.message);
    else { toast.success("已刪除"); refresh(); }
    setDelTarget(null);
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Tag className="h-6 w-6 text-primary" />商品分類管理</h1>
          <p className="text-sm text-muted-foreground mt-1">維護主分類、子分類、排序與啟用狀態</p>
        </div>
        <Button className="bg-gradient-primary" onClick={() => openNew()}><Plus className="h-4 w-4 mr-2" />新增主分類</Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : flat.length === 0 ? (
            <div className="text-center py-16">
              <Tag className="h-10 w-10 mx-auto text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground mt-3">尚未建立任何分類</p>
              <Button className="mt-4 bg-gradient-primary" onClick={() => openNew()}><Plus className="h-4 w-4 mr-2" />建立第一個分類</Button>
            </div>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-3 font-medium">分類名稱</th>
                    <th className="px-4 py-3 font-medium w-24 text-center">排序</th>
                    <th className="px-4 py-3 font-medium w-28 text-center">啟用</th>
                    <th className="px-4 py-3 font-medium w-40 text-right">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {flat.map((n) => {
                    const siblings = categories.filter((c) => (c.parent_id ?? "") === (n.parent_id ?? "")).sort((a, b) => a.sort_order - b.sort_order);
                    const idx = siblings.findIndex((s) => s.id === n.id);
                    const isFirst = idx === 0;
                    const isLast = idx === siblings.length - 1;
                    return (
                      <tr key={n.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2" style={{ paddingLeft: n.depth * 24 }}>
                            {n.depth > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                            <div className="h-9 w-9 rounded-md bg-muted overflow-hidden flex items-center justify-center shrink-0">
                              {n.image ? <img src={n.image} alt={n.name} className="h-full w-full object-cover" /> : <ImageIcon className="h-4 w-4 text-muted-foreground" />}
                            </div>
                            <div>
                              <div className="font-medium">{n.name}</div>
                              <div className="text-[11px] text-muted-foreground">{n.depth === 0 ? "主分類" : `子分類 · 上層：${categories.find((x) => x.id === n.parent_id)?.name ?? "—"}`}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="inline-flex items-center gap-1">
                            <Button size="icon" variant="ghost" className="h-7 w-7" disabled={isFirst} onClick={() => move(n, -1)}><ArrowUp className="h-3.5 w-3.5" /></Button>
                            <span className="w-6 text-xs font-mono text-muted-foreground">{n.sort_order}</span>
                            <Button size="icon" variant="ghost" className="h-7 w-7" disabled={isLast} onClick={() => move(n, 1)}><ArrowDown className="h-3.5 w-3.5" /></Button>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="inline-flex items-center gap-2">
                            <Switch checked={n.status === "active"} onCheckedChange={() => toggleStatus(n)} />
                            <Badge variant={n.status === "active" ? "default" : "outline"} className="text-[10px]">{n.status === "active" ? "啟用" : "停用"}</Badge>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex gap-1">
                            {n.depth === 0 && (
                              <Button size="icon" variant="ghost" className="h-8 w-8" title="新增子分類" onClick={() => openNew(n.id)}><Plus className="h-4 w-4" /></Button>
                            )}
                            <Button size="icon" variant="ghost" className="h-8 w-8" title="編輯" onClick={() => openEdit(n)}><Pencil className="h-4 w-4" /></Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" title="刪除" onClick={() => setDelTarget(n)}><Trash2 className="h-4 w-4" /></Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{edit ? "編輯分類" : "新增分類"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>分類名稱 *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="如：HEALTH、保健食品" /></div>
            <div className="space-y-2">
              <Label>上層分類</Label>
              <Select value={form.parent_id || "none"} onValueChange={(v) => setForm({ ...form, parent_id: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">無（主分類）</SelectItem>
                  {categories.filter((c) => c.id !== edit?.id && !c.parent_id).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>分類圖片</Label>
              <div className="flex items-center gap-3">
                <div className="h-16 w-16 rounded-md bg-muted overflow-hidden flex items-center justify-center border border-border shrink-0">
                  {form.image ? <img src={form.image} alt="" className="h-full w-full object-cover" /> : <ImageIcon className="h-5 w-5 text-muted-foreground" />}
                </div>
                <label className="flex-1">
                  <input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0])} />
                  <Button asChild variant="secondary" disabled={uploading}>
                    <span>{uploading ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />上傳中</> : <><Upload className="h-4 w-4 mr-2" />選擇圖片</>}</span>
                  </Button>
                </label>
                {form.image && <Button variant="ghost" size="sm" onClick={() => setForm({ ...form, image: "" })}>移除</Button>}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>排序</Label><Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: +e.target.value })} /></div>
              <div className="space-y-2 flex flex-col">
                <Label>啟用狀態</Label>
                <div className="flex items-center h-9 gap-2">
                  <Switch checked={form.status === "active"} onCheckedChange={(v) => setForm({ ...form, status: v ? "active" : "inactive" })} />
                  <span className="text-sm">{form.status === "active" ? "啟用" : "停用"}</span>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>取消</Button>
            <Button onClick={save} disabled={saving} className="bg-gradient-primary">
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}儲存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!delTarget} onOpenChange={(v) => !v && setDelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認刪除？</AlertDialogTitle>
            <AlertDialogDescription>分類「{delTarget?.name}」將被永久刪除，使用此分類的商品其分類欄位會清空。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground">刪除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
