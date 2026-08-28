import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Crown, Pencil, TrendingUp, Coins, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  adminListVipBonusPools,
  upsertVipBonusPool,
  deleteVipBonusPool,
} from "@/lib/vip-bonus-pools.functions";

export const Route = createFileRoute("/_authenticated/dealer-tiers")({
  component: DealerTiersAdmin,
});


type Tier = {
  code: string;
  name: string;
  sort_order: number;
  required_pv: number;
  required_direct_vip: number;
  required_mentor_tier: string | null;
  required_mentor_count: number;
  condition_logic: string;
  rebate_rate: number;
  operating_bonus_rate: number;
  upgrade_bonus_cap: number;
  maintenance_window_days: number;
  maintenance_required_vip: number;
  description: string | null;
  status: string;
  monthly_points_required: number;
  global_bonus_rate: number;
  maintenance_required_new_e_store: number;
  daily_referral_rate: number;
};

const TIER_FIELDS =
  "code:legacy_code,name,sort_order,required_pv,required_direct_vip,required_mentor_tier,required_mentor_count,condition_logic,rebate_rate,operating_bonus_rate,upgrade_bonus_cap,maintenance_window_days,maintenance_required_vip,maintenance_required_new_e_store,monthly_points_required,global_bonus_rate,daily_referral_rate,description,status";

function tierType(code: string): "agent" | "star" | "director" {
  const c = String(code ?? "").toUpperCase();
  if (c === "DIRECTOR") return "director";
  if (/^(STAR[1-7]|V[1-8])$/.test(c)) return "star";
  return "agent";
}

function isBusinessDividendTier(tier: Pick<Tier, "code">) {
  return tierType(tier.code) !== "agent";
}

