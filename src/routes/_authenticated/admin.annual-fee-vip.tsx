import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Crown, Pencil, Plus, Search, Trash2 } from "lucide-react";
import {
  adminListAnnualFeeRules,
  deleteAnnualFeeRule,
  searchProductsForGift,
  toggleAnnualFeeRule,
  upsertAnnualFeeRule,
} from "@/lib/annual-fee-vip.functions";

export const Route = createFileRoute("/_authenticated/admin/annual-fee-vip")({
  component: AnnualFeeVipAdmin,
});

const TIER_OPTIONS = ["V", "S", "T", "E", "A"];

type Rule = {
  id: string;
  sku: string;
  upgrade_days: number;
  gift_product_id: string | null;
  gift_quantity: number;
  is_active: boolean;
  notes: string | null;
  target_tier_code: string | null;
  reward_points: number;
  show_on_vip_upgrade_page: boolean;
  sort_order: number;
};

const EMPTY: Partial<Rule> = {
  sku: "",
  upgrade_days: 365,
  gift_product_id: null,
  gift_quantity: 0,
  is_active: true,
  notes: "",
  target_tier_code: "V",
  reward_points: 0,
  show_on_vip_upgrade_page: false,
  sort_order: 0,
};

function AnnualFeeVipAdmin() {
  const listFn = useServerFn(adminListAnnualFeeRules);
  const upsertFn = useServerFn(upsertAnnualFeeRule);
  const toggleFn = useServerFn(toggleAnnualFeeRule);
  const deleteFn = useServerFn(deleteAnnualFeeRule);
  const searchFn = useServerFn(searchProductsForGift);

  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [dlgOpen, setDlgOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<Rule>>(EMPTY);

  // 商品搜尋（年費商品 + 贈品共用同一個搜尋面板）
  const [skuQuery, setSkuQuery] = useState("");
  const [skuResults, setSkuResults] = useState<any[]>([]);
  const [giftQuery, setGiftQuery] = useState("");
  const [giftResults, setGiftResults] = useState<any[]>([]);
  const [giftLabel, setGiftLabel] = useState<string>("");

  async function refresh() {
    setLoading(true);
    try {
      const data: any = await listFn({});
      setRules(data ?? []);
    } catch (e: any) {
      toast.error(e?.message || "讀取失敗");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { refresh(); }, []);

  function openCreate() {
    setEditing({ ...EMPTY });
    setGiftLabel("");
    setSkuQuery(""); setSkuResults([]);
    setGiftQuery(""); setGiftResults([]);
    setDlgOpen(true);
  }
  function openEdit(r: Rule) {
    setEditing({ ...r });
    setGiftLabel(r.gift_product_id ? "（已選贈品）" : "");
    setSkuQuery(""); setSkuResults([]);
    setGiftQuery(""); setGiftResults([]);
    setDlgOpen(true);
  }

  async function doSearch(kw: string, target: "sku" | "gift") {
    try {
      const data: any = await searchFn({ data: { keyword: kw } });
      if (target === "sku") setSkuResults(data ?? []);
      else setGiftResults(data ?? []);
    } catch (e: any) { toast.error(e?.message || "搜尋失敗"); }
  }

  async function save() {
    if (!editing.sku) { toast.error("請選擇年費商品 SKU"); return; }
    try {
      await upsertFn({
        data: {
          id: editing.id,
          sku: editing.sku!,
          upgrade_days: Number(editing.upgrade_days ?? 365),
          gift_product_id: editing.gift_product_id ?? null,
          gift_quantity: Number(editing.gift_quantity ?? 0),
          is_active: !!editing.is_active,
          notes: editing.notes ?? null,
          target_tier_code: editing.target_tier_code || null,
          reward_points: Number(editing.reward_points ?? 0),
          show_on_vip_upgrade_page: !!editing.show_on_vip_upgrade_page,
          sort_order: Number(editing.sort_order ?? 0),
        } as any,
      });
      toast.success("已儲存");
      setDlgOpen(false);
      refresh();
    } catch (e: any) { toast.error(e?.message || "儲存失敗"); }
  }

  async function onToggle(id: string, v: boolean) {
    try {
      await toggleFn({ data: { id, is_active: v } });
      refresh();
    } catch (e: any) { toast.error(e?.message || "切換失敗"); }
  }

  async function onDelete(id: string) {
    if (!confirm("確定刪除這條規則？")) return;
    try {
      await deleteFn({ data: { id } });
      toast.success("已刪除");
      refresh();
    } catch (e: any) { toast.error(e?.message || "刪除失敗"); }
  }

  return (
    <div className="container mx-auto p-4 lg:p-6 space-y-6">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Crown className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">年費自動升 VIP</h1>
        </div>
        <Dialog open={dlgOpen} onOpenChange={setDlgOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreate}><Plus className="h-4 w-4 mr-1" />新增規則</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editing.id ? "編輯規則" : "新增規則"}</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4 py-2">
              {/* 年費商品 SKU */}
              <div className="col-span-2 space-y-1">
                <Label>年費商品 SKU <span className="text-destructive">*</span></Label>
                <div className="flex gap-2">
                  <Input
                    value={editing.sku ?? ""}
                    onChange={(e) => setEditing({ ...editing, sku: e.target.value })}
                    placeholder="例如 YBL-HOME-0038"
                  />
                  <Input
                    value={skuQuery}
                    onChange={(e) => setSkuQuery(e.target.value)}
                    placeholder="搜尋商品名稱 / SKU"
                    onKeyDown={(e) => e.key === "Enter" && doSearch(skuQuery, "sku")}
                  />
                  <Button type="button" variant="outline" onClick={() => doSearch(skuQuery, "sku")}>
                    <Search className="h-4 w-4" />
                  </Button>
                </div>
                {skuResults.length > 0 && (
                  <div className="border rounded-md divide-y max-h-40 overflow-auto">
                    {skuResults.map((p) => (
                      <button
                        type="button"
                        key={p.id}
                        className="w-full flex items-center justify-between px-2 py-1 text-left hover:bg-muted text-sm"
                        onClick={() => { setEditing({ ...editing, sku: p.sku }); setSkuResults([]); }}
                      >
                        <span className="truncate">{p.name} · <span className="text-muted-foreground">{p.sku}</span></span>
                        <span className="text-xs text-muted-foreground">NT$ {p.price}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* 升級天數 */}
              <div className="space-y-1">
                <Label>升級天數</Label>
                <Input
                  type="number"
                  min={1}
                  value={editing.upgrade_days ?? 365}
                  onChange={(e) => setEditing({ ...editing, upgrade_days: Number(e.target.value) })}
                />
              </div>

              {/* 目標 VIP 階級 */}
              <div className="space-y-1">
                <Label>目標 VIP 階級</Label>
                <Select
                  value={editing.target_tier_code || ""}
                  onValueChange={(v) => setEditing({ ...editing, target_tier_code: v })}
                >
                  <SelectTrigger><SelectValue placeholder="選擇階級" /></SelectTrigger>
                  <SelectContent>
                    {TIER_OPTIONS.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              {/* 獎勵點 */}
              <div className="space-y-1">
                <Label>獎勵點</Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={editing.reward_points ?? ""}
                  onChange={(e) => {
                    const v = e.target.value.replace(/[^0-9]/g, "");
                    setEditing({ ...editing, reward_points: v === "" ? (undefined as any) : Number(v) });
                  }}
                />
              </div>

              {/* 排序 */}
              <div className="space-y-1">
                <Label>排序</Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  pattern="-?[0-9]*"
                  value={editing.sort_order ?? ""}
                  onChange={(e) => {
                    const v = e.target.value.replace(/[^0-9-]/g, "");
                    setEditing({ ...editing, sort_order: v === "" || v === "-" ? (undefined as any) : Number(v) });
                  }}
                />
              </div>

              {/* 贈品搜尋 */}
              <div className="col-span-2 space-y-1">
                <Label>預設贈品（選填）</Label>
                <div className="flex gap-2">
                  <Input
                    value={giftLabel || (editing.gift_product_id ?? "")}
                    readOnly
                    placeholder="未選擇贈品"
                  />
                  <Input
                    value={giftQuery}
                    onChange={(e) => setGiftQuery(e.target.value)}
                    placeholder="搜尋贈品商品"
                    onKeyDown={(e) => e.key === "Enter" && doSearch(giftQuery, "gift")}
                  />
                  <Button type="button" variant="outline" onClick={() => doSearch(giftQuery, "gift")}>
                    <Search className="h-4 w-4" />
                  </Button>
                  {editing.gift_product_id && (
                    <Button type="button" variant="ghost" onClick={() => { setEditing({ ...editing, gift_product_id: null, gift_quantity: 0 }); setGiftLabel(""); }}>清除</Button>
                  )}
                </div>
                {giftResults.length > 0 && (
                  <div className="border rounded-md divide-y max-h-40 overflow-auto">
                    {giftResults.map((p) => (
                      <button
                        type="button"
                        key={p.id}
                        className="w-full flex items-center justify-between px-2 py-1 text-left hover:bg-muted text-sm"
                        onClick={() => {
                          setEditing({ ...editing, gift_product_id: p.id, gift_quantity: Math.max(1, Number(editing.gift_quantity || 1)) });
                          setGiftLabel(`${p.name}（${p.sku}）`);
                          setGiftResults([]);
                        }}
                      >
                        <span className="truncate">{p.name} · <span className="text-muted-foreground">{p.sku}</span></span>
                        <span className="text-xs text-muted-foreground">NT$ {p.price}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <Label>贈品數量</Label>
                <Input
                  type="number"
                  min={0}
                  value={editing.gift_quantity ?? 0}
                  onChange={(e) => setEditing({ ...editing, gift_quantity: Number(e.target.value) })}
                  disabled={!editing.gift_product_id}
                />
              </div>

              <div className="flex items-end gap-4">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={!!editing.is_active}
                    onCheckedChange={(v) => setEditing({ ...editing, is_active: v })}
                  />
                  <Label>啟用</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={!!editing.show_on_vip_upgrade_page}
                    onCheckedChange={(v) => setEditing({ ...editing, show_on_vip_upgrade_page: v })}
                  />
                  <Label>上架至前台 VIP 升級區</Label>
                </div>
              </div>

              <div className="col-span-2 space-y-1">
                <Label>備註</Label>
                <Textarea
                  value={editing.notes ?? ""}
                  onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
                  rows={2}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDlgOpen(false)}>取消</Button>
              <Button onClick={save}>儲存</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <p className="text-sm text-muted-foreground">
        設定年費商品 SKU。會員購買且付款後，系統會自動延長 VIP 期限（冪等）。
      </p>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">規則清單（{rules.length}）</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm text-muted-foreground">載入中…</div>
          ) : rules.length === 0 ? (
            <div className="text-sm text-muted-foreground">尚無規則。</div>
          ) : (
            <div className="divide-y border rounded-md">
              {rules.map((r) => (
                <div key={r.id} className="flex items-center gap-3 p-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium flex items-center gap-2 flex-wrap">
                      <span>{r.sku}</span>
                      {r.target_tier_code && <Badge variant="secondary">{r.target_tier_code}</Badge>}
                      <Badge>+{r.upgrade_days} 天</Badge>
                      {r.reward_points > 0 && <Badge variant="outline">{r.reward_points} 點</Badge>}
                      {r.show_on_vip_upgrade_page && <Badge variant="default">前台上架</Badge>}
                      {!r.is_active && <Badge variant="destructive">已停用</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {r.gift_product_id ? `贈品 × ${r.gift_quantity}` : "無贈品"}
                      {r.notes && <> · {r.notes}</>}
                      <> · 排序 {r.sort_order}</>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">啟用</span>
                    <Switch checked={!!r.is_active} onCheckedChange={(v) => onToggle(r.id, v)} />
                    <Button size="icon" variant="ghost" onClick={() => openEdit(r)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => onDelete(r.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
