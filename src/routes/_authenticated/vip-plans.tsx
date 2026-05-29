import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Crown, Plus, Pencil, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/vip-plans")({
  component: VipPlansAdmin,
});

const empty = { id: "", name: "", description: "", price: 0, duration_days: 365, bonus_points: 0, sort_order: 0, status: "active", referral_rate_percent: 0 };

function VipPlansAdmin() {
  const [plans, setPlans] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ ...empty });

  async function load() {
    const { data } = await supabase.from("vip_plans" as any).select("*").order("sort_order");
    setPlans((data ?? []) as any[]);
  }
  useEffect(() => { load(); }, []);

  async function save() {
    const payload = {
      name: form.name, description: form.description || null,
      price: Number(form.price) || 0, duration_days: Math.max(1, Math.floor(Number(form.duration_days) || 365)),
      bonus_points: Math.max(0, Math.floor(Number(form.bonus_points) || 0)),
      sort_order: Math.floor(Number(form.sort_order) || 0),
      status: form.status,
      referral_rate_percent: Math.max(0, Number(form.referral_rate_percent) || 0),
    };
    const q = form.id
      ? supabase.from("vip_plans" as any).update(payload).eq("id", form.id)
      : supabase.from("vip_plans" as any).insert(payload);
    const { error } = await q;
    if (error) { toast.error(error.message); return; }
    toast.success("已儲存");
    setOpen(false);
    setForm({ ...empty });
    load();
  }

  async function del(id: string) {
    if (!confirm("確認刪除此方案？")) return;
    const { error } = await supabase.from("vip_plans" as any).delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("已刪除");
    load();
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Crown className="h-6 w-6 text-primary" />VIP 方案管理</h1>
          <p className="text-sm text-muted-foreground mt-1">設定年費方案或升級套組</p>
        </div>
        <Button onClick={() => { setForm({ ...empty }); setOpen(true); }} className="bg-gradient-primary">
          <Plus className="h-4 w-4 mr-1" />新增方案
        </Button>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        {plans.map((p) => (
          <Card key={p.id}>
            <CardHeader className="flex flex-row justify-between items-start">
              <CardTitle className="text-base">{p.name}{p.status !== "active" && <span className="text-xs text-muted-foreground ml-2">（停用）</span>}</CardTitle>
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" onClick={() => { setForm(p); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" className="text-destructive" onClick={() => del(p.id)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </CardHeader>
            <CardContent className="text-sm space-y-1">
              <div>價格：<span className="font-medium">NT$ {Number(p.price).toLocaleString()}</span> / {p.duration_days} 天</div>
              <div>開通獎勵：{p.bonus_points} 點</div>
              {p.description && <p className="text-xs text-muted-foreground pt-1">{p.description}</p>}
            </CardContent>
          </Card>
        ))}
        {plans.length === 0 && <p className="col-span-full text-center text-muted-foreground py-12">尚無方案</p>}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{form.id ? "編輯方案" : "新增 VIP 方案"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>方案名稱</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5"><Label>價格</Label><Input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: +e.target.value })} /></div>
              <div className="space-y-1.5"><Label>天數</Label><Input type="number" value={form.duration_days} onChange={(e) => setForm({ ...form, duration_days: +e.target.value })} /></div>
              <div className="space-y-1.5"><Label>開通獎勵點</Label><Input type="number" value={form.bonus_points} onChange={(e) => setForm({ ...form, bonus_points: +e.target.value })} /></div>
            </div>
            <div className="space-y-1.5"><Label>描述</Label><Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div className="flex items-center gap-2"><Switch checked={form.status === "active"} onCheckedChange={(v) => setForm({ ...form, status: v ? "active" : "inactive" })} /><Label>啟用</Label></div>
          </div>
          <DialogFooter><Button variant="ghost" onClick={() => setOpen(false)}>取消</Button><Button onClick={save} className="bg-gradient-primary">儲存</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