function DealerTiersAdmin() {
  const [tiers, setTiers] = useState<Tier[]>([]);
  const [editing, setEditing] = useState<Tier | null>(null);

  async function load() {
    const { data, error } = await supabase
      .from("vip_tiers")
      .select(TIER_FIELDS)
      .not("legacy_code", "is", null)
      .order("sort_order");
    if (error) { toast.error(error.message); return; }
    setTiers((data ?? []) as any);
  }
  useEffect(() => { load(); }, []);

  async function save() {
    if (!editing) return;
    const { code, ...payload } = editing;
    const { error } = await supabase
      .from("vip_tiers")
      .update({ ...payload, updated_at: new Date().toISOString() } as any)
      .eq("legacy_code", code);
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

      <BonusPoolsSection />

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">

        {tiers.map((t) => (
          <Card key={t.code} className="relative">
            <CardHeader className="flex flex-row justify-between items-start pb-2">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Badge variant={tierType(t.code) === "agent" ? "default" : tierType(t.code) === "star" ? "outline" : "destructive"}>{t.code}</Badge>
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
                {isBusinessDividendTier(t)
                  ? <li>• 營業分紅 {t.operating_bonus_rate}%（每日訂單總獎勵點由合格星級／董事平均分配）</li>
                  : <li>• 消費分紅 {t.rebate_rate}%（V/S/T/E/A，非營業分紅）</li>}
                {isBusinessDividendTier(t) && t.upgrade_bonus_cap > 0 && <li>• 營業分紅上限 NT$ {t.upgrade_bonus_cap.toLocaleString()}</li>}
                {!isBusinessDividendTier(t) && <li className="text-muted-foreground">• 消費回饋上限請於「VIP 階級設定」調整（business_bonus_cap_amount）</li>}
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
                <Field label={isBusinessDividendTier(editing) ? "營業分紅率 %" : "營業分紅率 %（V/S/T/E/A 不適用）"}>
                  <Input
                    type="number"
                    step="0.01"
                    value={editing.operating_bonus_rate}
                    disabled={!isBusinessDividendTier(editing)}
                    onChange={(e) => setEditing({ ...editing, operating_bonus_rate: +e.target.value })}
                  />
                </Field>
                <Field label={isBusinessDividendTier(editing) ? "營業分紅上限" : "營業分紅上限（V/S/T/E/A 不適用；消費回饋上限請至 VIP 階級設定）"}>
                  <Input
                    type="number"
                    value={editing.upgrade_bonus_cap}
                    disabled={!isBusinessDividendTier(editing)}
                    onChange={(e) => setEditing({ ...editing, upgrade_bonus_cap: +e.target.value })}
                  />
                </Field>
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

const emptyPool: any = {
  id: "",
  name: "",
  code: "",
  tier_codes: "",
  bonus_rate: 0.05,
  distribution_method: "equal",
  apply_total_income_cap: true,
  total_income_cap_amount: "",
  sort_order: 0,
  status: "active",
  description: "",
};

function poolCategory(codes: string[] | null | undefined): "consumption" | "business" | "other" {
  const arr = (codes ?? []).map((c) => String(c).toUpperCase());
  if (arr.some((c) => ["V", "S", "T", "E", "A"].includes(c))) return "consumption";
  if (arr.some((c) => /^(STAR[1-7]|DIRECTOR|[1-7])$/.test(c))) return "business";
  return "other";
}

function BonusPoolsSection() {
  const listFn = useServerFn(adminListVipBonusPools);
  const saveFn = useServerFn(upsertVipBonusPool);
  const delFn = useServerFn(deleteVipBonusPool);

  const [rows, setRows] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ ...emptyPool });

  async function load() {
    try { setRows((await listFn()) as any[]); } catch (e: any) { toast.error(e.message); }
  }
  useEffect(() => { load(); }, []);

  function edit(r: any) {
    setForm({
      ...emptyPool,
      ...r,
      tier_codes: Array.isArray(r.tier_codes) ? r.tier_codes.join(",") : (r.tier_codes ?? ""),
      total_income_cap_amount: r.total_income_cap_amount ?? "",
      description: r.description ?? "",
      code: r.code ?? "",
    });
    setOpen(true);
  }
  function add(preset: "consumption" | "business") {
    setForm({
      ...emptyPool,
      name: preset === "consumption" ? "消費分紅池 (V/S/T/E/A)" : "營業分紅池 (STAR1~DIRECTOR)",
      code: preset === "consumption" ? "POOL_VSTEA" : "POOL_STAR",
      tier_codes: preset === "consumption" ? "V,S,T,E,A" : "STAR1,STAR2,STAR3,STAR4,STAR5,STAR6,STAR7,DIRECTOR",
    });
    setOpen(true);
  }

  async function save() {
    try {
      const payload: any = {
        ...form,
        bonus_rate: Number(form.bonus_rate) || 0,
        sort_order: Number(form.sort_order) || 0,
        tier_codes: String(form.tier_codes || "").split(",").map((s: string) => s.trim()).filter(Boolean),
        total_income_cap_amount: form.total_income_cap_amount === "" ? null : Number(form.total_income_cap_amount),
        code: form.code || null,
        description: form.description || null,
      };
      if (!payload.id) delete payload.id;
      await saveFn({ data: payload });
      toast.success("已儲存");
      setOpen(false);
      load();
    } catch (e: any) { toast.error(e.message); }
  }

  async function remove(id: string) {
    if (!confirm("確定刪除此分紅池？")) return;
    try { await delFn({ data: { id } }); toast.success("已刪除"); load(); }
    catch (e: any) { toast.error(e.message); }
  }

  const consumption = rows.filter((r) => poolCategory(r.tier_codes) === "consumption");
  const business = rows.filter((r) => poolCategory(r.tier_codes) === "business");
  const others = rows.filter((r) => poolCategory(r.tier_codes) === "other");

  const renderTable = (list: any[], emptyHint: string) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>名稱</TableHead>
          <TableHead>代碼</TableHead>
          <TableHead>適用階級</TableHead>
          <TableHead>比例</TableHead>
          <TableHead>總收益上限</TableHead>
          <TableHead>狀態</TableHead>
          <TableHead className="w-[100px]">操作</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {list.length === 0 && (
          <TableRow><TableCell colSpan={7} className="text-center text-xs text-muted-foreground">{emptyHint}</TableCell></TableRow>
        )}
        {list.map((r) => (
          <TableRow key={r.id}>
            <TableCell className="font-medium">{r.name}</TableCell>
            <TableCell className="text-xs">{r.code ?? "—"}</TableCell>
            <TableCell className="text-xs">{(r.tier_codes ?? []).join(" / ") || "—"}</TableCell>
            <TableCell>{(Number(r.bonus_rate) * 100).toFixed(2)}%</TableCell>
            <TableCell className="text-xs">
              {r.apply_total_income_cap ? (r.total_income_cap_amount ? `NT$${Number(r.total_income_cap_amount).toLocaleString()}` : "—") : "不套用"}
            </TableCell>
            <TableCell><Badge variant={r.status === "active" ? "default" : "secondary"}>{r.status}</Badge></TableCell>
            <TableCell className="flex gap-1">
              <Button size="icon" variant="ghost" onClick={() => edit(r)}><Pencil className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" onClick={() => remove(r.id)}><Trash2 className="h-4 w-4" /></Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Coins className="h-5 w-5 text-primary" />分紅池設定
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          V/S/T/E/A 領「消費分紅」；一星以上（STAR1~DIRECTOR）領「營業分紅」。此處與
          <a href="/admin/vip-bonus-pools" className="underline mx-1">分紅池管理</a>共用同一份設定。
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">消費分紅池（V / S / T / E / A）</h3>
            <Button size="sm" variant="outline" onClick={() => add("consumption")}>
              <Plus className="h-3.5 w-3.5 mr-1" />新增消費池
            </Button>
          </div>
          {renderTable(consumption, "尚未建立消費分紅池")}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">營業分紅池（STAR1 ~ DIRECTOR）</h3>
            <Button size="sm" variant="outline" onClick={() => add("business")}>
              <Plus className="h-3.5 w-3.5 mr-1" />新增營業池
            </Button>
          </div>
          {renderTable(business, "尚未建立營業分紅池")}
        </div>

        {others.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground">其他 / 未分類</h3>
            {renderTable(others, "—")}
          </div>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{form.id ? "編輯" : "新增"}分紅池</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>名稱</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>代碼</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
            <div className="col-span-2"><Label>適用階級（逗號分隔，例 V,S,T,E,A 或 STAR1,STAR2）</Label>
              <Input value={form.tier_codes} onChange={(e) => setForm({ ...form, tier_codes: e.target.value })} />
            </div>
            <div><Label>分紅比例（0.05 = 5%）</Label>
              <Input type="number" step="0.0001" value={form.bonus_rate} onChange={(e) => setForm({ ...form, bonus_rate: e.target.value })} />
            </div>
            <div><Label>分配方式</Label>
              <select className="w-full border rounded h-9 px-2 bg-background" value={form.distribution_method} onChange={(e) => setForm({ ...form, distribution_method: e.target.value })}>
                <option value="equal">平均分配</option>
              </select>
            </div>
            <div className="flex items-center gap-2 pt-6">
              <Switch checked={!!form.apply_total_income_cap} onCheckedChange={(v) => setForm({ ...form, apply_total_income_cap: v })} />
              <Label>套用個人總收益上限</Label>
            </div>
            <div><Label>總收益上限金額</Label>
              <Input type="number" value={form.total_income_cap_amount} onChange={(e) => setForm({ ...form, total_income_cap_amount: e.target.value })} disabled={!form.apply_total_income_cap} />
            </div>
            <div><Label>排序</Label>
              <Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} />
            </div>
            <div><Label>狀態</Label>
              <select className="w-full border rounded h-9 px-2 bg-background" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
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
    </Card>
  );
}

