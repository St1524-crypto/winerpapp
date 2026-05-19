import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Package, Image as ImageIcon, ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompany } from "@/hooks/use-current-company";
import type { InventoryLog, Product, ProductImage } from "@/types/product";

export const Route = createFileRoute("/_authenticated/products/$productId")({ component: ProductDetail });

function ProductDetail() {
  const { productId } = Route.useParams();
  const [product, setProduct] = useState<Product | null>(null);
  const [images, setImages] = useState<ProductImage[]>([]);
  const [logs, setLogs] = useState<InventoryLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: p }, { data: imgs }, { data: lg }] = await Promise.all([
        supabase.from("products").select("*").eq("id", productId).maybeSingle(),
        supabase.from("product_images").select("*").eq("product_id", productId).order("sort_order"),
        supabase.from("inventory_logs").select("*").eq("product_id", productId).order("created_at", { ascending: false }).limit(20),
      ]);
      setProduct(p as Product | null);
      setImages((imgs ?? []) as ProductImage[]);
      setLogs((lg ?? []) as InventoryLog[]);
      setLoading(false);
    })();
  }, [productId]);

  if (loading) return <div className="space-y-4 max-w-5xl mx-auto"><Skeleton className="h-8 w-48" /><Skeleton className="h-96 w-full" /></div>;
  if (!product) return <div className="text-center py-20"><Package className="h-12 w-12 mx-auto text-muted-foreground/40" /><p className="mt-3">商品不存在</p><Button asChild className="mt-4"><Link to="/products">返回</Link></Button></div>;

  const gallery = images.length ? images : (product.image ? [{ id: "x", product_id: product.id, image_url: product.image, sort_order: 0, created_at: "" }] as ProductImage[] : []);
  const current = gallery[idx];

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <Button asChild variant="ghost" size="sm"><Link to="/products"><ArrowLeft className="h-4 w-4 mr-1" />返回列表</Link></Button>
        <Badge variant={product.status === "active" ? "default" : "outline"}>{product.status}</Badge>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardContent className="p-4">
            <div className="aspect-square rounded-lg bg-muted overflow-hidden relative flex items-center justify-center">
              {current ? <img src={current.image_url} alt={product.name} className="w-full h-full object-cover" /> : <ImageIcon className="h-12 w-12 text-muted-foreground/40" />}
              {gallery.length > 1 && (
                <>
                  <Button size="icon" variant="secondary" className="absolute left-2 top-1/2 -translate-y-1/2 h-8 w-8" onClick={() => setIdx((i) => (i - 1 + gallery.length) % gallery.length)}><ChevronLeft className="h-4 w-4" /></Button>
                  <Button size="icon" variant="secondary" className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8" onClick={() => setIdx((i) => (i + 1) % gallery.length)}><ChevronRight className="h-4 w-4" /></Button>
                </>
              )}
            </div>
            {gallery.length > 1 && (
              <div className="grid grid-cols-6 gap-2 mt-3">
                {gallery.map((g, i) => (
                  <button key={g.id} onClick={() => setIdx(i)} className={`aspect-square rounded overflow-hidden border-2 ${i === idx ? "border-primary" : "border-transparent"}`}>
                    <img src={g.image_url} alt="" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6 space-y-4">
            <div>
              <div className="text-xs text-muted-foreground font-mono">{product.sku}</div>
              <h1 className="text-2xl font-bold mt-1">{product.name}</h1>
              {product.category && <Badge variant="outline" className="mt-2">{product.category}</Badge>}
            </div>
            {product.short_description && <p className="text-sm text-muted-foreground">{product.short_description}</p>}
            <div className="grid grid-cols-3 gap-3 pt-2">
              <Stat label="售價" value={`NT$ ${Number(product.price).toLocaleString()}`} highlight />
              <Stat label="批發價" value={`NT$ ${Number(product.wholesale_price).toLocaleString()}`} />
              <Stat label="成本" value={`NT$ ${Number(product.cost_price).toLocaleString()}`} />
              <Stat label="目前庫存" value={String(product.stock)} highlight={product.stock <= product.safe_stock} />
              <Stat label="安全庫存" value={String(product.safe_stock)} />
              <Stat label="熱門商品" value={product.featured ? "是" : "否"} />
            </div>
            <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t border-border">
              <div>建立：{new Date(product.created_at).toLocaleString()}</div>
              <div>更新：{new Date(product.updated_at).toLocaleString()}</div>
            </div>
            {product.description && (
              <div className="pt-2">
                <div className="text-sm font-medium mb-1">商品描述</div>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{product.description}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">庫存異動紀錄</CardTitle></CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">尚無異動紀錄</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-muted-foreground border-b border-border">
                  <tr><th className="py-2 text-left">時間</th><th className="text-left">類型</th><th className="text-right">數量</th><th className="text-right">前</th><th className="text-right">後</th><th className="text-left pl-4">原因</th></tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {logs.map((l) => (
                    <tr key={l.id}>
                      <td className="py-2 text-xs">{new Date(l.created_at).toLocaleString()}</td>
                      <td><Badge variant={l.type === "in" ? "default" : l.type === "out" ? "destructive" : "secondary"}>{l.type}</Badge></td>
                      <td className="text-right font-medium">{l.quantity}</td>
                      <td className="text-right text-muted-foreground">{l.before_stock}</td>
                      <td className="text-right">{l.after_stock}</td>
                      <td className="pl-4 text-muted-foreground">{l.reason ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-lg bg-muted/40 border border-border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-sm font-semibold mt-1 ${highlight ? "text-primary" : ""}`}>{value}</div>
    </div>
  );
}
