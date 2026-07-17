import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Sparkles, Plus, Trash2 } from "lucide-react";
import type { Category, Product, WholesaleTier } from "@/types/product";
import { ImageUploader, UploaderImage } from "./ImageUploader";

interface SpecOption {
  label: string;
  price_delta: number;
  stock: number;
  sku_suffix: string;
}
import { generateSku, isSkuUnique } from "@/lib/sku";
import { useCurrentCompany } from "@/hooks/use-current-company";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  product?: Product | null;
  categories: Category[];
  onSaved: () => void;
}

const empty = {
  sku: "", name: "", short_description: "", description: "",
  category_id: "" as string,
  price: 0, wholesale_price: 0, cost_price: 0,
  stock: 0, safe_stock: 0,
  reward_points: 0, discount_points_max: 0,
  display_priority: 0,
  status: "inactive", featured: false,
  wholesale_only: false,
  specs: [] as SpecOption[],
  tiers: [] as WholesaleTier[],
};

export function ProductFormDialog({ open, onOpenChange, product, categories, onSaved }: Props) {
  const [form, setForm] = useState({ ...empty });
  const [images, setImages] = useState<UploaderImage[]>([]);
  const [saving, setSaving] = useState(false);
  const { currentCompanyId } = useCurrentCompany();

  useEffect(() => {
    if (!open) return;
    if (product) {
      setForm({
        sku: product.sku, name: product.name,
        short_description: product.short_description ?? "",
        description: product.description ?? "",
        category_id: product.category_id ?? "",
        price: Number(product.price), wholesale_price: Number(product.wholesale_price),
        cost_price: Number(product.cost_price),
        stock: product.stock, safe_stock: product.safe_stock,
        reward_points: Number((product as any).reward_points ?? 0),
        discount_points_max: Number((product as any).discount_points_max ?? 0),
        display_priority: Number((product as any).display_priority ?? 0),
        status: product.status, featured: product.featured,
        wholesale_only: Boolean((product as any).wholesale_only ?? false),
        specs: Array.isArray((product as any).specs) ? ((product as any).specs as SpecOption[]) : [],
        tiers: [],
      });
      supabase.from("product_images").select("*").eq("product_id", product.id).order("sort_order")
        .then(({ data }) => setImages((data ?? []).map((d: any) => ({ id: d.id, url: d.image_url, sort: d.sort_order }))));
      supabase.from("product_wholesale_tiers" as any).select("*").eq("product_id", product.id).order("min_qty")
        .then(({ data }) => {
          const tiers = ((data ?? []) as any[]).map((t) => ({
            id: t.id, product_id: t.product_id,
            min_qty: t.min_qty, max_qty: t.max_qty,
            unit_price: Number(t.unit_price), unit_reward_points: Number(t.unit_reward_points),
            sort_order: t.sort_order,
            visibility: (t.visibility ?? "all") as "all" | "vip" | "dealer",
          })) as WholesaleTier[];
          setForm((f) => ({ ...f, tiers }));
        });
    } else {
      setForm({ ...empty });
      setImages([]);
    }
  }, [open, product]);

  async function autoSku() {
    const cat = categories.find((c) => c.id === form.category_id);
    if (!cat) { toast.error("請先選擇主分類"); return; }
    const sku = await generateSku(cat.name);
    setForm((f) => ({ ...f, sku }));
  }

  async function save() {
    if (!form.name.trim()) { toast.error("請輸入商品名稱"); return; }
    if (!product && !currentCompanyId) { toast.error("尚未選擇公司"); return; }

    // 若未輸入 SKU，依分類自動產生（無分類則使用 GEN）
    let sku = form.sku.trim();
    if (!sku) {
      const cat = categories.find((c) => c.id === form.category_id);
      sku = await generateSku(cat?.name ?? "GEN");
      setForm((f) => ({ ...f, sku }));
    }

    const unique = await isSkuUnique(sku, product?.id);
    if (!unique) { toast.error("SKU 已存在，請修改"); return; }

    // 規則：未上傳商品圖一律下架，必須由管理員手動上架
    const noImage = images.length === 0;
    const effectiveStatus = noImage ? "inactive" : form.status;
    if (noImage && form.status === "active") {
      toast.warning("未上傳商品圖，已自動設為「已下架」。如需上架，請先上傳圖片。");
    }

    setSaving(true);
    try {
      const payload = {
        sku,
        name: form.name.trim(),
        short_description: form.short_description || null,
        description: form.description || null,
        category_id: form.category_id || null,
        category: categories.find((c) => c.id === form.category_id)?.name ?? null,
        price: Number(form.price) || 0,
        wholesale_price: Number(form.wholesale_price) || 0,
        cost_price: Number(form.cost_price) || 0,
        stock: Math.max(0, Math.floor(Number(form.stock) || 0)),
        safe_stock: Math.max(0, Math.floor(Number(form.safe_stock) || 0)),
        reward_points: Math.max(0, Math.floor(Number(form.reward_points) || 0)),
        discount_points_max: Math.max(0, Math.floor(Number(form.discount_points_max) || 0)),
        display_priority: Math.floor(Number(form.display_priority) || 0),
        status: effectiveStatus, featured: form.featured,
        wholesale_only: !!form.wholesale_only,
        image: images[0]?.url ?? null,
        specs: form.specs
          .filter((s) => s.label.trim())
          .map((s) => ({
            label: s.label.trim(),
            price_delta: Number(s.price_delta) || 0,
            stock: Math.max(0, Math.floor(Number(s.stock) || 0)),
            sku_suffix: (s.sku_suffix || "").trim(),
          })),
      };


      let productId = product?.id;
      if (product) {
        const { error } = await supabase.from("products").update(payload).eq("id", product.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("products")
          .insert({ ...payload, company_id: currentCompanyId! })
          .select("id")
          .single();
        if (error) throw error;
        productId = data.id;
      }

      // Sync images: simple strategy — delete all then re-insert
      if (productId) {
        await supabase.from("product_images").delete().eq("product_id", productId);
        if (images.length) {
          await supabase.from("product_images").insert(
            images.map((im, i) => ({ product_id: productId!, image_url: im.url, sort_order: i })),
          );
        }
      }

      // Sync wholesale tiers: validate first, then delete-then-insert
      if (productId) {
        const validTiers = form.tiers
          .filter((t) => Number(t.min_qty) >= 1 && Number(t.unit_price) >= 0)
          .map((t, i) => {
            const min_qty = Math.max(1, Math.floor(Number(t.min_qty) || 1));
            const max_qty = t.max_qty == null || t.max_qty === ("" as any) ? null : Math.max(1, Math.floor(Number(t.max_qty)));
            return {
              product_id: productId!,
              min_qty,
              max_qty,
              unit_price: Number(t.unit_price) || 0,
              unit_reward_points: Math.max(0, Math.floor(Number(t.unit_reward_points) || 0)),
              sort_order: i,
              visibility: (t.visibility ?? "all"),
            };
          });
        const badTier = validTiers.find((t) => t.max_qty != null && t.max_qty < t.min_qty);
        if (badTier) {
          toast.error(`階梯價設定錯誤：最大數量 (${badTier.max_qty}) 不可小於最小數量 (${badTier.min_qty})，或將最大數量留空表示無上限`);
          setSaving(false);
          return;
        }
        await supabase.from("product_wholesale_tiers" as any).delete().eq("product_id", productId);
        if (validTiers.length) {
          const { error: tErr } = await supabase.from("product_wholesale_tiers" as any).insert(validTiers);
          if (tErr) throw tErr;
        }
      }

      toast.success(product ? "商品已更新" : "商品已新增");
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message ?? "儲存失敗");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{product ? "編輯商品" : "新增商品"}</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="basic" className="mt-2">
          <TabsList className="grid grid-cols-6 w-full">
            <TabsTrigger value="basic">基本資訊</TabsTrigger>
            <TabsTrigger value="price">價格庫存</TabsTrigger>
            <TabsTrigger value="specs">規格選項</TabsTrigger>
            <TabsTrigger value="tiers">階梯價</TabsTrigger>
            <TabsTrigger value="images">商品圖片</TabsTrigger>
            <TabsTrigger value="meta">其他</TabsTrigger>
          </TabsList>

          <TabsContent value="basic" className="space-y-4 pt-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>商品名稱 *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>主分類 *</Label>
                <Select value={form.category_id} onValueChange={(v) => setForm({ ...form, category_id: v })}>
                  <SelectTrigger><SelectValue placeholder="選擇分類" /></SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>SKU *</Label>
                <div className="flex gap-2">
                  <Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} placeholder="YBL-XXX-0001" className="font-mono" />
                  <Button type="button" variant="secondary" onClick={autoSku}>
                    <Sparkles className="h-4 w-4 mr-1" /> 自動產生
                  </Button>
                </div>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>商品簡述</Label>
                <Input value={form.short_description} onChange={(e) => setForm({ ...form, short_description: e.target.value })} />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>商品詳細描述</Label>
                <Textarea rows={5} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="price" className="space-y-4 pt-4">
            <div className="grid sm:grid-cols-3 gap-4">
              <div className="space-y-2"><Label>售價</Label><Input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: +e.target.value })} /></div>
              <div className="space-y-2"><Label>批發價</Label><Input type="number" value={form.wholesale_price} onChange={(e) => setForm({ ...form, wholesale_price: +e.target.value })} /></div>
              <div className="space-y-2"><Label>成本價</Label><Input type="number" value={form.cost_price} onChange={(e) => setForm({ ...form, cost_price: +e.target.value })} /></div>
              <div className="space-y-2"><Label>初始/目前庫存</Label><Input type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: +e.target.value })} /></div>
              <div className="space-y-2"><Label>安全庫存</Label><Input type="number" value={form.safe_stock} onChange={(e) => setForm({ ...form, safe_stock: +e.target.value })} /></div>
              <div className="space-y-2">
                <Label>獎勵點 <span className="text-xs text-muted-foreground">(購買回饋)</span></Label>
                <Input type="number" min={0} value={form.reward_points} onChange={(e) => setForm({ ...form, reward_points: +e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>折扣點上限 <span className="text-xs text-muted-foreground">(0=不限)</span></Label>
                <Input type="number" min={0} value={form.discount_points_max} onChange={(e) => setForm({ ...form, discount_points_max: +e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>優先順位 <span className="text-xs text-muted-foreground">(數字越大越前面)</span></Label>
                <Input type="number" value={form.display_priority} onChange={(e) => setForm({ ...form, display_priority: +e.target.value })} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">獎勵點：客戶購買此商品後自動入帳。折扣點上限：此商品最多可被折扣點折抵的點數（每點 1 元）。優先順位：影響商城列表顯示順序，數字越大越前面，0 為預設。</p>
          </TabsContent>


          <TabsContent value="specs" className="space-y-3 pt-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">規格選項</div>
                <p className="text-xs text-muted-foreground">例如：容量、顏色、口味。加價可填負數（折扣）。留空表示沿用商品主價格與庫存。</p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setForm({ ...form, specs: [...form.specs, { label: "", price_delta: 0, stock: 0, sku_suffix: "" }] })}
              >
                <Plus className="h-4 w-4 mr-1" /> 新增規格
              </Button>
            </div>

            {form.specs.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-8 border border-dashed border-border rounded-lg">
                尚未設定規格選項
              </div>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-12 gap-2 text-xs text-muted-foreground px-1">
                  <div className="col-span-4">規格名稱 *</div>
                  <div className="col-span-3">加價 (元)</div>
                  <div className="col-span-2">庫存</div>
                  <div className="col-span-2">SKU 後綴</div>
                  <div className="col-span-1"></div>
                </div>
                {form.specs.map((s, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-center">
                    <Input
                      className="col-span-4"
                      placeholder="如：750ml"
                      value={s.label}
                      onChange={(e) => {
                        const next = [...form.specs];
                        const old = next[i];
                        const label = e.target.value;
                        const skuSuffix =
                          old.sku_suffix === "" || old.sku_suffix === old.label
                            ? label
                            : old.sku_suffix;
                        next[i] = { ...old, label, sku_suffix: skuSuffix };
                        setForm({ ...form, specs: next });
                      }}
                    />
                    <Input
                      className="col-span-3"
                      type="number"
                      value={s.price_delta}
                      onChange={(e) => {
                        const next = [...form.specs];
                        next[i] = { ...next[i], price_delta: +e.target.value };
                        setForm({ ...form, specs: next });
                      }}
                    />
                    <Input
                      className="col-span-2"
                      type="number"
                      min={0}
                      value={s.stock}
                      onChange={(e) => {
                        const next = [...form.specs];
                        next[i] = { ...next[i], stock: +e.target.value };
                        setForm({ ...form, specs: next });
                      }}
                    />
                    <Input
                      className="col-span-2 font-mono text-xs"
                      placeholder="-A"
                      value={s.sku_suffix}
                      onChange={(e) => {
                        const next = [...form.specs];
                        next[i] = { ...next[i], sku_suffix: e.target.value };
                        setForm({ ...form, specs: next });
                      }}
                    />
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="col-span-1 h-9 w-9"
                      onClick={() => setForm({ ...form, specs: form.specs.filter((_, j) => j !== i) })}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="tiers" className="space-y-6 pt-4">
            {(() => {
              const renderTierGroup = (
                groupKey: "retail" | "vip",
              ) => {
                const isRetail = groupKey === "retail";
                const matches = (t: WholesaleTier) =>
                  isRetail ? (t.visibility ?? "all") === "all" : (t.visibility ?? "all") !== "all";
                const indices = form.tiers.map((t, i) => (matches(t) ? i : -1)).filter((i) => i >= 0);
                const defaultVisibility: "all" | "vip" = isRetail ? "all" : "vip";

                const addTier = (min_qty: number, max_qty: number | null) => {
                  setForm({
                    ...form,
                    tiers: [
                      ...form.tiers,
                      {
                        min_qty,
                        max_qty,
                        unit_price: 0,
                        unit_reward_points: 0,
                        sort_order: form.tiers.length,
                        visibility: defaultVisibility,
                      },
                    ],
                  });
                };

                const addQuick = (min: number, max: number | null) => addTier(min, max);
                const addCustom = () => {
                  const groupTiers = indices.map((i) => form.tiers[i]);
                  const last = groupTiers[groupTiers.length - 1];
                  const nextMin = last ? (last.max_qty ?? last.min_qty) + 1 : 1;
                  addTier(nextMin, null);
                };

                return (
                  <div className="border border-border rounded-lg p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <div className="text-sm font-semibold">
                          {isRetail ? "零售多件優惠（公開）" : "VIP 批發階梯"}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {isRetail
                            ? "遊客 / 免費會員 / VIP 都可看到，用於 2 件、5 件、多件折扣等促銷。"
                            : "僅合格 VIP / 經銷商可看到，用於 VIP 大宗批發價。"}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {isRetail && (
                          <>
                            <Button type="button" size="sm" variant="outline" onClick={() => addQuick(2, 4)}>
                              + 2 件優惠
                            </Button>
                            <Button type="button" size="sm" variant="outline" onClick={() => addQuick(5, 9)}>
                              + 5 件優惠
                            </Button>
                            <Button type="button" size="sm" variant="outline" onClick={() => addQuick(10, null)}>
                              + 多件優惠
                            </Button>
                          </>
                        )}
                        <Button type="button" size="sm" variant="secondary" onClick={addCustom}>
                          <Plus className="h-4 w-4 mr-1" /> 新增階梯
                        </Button>
                      </div>
                    </div>

                    {indices.length === 0 ? (
                      <div className="text-center text-sm text-muted-foreground py-6 border border-dashed border-border rounded-lg">
                        {isRetail ? "尚未設定零售多件優惠" : "尚未設定 VIP 批發階梯"}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="grid grid-cols-12 gap-2 text-xs text-muted-foreground px-1">
                          <div className="col-span-2">起 (≥)</div>
                          <div className="col-span-2">迄 (≤)</div>
                          <div className="col-span-2">單件價</div>
                          <div className="col-span-2">單件獎勵點</div>
                          <div className="col-span-3">可見對象</div>
                          <div className="col-span-1"></div>
                        </div>
                        {indices.map((i) => {
                          const t = form.tiers[i];
                          return (
                            <div key={i} className="grid grid-cols-12 gap-2 items-center">
                              <Input
                                className="col-span-2"
                                type="number" min={1}
                                value={t.min_qty}
                                onChange={(e) => {
                                  const next = [...form.tiers];
                                  next[i] = { ...next[i], min_qty: +e.target.value };
                                  setForm({ ...form, tiers: next });
                                }}
                              />
                              <Input
                                className="col-span-2"
                                type="number" min={1}
                                placeholder="無上限"
                                value={t.max_qty ?? ""}
                                onChange={(e) => {
                                  const next = [...form.tiers];
                                  const v = e.target.value;
                                  next[i] = { ...next[i], max_qty: v === "" ? null : +v };
                                  setForm({ ...form, tiers: next });
                                }}
                              />
                              <Input
                                className="col-span-2"
                                type="number" min={0}
                                value={t.unit_price}
                                onChange={(e) => {
                                  const next = [...form.tiers];
                                  next[i] = { ...next[i], unit_price: +e.target.value };
                                  setForm({ ...form, tiers: next });
                                }}
                              />
                              <Input
                                className="col-span-2"
                                type="number" min={0}
                                value={t.unit_reward_points}
                                onChange={(e) => {
                                  const next = [...form.tiers];
                                  next[i] = { ...next[i], unit_reward_points: +e.target.value };
                                  setForm({ ...form, tiers: next });
                                }}
                              />
                              {isRetail ? (
                                <div className="col-span-3 text-xs text-muted-foreground self-center">
                                  全部會員（公開零售）
                                </div>
                              ) : (
                                <Select
                                  value={(t.visibility ?? "vip") === "all" ? "vip" : (t.visibility ?? "vip")}
                                  onValueChange={(v) => {
                                    const next = [...form.tiers];
                                    next[i] = { ...next[i], visibility: v as "vip" | "dealer" };
                                    setForm({ ...form, tiers: next });
                                  }}
                                >
                                  <SelectTrigger className="col-span-3 h-9"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="vip">僅 VIP</SelectItem>
                                    <SelectItem value="dealer">僅經銷商</SelectItem>
                                  </SelectContent>
                                </Select>
                              )}
                              <Button
                                type="button" size="icon" variant="ghost"
                                className="col-span-1 h-9 w-9 justify-self-end"
                                onClick={() => setForm({ ...form, tiers: form.tiers.filter((_, j) => j !== i) })}
                              >
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
                          );
                        })}
                        {isRetail && (
                          <p className="text-xs text-muted-foreground pt-1">
                            範例：2–4 件每件 NT$ 900、5–9 件每件 NT$ 850、10+ 件每件 NT$ 800。
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              };

              return (
                <>
                  {renderTierGroup("retail")}
                  {renderTierGroup("vip")}
                </>
              );
            })()}
          </TabsContent>

          <TabsContent value="images" className="pt-4">
            <ImageUploader images={images} onChange={setImages} />
          </TabsContent>



          <TabsContent value="meta" className="space-y-4 pt-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>狀態</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active" disabled={images.length === 0}>上架中{images.length === 0 ? "（需先上傳商品圖）" : ""}</SelectItem>
                    <SelectItem value="draft">草稿</SelectItem>
                    <SelectItem value="inactive">已下架</SelectItem>
                  </SelectContent>
                </Select>
                {images.length === 0 && (
                  <p className="text-xs text-warning">未上傳商品圖：儲存後將自動設為「已下架」，管理員上傳圖片後才能改為上架。</p>
                )}
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <div className="font-medium text-sm">熱門商品</div>
                  <div className="text-xs text-muted-foreground">將顯示於首頁推薦</div>
                </div>
                <Switch checked={form.featured} onCheckedChange={(v) => setForm({ ...form, featured: v })} />
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border p-3 sm:col-span-2">
                <div>
                  <div className="font-medium text-sm">只在批發專區顯示</div>
                  <div className="text-xs text-muted-foreground">開啟後，此商品不會出現在首頁與全部商品，只會出現在批發專區。</div>
                </div>
                <Switch checked={form.wholesale_only} onCheckedChange={(v) => setForm({ ...form, wholesale_only: v })} />
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={save} disabled={saving} className="bg-gradient-primary">
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {product ? "儲存變更" : "建立商品"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
