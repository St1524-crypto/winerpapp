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
import { Loader2, Sparkles } from "lucide-react";
import type { Category, Product } from "@/types/product";
import { ImageUploader, UploaderImage } from "./ImageUploader";
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
  status: "active", featured: false,
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
        status: product.status, featured: product.featured,
      });
      supabase.from("product_images").select("*").eq("product_id", product.id).order("sort_order")
        .then(({ data }) => setImages((data ?? []).map((d: any) => ({ id: d.id, url: d.image_url, sort: d.sort_order }))));
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
    if (!form.sku.trim()) { toast.error("請輸入或產生 SKU"); return; }
    const unique = await isSkuUnique(form.sku, product?.id);
    if (!unique) { toast.error("SKU 已存在"); return; }

    setSaving(true);
    try {
      const payload = {
        sku: form.sku.trim(),
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
        status: form.status, featured: form.featured,
        image: images[0]?.url ?? null,
      };

      let productId = product?.id;
      if (product) {
        const { error } = await supabase.from("products").update(payload).eq("id", product.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("products").insert(payload).select("id").single();
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
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="basic">基本資訊</TabsTrigger>
            <TabsTrigger value="price">價格庫存</TabsTrigger>
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
            </div>
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
                    <SelectItem value="active">上架中</SelectItem>
                    <SelectItem value="draft">草稿</SelectItem>
                    <SelectItem value="inactive">已下架</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <div className="font-medium text-sm">熱門商品</div>
                  <div className="text-xs text-muted-foreground">將顯示於首頁推薦</div>
                </div>
                <Switch checked={form.featured} onCheckedChange={(v) => setForm({ ...form, featured: v })} />
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
