import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Plus, Pencil, Trash2, Package, Search, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  adminListBundles, adminUpsertBundle, adminDeleteBundle,
} from "@/lib/repurchase-bundles.functions";

export const Route = createFileRoute("/_authenticated/admin/repurchase-bundles")({
  component: BundlesAdmin,
});

type BundleItemRow = { product_id: string; product_name?: string; sku?: string | null; quantity: number };
type BundleRow = {
  id?: string;
  name: string;
  slug: string;
  description: string;
  cover_image: string;
  bundle_price: number;
  bundle_reward_points: number;
  visibility: "all" | "vip" | "dealer";
  status: "active" | "inactive" | "draft";
  start_at: string;
  end_at: string;
  max_per_order: number | "";
  sort_order: number;
  items: BundleItemRow[];
};

const empty: BundleRow = {
  name: "", slug: "", description: "", cover_image: "",
  bundle_price: 0, bundle_reward_points: 0,
  visibility: "all", status: "draft",
  start_at: "", end_at: "", max_per_order: "", sort_order: 0, items: [],
};

function BundlesAdmin() {
  const list = useServerFn(adminListBundles);
  const upsert = useServerFn(adminUpsertBundle);
  const del = useServerFn(adminDeleteBundle);

  const [bundles, setBundles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<BundleRow>(empty);
  const [productQuery, setProductQuery] = useState("");
  const [productResults, setProductResults] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const rows = await list();
      setBundles(rows as any[]);
    } catch (e: any) { toast.error(e.message ?? "讀取失敗"); }
    setLoading(false);
  }
  useEffect(() => { refresh(); }, []);

  function openNew() {
    setEditing({ ...empty, items: [] });
    setProductResults([]);
    setProductQuery("");
    setOpen(true);
  }
  function openEdit(b: any) {
    setEditing({
      id: b.id,
      name: b.name ?? "",
      slug: b.slug ?? "",
      description: b.description ?? "",
      cover_image: b.cover_image ?? "",
      bundle_price: Number(b.bundle_price ?? 0),
      bundle_reward_points: Number(b.bundle_reward_points ?? 0),
      visibility: b.visibility ?? "all",
      status: b.status ?? "draft",
      start_at: b.start_at ? b.start_at.slice(0, 16) : "",
      end_at: b.end_at ? b.end_at.slice(0, 16) : "",
      max_per_order: b.max_per_order ?? "",
      sort_order: Number(b.sort_order ?? 0),
      items: (b.items ?? []).map((it: any) => ({
        product_id: it.product_id,
        product_name: it.product?.name,
        sku: it.product?.sku,
        quantity: Number(it.quantity ?? 1),
      })),
    });
    setProductResults([]);
    setProductQuery("");
    setOpen(true);
  }

  async function searchProducts() {
    if (!productQuery.trim()) return;
    const q = productQuery.trim();
    const { data } = await supabase
      .from("products")
      .select("id, name, sku, image, price, stock")
      .or(`name.ilike.%${q}%,sku.ilike.%${q}%`)
      .eq("status", "active")
      .limit(20);
    setProductResults(data ?? []);
  }

  function addProduct(p: any) {
    if (editing.items.some((i) => i.product_id === p.id)) return;
    setEditing({
      ...editing,
      items: [...editing.items, { product_id: p.id, product_name: p.name, sku: p.sku, quantity: 1 }],
    });
  }
  function removeProduct(pid: string) {
    setEditing({ ...editing, items: editing.items.filter((i) => i.product_id !== pid) });
  }
  function updateQty(pid: string, qty: number) {
    setEditing({
      ...editing,
      items: editing.items.map((i) => (i.product_id === pid ? { ...i, quantity: qty } : i)),
    });
  }

  async function save() {
    if (!editing.name || !editing.slug) { toast.error("請填寫名稱與 slug"); return; }
    if (editing.items.length === 0) { toast.error("請至少加入一項商品"); return; }
    setSaving(true);
    try {
      await upsert({
        data: {
          id: editing.id,
          name: editing.name,
          slug: editing.slug,
          description: editing.description || null,
          cover_image: editing.cover_image || null,
          bundle_price: editing.bundle_price,
          bundle_reward_points: editing.bundle_reward_points,
          visibility: editing.visibility,
          status: editing.status,
          start_at: editing.start_at ? new Date(editing.start_at).toISOString() : null,
          end_at: editing.end_at ? new Date(editing.end_at).toISOString() : null,
          max_per_order: editing.max_per_order === "" ? null : Number(editing.max_per_order),
          sort_order: Number(editing.sort_order) || 0,
          items: editing.items.map((i, idx) => ({
            product_id: i.product_id, quantity: Number(i.quantity) || 1, sort_order: idx,
          })),
        },
      });
      toast.success("已儲存");
      setOpen(false);
      refresh();
    } catch (e: any) { toast.error(e.message ?? "儲存失敗"); }
    setSaving(false);
  }

  async function remove(id: string) {
    if (!confirm("確定刪除此套組？")) return;
    try { await del({ data: { id } }); toast.success("已刪除"); refresh(); }
    catch (e: any) { toast.error(e.message ?? "刪除失敗"); }
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Package className="h-6 w-6" />復購優惠套組</h1>
          <p className="text-sm text-muted-foreground mt-1">將多項商品組成套組，整組定價，整組發放獎勵點。</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew}><Plus className="h-4 w-4 mr-1" />新增套組</Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editing.id ? "編輯套組" : "新增套組"}</DialogTitle></DialogHeader>
            <div className="grid gap-4 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>名稱 *</Label><Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
                <div><Label>Slug *</Label><Input value={editing.slug} placeholder="repurchase-2026-a" onChange={(e) => setEditing({ ...editing, slug: e.target.value })} /></div>
              </div>
              <div><Label>說明</Label><Textarea rows={2} value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></div>
              <div><Label>封面圖 URL</Label><Input value={editing.cover_image} onChange={(e) => setEditing({ ...editing, cover_image: e.target.value })} /></div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label>整組售價 *</Label><Input type="number" value={editing.bundle_price} onChange={(e) => setEditing({ ...editing, bundle_price: Number(e.target.value) })} /></div>
                <div><Label>整組獎勵點 *</Label><Input type="number" value={editing.bundle_reward_points} onChange={(e) => setEditing({ ...editing, bundle_reward_points: Number(e.target.value) })} /></div>
                <div><Label>單筆最多可買組數</Label><Input type="number" value={editing.max_per_order} placeholder="留空=不限" onChange={(e) => setEditing({ ...editing, max_per_order: e.target.value === "" ? "" : Number(e.target.value) })} /></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label>可見範圍</Label>
                  <Select value={editing.visibility} onValueChange={(v: any) => setEditing({ ...editing, visibility: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">所有人</SelectItem>
                      <SelectItem value="vip">VIP 專屬</SelectItem>
                      <SelectItem value="dealer">經銷專屬</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>狀態</Label>
                  <Select value={editing.status} onValueChange={(v: any) => setEditing({ ...editing, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">草稿</SelectItem>
                      <SelectItem value="active">上架</SelectItem>
                      <SelectItem value="inactive">下架</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>排序</Label><Input type="number" value={editing.sort_order} onChange={(e) => setEditing({ ...editing, sort_order: Number(e.target.value) })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>上架時間</Label><Input type="datetime-local" value={editing.start_at} onChange={(e) => setEditing({ ...editing, start_at: e.target.value })} /></div>
                <div><Label>下架時間</Label><Input type="datetime-local" value={editing.end_at} onChange={(e) => setEditing({ ...editing, end_at: e.target.value })} /></div>
              </div>

              <div className="border rounded-lg p-3 space-y-3">
                <div className="text-sm font-medium">套組商品明細</div>
                <div className="flex gap-2">
                  <Input placeholder="搜尋商品名或 SKU" value={productQuery} onChange={(e) => setProductQuery(e.target.value)} />
                  <Button type="button" variant="outline" onClick={searchProducts}><Search className="h-4 w-4" /></Button>
                </div>
                {productResults.length > 0 && (
                  <div className="border rounded p-2 max-h-40 overflow-y-auto space-y-1">
                    {productResults.map((p) => (
                      <div key={p.id} className="flex items-center justify-between text-xs">
                        <div>{p.name} <span className="text-muted-foreground">({p.sku})</span></div>
                        <Button size="sm" variant="ghost" onClick={() => addProduct(p)}><Plus className="h-3 w-3" /></Button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="space-y-1">
                  {editing.items.length === 0 && <div className="text-xs text-muted-foreground text-center py-3">尚未加入商品</div>}
                  {editing.items.map((it) => (
                    <div key={it.product_id} className="flex items-center gap-2 p-2 bg-muted/30 rounded">
                      <div className="flex-1 text-sm">
                        <div className="font-medium">{it.product_name || it.product_id}</div>
                        {it.sku && <div className="text-[10px] text-muted-foreground">{it.sku}</div>}
                      </div>
                      <div className="flex items-center gap-1">
                        <Label className="text-xs">件數</Label>
                        <Input type="number" min={1} value={it.quantity}
                          onChange={(e) => updateQty(it.product_id, Number(e.target.value))}
                          className="w-20" />
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => removeProduct(it.product_id)}><X className="h-4 w-4" /></Button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
              <Button onClick={save} disabled={saving}>{saving ? "儲存中…" : "儲存"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader><CardTitle>套組列表</CardTitle></CardHeader>
        <CardContent>
          {loading ? <div className="py-6 text-center text-muted-foreground">載入中…</div> : bundles.length === 0 ? (
            <div className="py-6 text-center text-muted-foreground">尚未建立任何套組</div>
          ) : (
            <div className="space-y-2">
              {bundles.map((b) => (
                <div key={b.id} className="flex items-center gap-3 p-3 border rounded-lg">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{b.name}</span>
                      <Badge variant="outline">{b.slug}</Badge>
                      <Badge variant={b.status === "active" ? "default" : "secondary"}>{b.status}</Badge>
                      <Badge variant="outline">{b.visibility}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      NT$ {Number(b.bundle_price).toLocaleString()} · 獎勵點 {b.bundle_reward_points} · {b.items?.length ?? 0} 項商品
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => openEdit(b)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(b.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
