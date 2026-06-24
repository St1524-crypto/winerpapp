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
import { Crown, Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  adminListVipPackages, upsertVipPackage, deleteVipPackage, adminListVipTiers,
} from "@/lib/vip-tiers.functions";

export const Route = createFileRoute("/_authenticated/admin/vip-upgrade-packages")({
  component: VipPackagesAdmin,
  head: () => ({ meta: [{ title: "VIP 升級套組 — winerp" }] }),
});

const empty = {
  id: "", tier_code: "V", name: "", description: "",
  price: 0, bonus_points: 0, duration_days: 365, sort_order: 0, status: "active",
};

function VipPackagesAdmin() {
  const listFn = useServerFn(adminListVipPackages);
  const tiersFn = useServerFn(adminListVipTiers);
  const saveFn = useServerFn(upsertVipPackage);
  const delFn = useServerFn(deleteVipPackage);
  const [rows, setRows] = useState<any[]>([]);
  const [tiers, setTiers] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ ...empty });

  async function load() {
    try {
      const [r, t] = await Promise.all([listFn(), tiersFn()]);
      setRows(r as any[]); setTiers(t as any[]);
    } catch (e: any) { toast.error(e.message); }
  }
  useEffect(() => { load(); }, []);

  function edit(r: any) { setForm({ ...empty, ...r, description: r.description ?? "" }); setOpen(true); }
  function add() { setForm({ ...empty }); setOpen(true); }

  async function save() {
    try {
      const payload: any = {
        ...form,
        price: Number(form.price) || 0,
        bonus_points: Math.max(0, Math.floor(Number(form.bonus_points) || 0)),
        duration_days: Math.max(0, Math.floor(Number(form.duration_days) || 0)),
        sort_order: Math.floor(Number(form.sort_order) || 0),
        description: form.description || null,
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
        {rows.map((r) => (
          <Card key={r.id}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between text-base">
                <span>[{r.tier_code}] {r.name}</span>
                <Badge variant={r.status === "active" ? "default" : "secondary"}>{r.status}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-1">
              <div className="text-lg font-bold">NT$ {Number(r.price).toLocaleString()}</div>
              <div>贈送獎勵點：{r.bonus_points}</div>
              <div>有效期：{r.duration_days > 0 ? `${r.duration_days} 天` : "永久"}</div>
              {r.description && <div className="text-muted-foreground">{r.description}</div>}
              <div className="flex gap-2 pt-2">
                <Button size="sm" variant="outline" onClick={() => edit(r)}><Pencil className="h-3 w-3 mr-1" />編輯</Button>
                <Button size="sm" variant="ghost" onClick={() => remove(r.id)}><Trash2 className="h-3 w-3 mr-1" />刪除</Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {rows.length === 0 && <p className="text-muted-foreground">尚無套組</p>}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
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
            <div><Label>贈送獎勵點</Label><Input type="number" value={form.bonus_points} onChange={(e) => setForm({ ...form, bonus_points: e.target.value })} /></div>
            <div><Label>有效天數 (0=永久)</Label><Input type="number" value={form.duration_days} onChange={(e) => setForm({ ...form, duration_days: e.target.value })} /></div>
            <div><Label>排序</Label><Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} /></div>
            <div className="col-span-2"><Label>說明</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
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
