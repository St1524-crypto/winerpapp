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
import { Crown, Plus, Pencil } from "lucide-react";
import { toast } from "sonner";
import { adminListVipTiers, upsertVipTier } from "@/lib/vip-tiers.functions";

export const Route = createFileRoute("/_authenticated/admin/vip-tiers")({
  component: VipTiersAdmin,
  head: () => ({ meta: [{ title: "VIP 階級設定 — winerp" }] }),
});

const emptyTier = {
  id: "",
  code: "",
  name: "",
  sort_order: 0,
  required_reward_points: 0,
  required_direct_vip: 0,
  required_mentor_tier: "",
  required_mentor_count: 0,
  cashback_rate: 0,
  revenue_share_rate: 0,
  upgrade_bonus_cap: 0,
  renewal_window_days: 0,
  renewal_required_new_vip: 0,
  description: "",
  status: "active",
};

function VipTiersAdmin() {
  const listFn = useServerFn(adminListVipTiers);
  const saveFn = useServerFn(upsertVipTier);
  const [rows, setRows] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ ...emptyTier });

  async function load() {
    try { setRows((await listFn()) as any[]); } catch (e: any) { toast.error(e.message); }
  }
  useEffect(() => { load(); }, []);

  function edit(r: any) {
    setForm({
      ...emptyTier,
      ...r,
      required_mentor_tier: r.required_mentor_tier ?? "",
      description: r.description ?? "",
    });
    setOpen(true);
  }
  function add() { setForm({ ...emptyTier }); setOpen(true); }

  async function save() {
    try {
      const payload: any = {
        ...form,
        sort_order: Number(form.sort_order) || 0,
        required_reward_points: Number(form.required_reward_points) || 0,
        required_direct_vip: Number(form.required_direct_vip) || 0,
        required_mentor_count: Number(form.required_mentor_count) || 0,
        cashback_rate: Number(form.cashback_rate) || 0,
        revenue_share_rate: Number(form.revenue_share_rate) || 0,
        upgrade_bonus_cap: Number(form.upgrade_bonus_cap) || 0,
        renewal_window_days: Number(form.renewal_window_days) || 0,
        renewal_required_new_vip: Number(form.renewal_required_new_vip) || 0,
        required_mentor_tier: form.required_mentor_tier || null,
        description: form.description || null,
      };
      if (!payload.id) delete payload.id;
      await saveFn({ data: payload });
      toast.success("已儲存");
      setOpen(false);
      load();
    } catch (e: any) { toast.error(e.message); }
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2"><Crown className="h-6 w-6" />VIP 階級設定</h1>
        <Button onClick={add}><Plus className="h-4 w-4 mr-1" />新增階級</Button>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        {rows.map((r) => (
          <Card key={r.id}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>{r.code} — {r.name}</span>
                <div className="flex gap-2">
                  <Badge variant={r.status === "active" ? "default" : "secondary"}>{r.status}</Badge>
                  <Button size="sm" variant="ghost" onClick={() => edit(r)}><Pencil className="h-4 w-4" /></Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm space-y-1">
              <div>獎勵點門檻：{r.required_reward_points.toLocaleString()}</div>
              <div>直推 VIP：{r.required_direct_vip}</div>
              {r.required_mentor_tier && <div>輔導：{r.required_mentor_count} × {r.required_mentor_tier}</div>}
              <div>回饋率：{r.cashback_rate}%　營業分紅：{r.revenue_share_rate}%</div>
              <div>升級分紅上限：{Number(r.upgrade_bonus_cap).toLocaleString()}</div>
              {r.renewal_window_days > 0 && <div>續領：每 {r.renewal_window_days} 天需新增 {r.renewal_required_new_vip} VIP</div>}
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{form.id ? "編輯" : "新增"} VIP 階級</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>階級碼 (V/S/T/E/A)</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
            <div><Label>名稱</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>排序</Label><Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} /></div>
            <div><Label>獎勵點門檻</Label><Input type="number" value={form.required_reward_points} onChange={(e) => setForm({ ...form, required_reward_points: e.target.value })} /></div>
            <div><Label>直推 VIP 數</Label><Input type="number" value={form.required_direct_vip} onChange={(e) => setForm({ ...form, required_direct_vip: e.target.value })} /></div>
            <div><Label>輔導下線階級</Label><Input value={form.required_mentor_tier} onChange={(e) => setForm({ ...form, required_mentor_tier: e.target.value })} /></div>
            <div><Label>輔導人數</Label><Input type="number" value={form.required_mentor_count} onChange={(e) => setForm({ ...form, required_mentor_count: e.target.value })} /></div>
            <div><Label>回饋率 %</Label><Input type="number" step="0.01" value={form.cashback_rate} onChange={(e) => setForm({ ...form, cashback_rate: e.target.value })} /></div>
            <div><Label>營業分紅 %</Label><Input type="number" step="0.01" value={form.revenue_share_rate} onChange={(e) => setForm({ ...form, revenue_share_rate: e.target.value })} /></div>
            <div><Label>升級分紅上限</Label><Input type="number" value={form.upgrade_bonus_cap} onChange={(e) => setForm({ ...form, upgrade_bonus_cap: e.target.value })} /></div>
            <div><Label>續領週期(天)</Label><Input type="number" value={form.renewal_window_days} onChange={(e) => setForm({ ...form, renewal_window_days: e.target.value })} /></div>
            <div><Label>續領需新增 VIP</Label><Input type="number" value={form.renewal_required_new_vip} onChange={(e) => setForm({ ...form, renewal_required_new_vip: e.target.value })} /></div>
            <div className="col-span-2"><Label>說明</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div><Label>狀態</Label>
              <select className="w-full border rounded h-9 px-2" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="active">啟用</option><option value="inactive">停用</option>
              </select>
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
