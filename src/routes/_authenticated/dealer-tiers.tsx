import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Crown, Pencil, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/dealer-tiers")({
  component: DealerTiersAdmin,
});

type Tier = {
  code: string;
  name: string;
  tier_type: string;
  sort_order: number;
  required_pv: number;
  required_direct_vip: number;
  required_mentor_tier: string | null;
  required_mentor_count: number;
  condition_logic: string;
  rebate_rate: number;
  operating_bonus_rate: number;
  upgrade_bonus_cap: number;
  special_bonus_rate: number;
  special_bonus_trigger_count: number;
  special_bonus_label: string | null;
  maintenance_window_days: number;
  maintenance_required_vip: number;
  description: string | null;
  status: string;
  monthly_points_required: number;
  freeze_when_points_below: boolean;
  global_bonus_rate: number;
  global_bonus_income_threshold: number;
  maintenance_required_new_e_store: number;
  daily_referral_rate: number;
};


function DealerTiersAdmin() {
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [editing, setEditing] = useState<Tier | null>(null);

  async function load() {
    const { data, error } = await supabase
      .from("dealer_tiers" as any)
      .select("*")
      .order("sort_order");
    if (error) { toast.error(error.message); return; }
    setTiers((data ?? []) as any);
  }
  useEffect(() => { load(); }, []);

  async function save() {
    if (!editing) return;
    const { code, ...payload } = editing;
    const { error } = await supabase
      .from("dealer_tiers" as any)
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq("code", code);
    if (error) { toast.error(error.message); return; }
    toast.success(`已更新 ${editing.name}`);
    setEditing(null);
    load();
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Crown className="h-6 w-6 text-primary" />VIP獎金參數管理
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          管理 V / S / T / E / A / V1–V8 階級的晉升條件與獎勵設定。所有條件可動態調整，系統會依此自動判定升階。
        </p>

      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {tiers.map((t) => (
          <Card key={t.code} className="relative">
            <CardHeader className="flex flex-row justify-between items-start pb-2">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Badge variant={t.tier_type === "agent" ? "default" : t.tier_type === "star" ? "outline" : t.tier_type === "director" ? "destructive" : "secondary"}>{t.code}</Badge>
                  {t.name}
                </CardTitle>

                <p className="text-xs text-muted-foreground mt-1">{t.description}</p>
              </div>
              <Button size="icon" variant="ghost" onClick={() => setEditing(t)}>
                <Pencil className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="text-sm space-y-2">
              <div className="text-xs font-semibold text-muted-foreground mt-2">晉升條件（{t.condition_logic}）</div>
              <ul className="text-xs space-y-1 ml-1">
                {t.required_pv > 0 && <li>• 獎勵點 ≥ {t.required_pv.toLocaleString()}</li>}
                {t.required_direct_vip > 0 && <li>• 直推 VIP ≥ {t.required_direct_vip}</li>}
                {t.required_mentor_tier && t.required_mentor_count > 0 && (
                  <li>• 輔導 {t.required_mentor_count} 位下線達 {t.required_mentor_tier} 級</li>
                )}
              </ul>
              <div className="text-xs font-semibold text-muted-foreground pt-2">獎勵</div>
              <ul className="text-xs space-y-1 ml-1">
                <li>• 回饋率 {t.rebate_rate}%</li>
                {t.daily_referral_rate > 0 && <li>• 日獎金推薦 {t.daily_referral_rate}%（差額制）</li>}
                {t.operating_bonus_rate > 0 && <li>• 營業分紅 {t.operating_bonus_rate}%（每日訂單總獎勵點 5% 由合格星級平均分配）</li>}
                {t.upgrade_bonus_cap > 0 && <li>• 營業分紅上限 NT$ {t.upgrade_bonus_cap.toLocaleString()}</li>}
                {t.special_bonus_rate > 0 && (
                  <li className="text-primary">★ 當月新增 {t.special_bonus_trigger_count} VIP → {t.special_bonus_label} {t.special_bonus_rate}%</li>
                )}
              </ul>
              {t.maintenance_window_days > 0 && (
                <>
                  <div className="text-xs font-semibold text-muted-foreground pt-2">續領（每 {t.maintenance_window_days} 天）</div>
                  <ul className="text-xs space-y-1 ml-1">
                    {t.maintenance_required_vip > 0 && <li>• 新增 ≥ {t.maintenance_required_vip} 位 VIP</li>}
                    {t.maintenance_required_new_e_store > 0 && <li>• 輔導 ≥ {t.maintenance_required_new_e_store} 位新 E 店</li>}
                  </ul>
                </>
              )}
              {(t.monthly_points_required > 0 || t.global_bonus_rate > 0) && (
                <>
                  <div className="text-xs font-semibold text-muted-foreground pt-2">月度規則</div>
                  <ul className="text-xs space-y-1 ml-1">
                    {t.freeze_when_points_below && t.monthly_points_required > 0 && (
                      <li>• 月個人點數 &lt; {t.monthly_points_required} → 凍結領取</li>
                    )}
                    {t.global_bonus_rate > 0 && (
                      <li className="text-primary">★ 月收 &lt; NT$ {t.global_bonus_income_threshold.toLocaleString()} → 全球分紅 {t.global_bonus_rate}%</li>
                    )}
                  </ul>
                </>
              )}
            </CardContent>
          </Card>
        ))}

      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>編輯階級 — {editing?.name}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="名稱"><Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></Field>
                <Field label="排序">
                  <Input type="number" value={editing.sort_order} onChange={(e) => setEditing({ ...editing, sort_order: +e.target.value })} />
                </Field>
              </div>

              <div className="text-sm font-semibold pt-2 flex items-center gap-2"><TrendingUp className="h-4 w-4" />晉升條件</div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="所需獎勵點"><Input type="number" value={editing.required_pv} onChange={(e) => setEditing({ ...editing, required_pv: +e.target.value })} /></Field>
                <Field label="所需直推 VIP 數"><Input type="number" value={editing.required_direct_vip} onChange={(e) => setEditing({ ...editing, required_direct_vip: +e.target.value })} /></Field>
                <Field label="所需輔導下線階級">
                  <Select value={editing.required_mentor_tier ?? "none"} onValueChange={(v) => setEditing({ ...editing, required_mentor_tier: v === "none" ? null : v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">無</SelectItem>
                      {tiers.map((t) => <SelectItem key={t.code} value={t.code}>{t.code} — {t.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="所需輔導人數"><Input type="number" value={editing.required_mentor_count} onChange={(e) => setEditing({ ...editing, required_mentor_count: +e.target.value })} /></Field>
                <Field label="條件邏輯">
                  <Select value={editing.condition_logic} onValueChange={(v) => setEditing({ ...editing, condition_logic: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="OR">任一達成 (OR)</SelectItem>
                      <SelectItem value="AND">全部達成 (AND)</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              <div className="text-sm font-semibold pt-2">獎勵設定</div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="回饋率 %"><Input type="number" step="0.01" value={editing.rebate_rate} onChange={(e) => setEditing({ ...editing, rebate_rate: +e.target.value })} /></Field>
                <Field label="日獎金推薦 %（差額制）"><Input type="number" step="0.01" value={editing.daily_referral_rate} onChange={(e) => setEditing({ ...editing, daily_referral_rate: +e.target.value })} /></Field>
                <Field label="營業分紅率 %"><Input type="number" step="0.01" value={editing.operating_bonus_rate} onChange={(e) => setEditing({ ...editing, operating_bonus_rate: +e.target.value })} /></Field>
                <Field label="營業分紅上限"><Input type="number" value={editing.upgrade_bonus_cap} onChange={(e) => setEditing({ ...editing, upgrade_bonus_cap: +e.target.value })} /></Field>
                <Field label="特別獎勵名稱"><Input value={editing.special_bonus_label ?? ""} onChange={(e) => setEditing({ ...editing, special_bonus_label: e.target.value || null })} /></Field>
                <Field label="特別獎勵 %"><Input type="number" step="0.01" value={editing.special_bonus_rate} onChange={(e) => setEditing({ ...editing, special_bonus_rate: +e.target.value })} /></Field>
                <Field label="特別獎勵觸發人數"><Input type="number" value={editing.special_bonus_trigger_count} onChange={(e) => setEditing({ ...editing, special_bonus_trigger_count: +e.target.value })} /></Field>
              </div>

              <div className="text-sm font-semibold pt-2">續領條件</div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="考核窗口期（天）"><Input type="number" value={editing.maintenance_window_days} onChange={(e) => setEditing({ ...editing, maintenance_window_days: +e.target.value })} /></Field>
                <Field label="期內需新增 VIP 數"><Input type="number" value={editing.maintenance_required_vip} onChange={(e) => setEditing({ ...editing, maintenance_required_vip: +e.target.value })} /></Field>
                <Field label="期內需輔導新 E 店"><Input type="number" value={editing.maintenance_required_new_e_store} onChange={(e) => setEditing({ ...editing, maintenance_required_new_e_store: +e.target.value })} /></Field>
              </div>

              <div className="text-sm font-semibold pt-2">月度規則（星級代理店）</div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="月個人責任額點數門檻"><Input type="number" value={editing.monthly_points_required} onChange={(e) => setEditing({ ...editing, monthly_points_required: +e.target.value })} /></Field>
                <Field label="低於門檻凍結領取">
                  <Select value={editing.freeze_when_points_below ? "yes" : "no"} onValueChange={(v) => setEditing({ ...editing, freeze_when_points_below: v === "yes" })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="yes">是</SelectItem>
                      <SelectItem value="no">否</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="全球分紅 %"><Input type="number" step="0.01" value={editing.global_bonus_rate} onChange={(e) => setEditing({ ...editing, global_bonus_rate: +e.target.value })} /></Field>
                <Field label="全球分紅月收入門檻"><Input type="number" value={editing.global_bonus_income_threshold} onChange={(e) => setEditing({ ...editing, global_bonus_income_threshold: +e.target.value })} /></Field>
              </div>

            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>取消</Button>
            <Button onClick={save} className="bg-gradient-primary">儲存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
