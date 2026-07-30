import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Pencil, Trash2, Gift, Calculator, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type AppRole } from "@/hooks/use-auth";
import { ForbiddenScreen } from "@/components/ForbiddenScreen";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchSelect } from "@/components/ui/search-select";
import { fetchAllGiftRules } from "@/lib/gift-rules-client";
import {
  GIFT_TRIGGER_LABEL,
  computeGifts,
  triggerSummary,
  type GiftRule,
  type GiftTriggerType,
} from "@/lib/gift-rules";

const ALLOWED: AppRole[] = ["super_admin", "admin", "sales"];

export const Route = createFileRoute("/_authenticated/admin/gift-rules")({
  component: Guard,
  head: () => ({
    meta: [
      { title: "多件可加贈品設定 | 源晶 ERP" },
      { name: "description", content: "設定滿件／滿額自動加贈規則，支援倍數累加、通路限定與贈品上限。" },
      { property: "og:title", content: "多件可加贈品設定 | 源晶 ERP" },
      { property: "og:description", content: "設定滿件／滿額自動加贈規則，支援倍數累加與贈品上限。" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function Guard() {
  const { roles, loading } = useAuth();
  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!roles.some((r) => ALLOWED.includes(r))) return <ForbiddenScreen requiredRoles={ALLOWED} pageName="多件可加贈品設定" />;
  return <Page />;
}

type ProductLite = { id: string; name: string; sku: string | null };

interface FormState {
  id?: string;
  name: string;
  is_active: boolean;
  starts_at: string;
  ends_at: string;
  trigger_type: GiftTriggerType;
  threshold: string;
  channel_shop: boolean;
  channel_b2b: boolean;
  max_gift_qty: string;
  priority: string;
  note: string;
  product_ids: string[];
  gifts: { product_id: string; gift_qty: number }[];
}

const EMPTY_FORM: FormState = {
  name: "", is_active: true, starts_at: "", ends_at: "",
  trigger_type: "product_qty", threshold: "5",
  channel_shop: true, channel_b2b: true,
  max_gift_qty: "0", priority: "0", note: "",
  product_ids: [], gifts: [],
};

function Page() {
  const [rules, setRules] = useState<GiftRule[]>([]);
  const [products, setProducts] = useState<ProductLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, { data: p }] = await Promise.all([
        fetchAllGiftRules(),
        supabase.from("products").select("id, name, sku").order("name"),
      ]);
      setRules(r);
      setProducts((p ?? []) as ProductLite[]);
    } catch (e: any) {
      toast.error(e?.message ?? "載入失敗");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const productOptions = useMemo(
    () => products.map((p) => ({ value: p.id, label: p.name, hint: p.sku ?? undefined, keywords: `${p.name} ${p.sku ?? ""}` })),
    [products],
  );
  const productName = useCallback((id: string) => products.find((p) => p.id === id)?.name ?? id.slice(0, 8), [products]);

  function openNew() { setForm(EMPTY_FORM); setOpen(true); }

  function openEdit(r: GiftRule & { note?: string | null }) {
    setForm({
      id: r.id,
      name: r.name,
      is_active: r.is_active !== false,
      starts_at: r.starts_at ?? "",
      ends_at: r.ends_at ?? "",
      trigger_type: r.trigger_type,
      threshold: String(r.threshold),
      channel_shop: r.channel_shop !== false,
      channel_b2b: r.channel_b2b !== false,
      max_gift_qty: String(r.max_gift_qty ?? 0),
      priority: String(r.priority ?? 0),
      note: (r as any).note ?? "",
      product_ids: [...r.product_ids],
      gifts: r.gifts.map((g) => ({ product_id: g.product_id, gift_qty: g.gift_qty })),
    });
    setOpen(true);
  }

  async function save() {
    if (!form.name.trim()) { toast.error("請輸入規則名稱"); return; }
    if (!form.gifts.length) { toast.error("請至少設定一項贈品"); return; }
    if ((form.trigger_type === "product_qty" || form.trigger_type === "group_qty") && !form.product_ids.length) {
      toast.error("此觸發方式需選擇觸發商品"); return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        is_active: form.is_active,
        starts_at: form.starts_at || null,
        ends_at: form.ends_at || null,
        trigger_type: form.trigger_type,
        threshold: Number(form.threshold) || 1,
        channel_shop: form.channel_shop,
        channel_b2b: form.channel_b2b,
        max_gift_qty: Number(form.max_gift_qty) || 0,
        priority: Number(form.priority) || 0,
        note: form.note || null,
      };
      let ruleId = form.id;
      if (ruleId) {
        const { error } = await (supabase as any).from("gift_rules").update(payload).eq("id", ruleId);
        if (error) throw error;
        await (supabase as any).from("gift_rule_conditions").delete().eq("rule_id", ruleId);
        await (supabase as any).from("gift_rule_gifts").delete().eq("rule_id", ruleId);
      } else {
        const { data, error } = await (supabase as any).from("gift_rules").insert(payload).select("id").single();
        if (error) throw error;
        ruleId = data.id;
      }
      if (form.product_ids.length) {
        const { error } = await (supabase as any).from("gift_rule_conditions")
          .insert(form.product_ids.map((pid) => ({ rule_id: ruleId, product_id: pid })));
        if (error) throw error;
      }
      const { error: gErr } = await (supabase as any).from("gift_rule_gifts")
        .insert(form.gifts.map((g) => ({ rule_id: ruleId, product_id: g.product_id, gift_qty: g.gift_qty })));
      if (gErr) throw gErr;

      toast.success("已儲存贈品規則");
      setOpen(false);
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "儲存失敗");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(r: GiftRule) {
    const { error } = await (supabase as any).from("gift_rules").update({ is_active: !r.is_active }).eq("id", r.id);
    if (error) { toast.error(error.message); return; }
    await load();
  }

  async function remove(r: GiftRule) {
    if (!confirm(`確定刪除規則「${r.name}」？`)) return;
    const { error } = await (supabase as any).from("gift_rules").delete().eq("id", r.id);
    if (error) { toast.error(error.message); return; }
    toast.success("已刪除");
    await load();
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">多件可加贈品設定</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            滿件／滿額自動加贈，倍數累加。贈品以 0 元 0 獎勵點寫入訂單，不影響分紅基數與責任額。
          </p>
        </div>
        <Button onClick={openNew}><Plus className="mr-2 h-4 w-4" />新增規則</Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">規則列表（{rules.length}）</CardTitle>
          <CardDescription>優先順序數字越大越先套用；多條規則可同時成立，贈品各自累加。</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : rules.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">尚無贈品規則</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>規則名稱</TableHead>
                    <TableHead>觸發條件</TableHead>
                    <TableHead>觸發商品</TableHead>
                    <TableHead>贈品</TableHead>
                    <TableHead>通路</TableHead>
                    <TableHead>期間</TableHead>
                    <TableHead className="text-right">上限</TableHead>
                    <TableHead>啟用</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rules.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="text-xs">{triggerSummary(r)}</TableCell>
                      <TableCell className="text-xs max-w-[180px]">
                        {r.trigger_type === "order_qty" || r.trigger_type === "order_amount"
                          ? "全部商品"
                          : r.product_ids.map(productName).join("、") || "—"}
                      </TableCell>
                      <TableCell className="text-xs max-w-[180px]">
                        {r.gifts.map((g) => `${productName(g.product_id)} ×${g.gift_qty}`).join("、")}
                      </TableCell>
                      <TableCell className="text-xs">
                        {r.channel_shop !== false && <Badge variant="outline" className="mr-1">商城</Badge>}
                        {r.channel_b2b !== false && <Badge variant="outline">B2B</Badge>}
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        {r.starts_at || "—"} ~ {r.ends_at || "—"}
                      </TableCell>
                      <TableCell className="text-right text-xs">{r.max_gift_qty > 0 ? r.max_gift_qty : "不限"}</TableCell>
                      <TableCell><Switch checked={r.is_active !== false} onCheckedChange={() => toggleActive(r)} /></TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(r as any)}><Pencil className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => remove(r)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <SimulatorCard rules={rules} products={products} />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Gift className="h-4 w-4" />{form.id ? "編輯" : "新增"}贈品規則</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label>規則名稱</Label>
                <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="例：紫蘇油買5送1" />
              </div>
              <div>
                <Label>觸發方式</Label>
                <Select value={form.trigger_type} onValueChange={(v) => setForm((f) => ({ ...f, trigger_type: v as GiftTriggerType }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(GIFT_TRIGGER_LABEL) as GiftTriggerType[]).map((k) => (
                      <SelectItem key={k} value={k}>{GIFT_TRIGGER_LABEL[k]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>門檻值（每滿）</Label>
                <Input type="number" min={1} value={form.threshold} onChange={(e) => setForm((f) => ({ ...f, threshold: e.target.value }))} />
              </div>
              <div>
                <Label>生效日</Label>
                <Input type="date" value={form.starts_at} onChange={(e) => setForm((f) => ({ ...f, starts_at: e.target.value }))} />
              </div>
              <div>
                <Label>結束日</Label>
                <Input type="date" value={form.ends_at} onChange={(e) => setForm((f) => ({ ...f, ends_at: e.target.value }))} />
              </div>
              <div>
                <Label>每張訂單贈品上限（0 = 不限）</Label>
                <Input type="number" min={0} value={form.max_gift_qty} onChange={(e) => setForm((f) => ({ ...f, max_gift_qty: e.target.value }))} />
              </div>
              <div>
                <Label>優先順序</Label>
                <Input type="number" value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))} />
              </div>
            </div>

            <div className="flex flex-wrap gap-6">
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={form.channel_shop} onCheckedChange={(v) => setForm((f) => ({ ...f, channel_shop: v }))} />官網商城
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={form.channel_b2b} onCheckedChange={(v) => setForm((f) => ({ ...f, channel_b2b: v }))} />批發／B2B
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={form.is_active} onCheckedChange={(v) => setForm((f) => ({ ...f, is_active: v }))} />啟用
              </label>
            </div>

            {(form.trigger_type === "product_qty" || form.trigger_type === "group_qty") && (
              <div className="space-y-2">
                <Label>觸發商品{form.trigger_type === "product_qty" ? "（各商品分別計算倍數）" : "（合計件數）"}</Label>
                <SearchSelect
                  options={productOptions.filter((o) => !form.product_ids.includes(o.value))}
                  value={null}
                  onChange={(v) => setForm((f) => ({ ...f, product_ids: [...f.product_ids, v] }))}
                  placeholder="搜尋並加入商品"
                />
                <div className="flex flex-wrap gap-2">
                  {form.product_ids.map((pid) => (
                    <Badge key={pid} variant="secondary" className="gap-1">
                      {productName(pid)}
                      <button onClick={() => setForm((f) => ({ ...f, product_ids: f.product_ids.filter((x) => x !== pid) }))}>
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>贈品內容（每次達標贈送）</Label>
              <SearchSelect
                options={productOptions.filter((o) => !form.gifts.some((g) => g.product_id === o.value))}
                value={null}
                onChange={(v) => setForm((f) => ({ ...f, gifts: [...f.gifts, { product_id: v, gift_qty: 1 }] }))}
                placeholder="搜尋並加入贈品"
              />
              {form.gifts.map((g, i) => (
                <div key={g.product_id} className="flex items-center gap-2">
                  <span className="flex-1 truncate text-sm">{productName(g.product_id)}</span>
                  <Input
                    type="number" min={1} className="w-24" value={g.gift_qty}
                    onChange={(e) => setForm((f) => {
                      const gifts = [...f.gifts];
                      gifts[i] = { ...gifts[i], gift_qty: Number(e.target.value) || 1 };
                      return { ...f, gifts };
                    })}
                  />
                  <Button size="icon" variant="ghost" onClick={() => setForm((f) => ({ ...f, gifts: f.gifts.filter((_, x) => x !== i) }))}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>

            <div>
              <Label>備註</Label>
              <Textarea value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} rows={2} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}儲存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SimulatorCard({ rules, products }: { rules: GiftRule[]; products: ProductLite[] }) {
  const [lines, setLines] = useState<{ product_id: string; quantity: number; unit_price: number }[]>([]);
  const options = useMemo(
    () => products.map((p) => ({ value: p.id, label: p.name, keywords: `${p.name} ${p.sku ?? ""}` })),
    [products],
  );
  const name = (id: string) => products.find((p) => p.id === id)?.name ?? id.slice(0, 8);
  const result = useMemo(() => computeGifts(lines, rules, "shop"), [lines, rules]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2"><Calculator className="h-4 w-4" />規則試算器</CardTitle>
        <CardDescription>輸入品項、數量與單價，預覽實際會贈出什麼。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <SearchSelect
          options={options}
          value={null}
          onChange={(v) => setLines((l) => [...l, { product_id: v, quantity: 1, unit_price: 0 }])}
          placeholder="加入試算品項"
        />
        {lines.map((l, i) => (
          <div key={`${l.product_id}-${i}`} className="flex items-center gap-2">
            <span className="flex-1 truncate text-sm">{name(l.product_id)}</span>
            <Input type="number" min={1} className="w-24" value={l.quantity}
              onChange={(e) => setLines((ls) => ls.map((x, j) => j === i ? { ...x, quantity: Number(e.target.value) || 1 } : x))} />
            <Input type="number" min={0} className="w-28" placeholder="單價" value={l.unit_price}
              onChange={(e) => setLines((ls) => ls.map((x, j) => j === i ? { ...x, unit_price: Number(e.target.value) || 0 } : x))} />
            <Button size="icon" variant="ghost" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>
              <Trash2 className="h-4 w-4 text-destructive" />
            </Button>
          </div>
        ))}
        {lines.length > 0 && (
          <div className="rounded-lg border bg-muted/40 p-3 text-sm space-y-1">
            {result.awards.length === 0 ? (
              <div className="text-muted-foreground">未達任何規則門檻</div>
            ) : result.awards.map((a) => (
              <div key={a.product_id} className="flex justify-between">
                <span>{name(a.product_id)}<span className="ml-1 text-xs text-muted-foreground">（{a.rule_name}）</span></span>
                <span className="font-semibold text-primary">× {a.quantity}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
