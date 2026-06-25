import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Crown, Plus, Pencil, Trash2, Search, X } from "lucide-react";
import { toast } from "sonner";
import {
  adminListVipPackages, upsertVipPackage, deleteVipPackage, adminListVipTiers,
  searchProductsForVipPackage,
} from "@/lib/vip-tiers.functions";

export const Route = createFileRoute("/_authenticated/admin/vip-upgrade-packages")({
  component: VipPackagesAdmin,
  head: () => ({ meta: [{ title: "VIP 升級套組 — winerp" }] }),
});

type BoundProduct = { id: string; name?: string; sku?: string; price?: number };

const empty = {
  id: "", tier_code: "V", name: "", description: "",
  price: 0, bonus_points: 0, duration_days: 365, sort_order: 0, status: "active",
};

function VipPackagesAdmin() {
  const listFn = useServerFn(adminListVipPackages);
  const tiersFn = useServerFn(adminListVipTiers);
  const saveFn = useServerFn(upsertVipPackage);
  const delFn = useServerFn(deleteVipPackage);
  const searchFn = useServerFn(searchProductsForVipPackage);
  const [rows, setRows] = useState<any[]>([]);
  const [tiers, setTiers] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ ...empty });
  const [bound, setBound] = useState<BoundProduct[]>([]);
  const [productQuery, setProductQuery] = useState("");
  const [productResults, setProductResults] = useState<any[]>([]);

  async function doProductSearch() {
    try {
      const data: any = await searchFn({ data: { keyword: productQuery } });
      setProductResults(data ?? []);
    } catch (e: any) { toast.error(e?.message || "搜尋失敗"); }
  }

  async function load() {
    try {
      const [r, t] = await Promise.all([listFn(), tiersFn()]);
      setRows(r as any[]); setTiers(t as any[]);
    } catch (e: any) { toast.error(e.message); }
  }
  useEffect(() => { load(); }, []);

  function edit(r: any) {
    setForm({ ...empty, ...r, description: r.description ?? "" });
    setBound((r.products ?? []) as BoundProduct[]);
    setProductQuery(""); setProductResults([]);
    setOpen(true);
  }
  function add() {
    setForm({ ...empty });
    setBound([]);
    setProductQuery(""); setProductResults([]);
    setOpen(true);
  }

  function addBound(p: any) {
    if (bound.some((b) => b.id === p.id)) {
      toast.info("此商品已加入");
      return;
    }
    setBound([...bound, { id: p.id, name: p.name, sku: p.sku, price: p.price }]);
  }
  function removeBound(id: string) {
    setBound(bound.filter((b) => b.id !== id));
  }

  async function save() {
    try {
      const payload: any = {
        ...form,
        price: Number(form.price) || 0,
        bonus_points: Math.max(0, Math.floor(Number(form.bonus_points) || 0)),
        duration_days: Math.max(0, Math.floor(Number(form.duration_days) || 0)),
        sort_order: Math.floor(Number(form.sort_order) || 0),
        description: form.description || null,
        product_ids: bound.map((b) => b.id),
      };
      if (!payload.id) delete payload.id;
      await saveFn({ data: payload });
      toast.success("已儲存"); setOpen(false); load();
    } catch (e: any) { toast.error(e.message); }
  }

  async function remove(id: string) {
    if (!confirm("確定刪除此套組？")) return;
    try { await delFn({ data: { id } }); toast.success("已刪除"); load(); }
    catch (e: any) { toast.error(e.message); }
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2"><Crown className="h-6 w-6" />VIP 升級套組</h1>
        <Button onClick={add}><Plus className="h-4 w-4 mr-1" />新增套組</Button>
      </div>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {rows.map((r) => {
          const count = (r.products ?? []).length;
          return (
            <Card key={r.id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between text-base">
                  <span>[{r.tier_code}] {r.name}</span>
                  <Badge variant={r.status === "active" ? "default" : "secondary"}>{r.status}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-1">
                <div className="text-lg font-bold">NT$ {Number(r.price).toLocaleString()}</div>
                <div>贈送獎勵點：{r.bonus_points}（每組僅發 1 次）</div>
                <div>有效期：{r.duration_days > 0 ? `${r.duration_days} 天` : "永久"}</div>
                <div>綁定商品數：<span className="font-medium">{count}</span>
                  {count > 0
                    ? <Badge variant="default" className="ml-2">加入購物車</Badge>
                    : <Badge variant="outline" className="ml-2">直接購買（pending）</Badge>}
                </div>
                {count > 0 && (
                  <ul className="text-xs text-muted-foreground pl-3 list-disc">
                    {(r.products as BoundProduct[]).slice(0, 5).map((p) => (
                      <li key={p.id} className="truncate">{p.name} · {p.sku}</li>
                    ))}
                    {count > 5 && <li>…共 {count} 項</li>}
                  </ul>
                )}
                {r.description && <div className="text-muted-foreground">{r.description}</div>}
                <div className="flex gap-2 pt-2">
                  <Button size="sm" variant="outline" onClick={() => edit(r)}><Pencil className="h-3 w-3 mr-1" />編輯</Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(r.id)}><Trash2 className="h-3 w-3 mr-1" />刪除</Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {rows.length === 0 && <p className="text-muted-foreground">尚無套組</p>}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{form.id ? "編輯" : "新增"}升級套組</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>對應階級</Label>
              <select className="w-full border rounded h-9 px-2" value={form.tier_code} onChange={(e) => setForm({ ...form, tier_code: e.target.value })}>
                {tiers.map((t) => <option key={t.code} value={t.code}>{t.code} - {t.name}</option>)}
              </select>
            </div>
            <div><Label>狀態</Label>
              <select className="w-full border rounded h-9 px-2" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="active">啟用</option><option value="inactive">停用</option>
              </select>
            </div>
            <div className="col-span-2"><Label>套組名稱</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>價格 NT$</Label><Input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></div>
            <div><Label>贈送獎勵點（整組發 1 次）</Label><Input type="number" value={form.bonus_points} onChange={(e) => setForm({ ...form, bonus_points: e.target.value })} /></div>
            <div><Label>有效天數 (0=永久)</Label><Input type="number" value={form.duration_days} onChange={(e) => setForm({ ...form, duration_days: e.target.value })} /></div>
            <div><Label>排序</Label><Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} /></div>
            <div className="col-span-2"><Label>說明</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>

            <div className="col-span-2 space-y-2">
              <Label>綁定商品（可多個，任一付款後觸發升級；獎勵點仍依設定僅發 1 次）</Label>
              {bound.length > 0 ? (
                <ul className="border rounded-md divide-y">
                  {bound.map((b, idx) => (
                    <li key={b.id} className="flex items-center justify-between px-2 py-1 text-sm">
                      <span className="truncate">
                        <span className="text-muted-foreground mr-2">{idx + 1}.</span>
                        {b.name} <span className="text-muted-foreground">· {b.sku}</span>
                        {typeof b.price === "number" && <span className="text-muted-foreground"> · NT$ {b.price}</span>}
                      </span>
                      <Button type="button" variant="ghost" size="sm" onClick={() => removeBound(b.id)}>
                        <X className="h-3 w-3" />
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted-foreground">未綁定任何商品 → 將以「立即購買」建立 pending 升級單</p>
              )}
              <div className="flex gap-2">
                <Input
                  value={productQuery}
                  onChange={(e) => setProductQuery(e.target.value)}
                  placeholder="搜尋商品名稱 / SKU"
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); doProductSearch(); } }}
                />
                <Button type="button" variant="outline" onClick={doProductSearch}>
                  <Search className="h-4 w-4" />
                </Button>
              </div>
              {productResults.length > 0 && (
                <div className="border rounded-md divide-y max-h-40 overflow-auto">
                  {productResults.map((p) => (
                    <button
                      type="button"
                      key={p.id}
                      className="w-full flex items-center justify-between px-2 py-1 text-left hover:bg-muted text-sm"
                      onClick={() => addBound(p)}
                    >
                      <span className="truncate">{p.name} · <span className="text-muted-foreground">{p.sku}</span></span>
                      <span className="text-xs text-muted-foreground">NT$ {p.price}</span>
                    </button>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                提示：綁定商品為「贈品 / 搭售品」，建議將該商品的「reward_points」設為 0，避免訂單再額外發放單品獎勵點。
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
            <Button onClick={save}>儲存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
