import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Gift, ShoppingCart, Package } from "lucide-react";
import { toast } from "sonner";
import { getBundleBySlug, addBundleToCart } from "@/lib/repurchase-bundles.functions";
import { useAuth } from "@/hooks/use-auth";
import { useCart } from "@/hooks/use-cart";

export const Route = createFileRoute("/shop/bundles/$slug")({
  component: BundleDetail,
});

function BundleDetail() {
  const { slug } = Route.useParams();
  const getFn = useServerFn(getBundleBySlug);
  const addFn = useServerFn(addBundleToCart);
  const { user } = useAuth();
  const { refresh, setOpen } = useCart();
  const navigate = useNavigate();
  const [bundle, setBundle] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [copies, setCopies] = useState(1);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const b = await getFn({ data: { slug } });
        setBundle(b);
      } catch (e: any) { toast.error(e.message ?? "讀取失敗"); }
      setLoading(false);
    })();
  }, [slug]);

  async function handleAdd() {
    if (!user) {
      toast.error("請先登入後再加入購物車");
      navigate({ to: "/shop/checkout" });
      return;
    }
    if (copies < 1) return;
    setAdding(true);
    try {
      await addFn({ data: { bundleId: bundle.id, copies } });
      await refresh();
      toast.success(`已加入 ${copies} 組套組`);
      setOpen(true);
    } catch (e: any) { toast.error(e.message ?? "加入失敗"); }
    setAdding(false);
  }

  if (loading) return <div className="container mx-auto px-4 py-16 text-center text-muted-foreground">載入中…</div>;
  if (!bundle) return <div className="container mx-auto px-4 py-16 text-center text-muted-foreground">找不到套組</div>;

  const total = Number(bundle.bundle_price) * copies;
  const rewardTotal = Number(bundle.bundle_reward_points) * copies;

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <Button variant="ghost" size="sm" asChild className="mb-4">
        <Link to="/shop/bundles"><ArrowLeft className="h-4 w-4 mr-1" />返回套組列表</Link>
      </Button>
      <div className="grid md:grid-cols-2 gap-6">
        <div className="rounded-lg overflow-hidden bg-muted aspect-video">
          {bundle.cover_image ? (
            <img src={bundle.cover_image} alt={bundle.name} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground">
              <Package className="h-16 w-16" />
            </div>
          )}
        </div>
        <div className="space-y-4">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold">{bundle.name}</h1>
              <Badge variant="outline" className="text-primary"><Gift className="h-3 w-3 mr-1" />整組 +{bundle.bundle_reward_points} 獎勵點</Badge>
            </div>
            {bundle.description && <p className="text-sm text-muted-foreground mt-2 whitespace-pre-line">{bundle.description}</p>}
          </div>
          <div className="text-3xl font-bold text-primary tabular-nums">NT$ {Number(bundle.bundle_price).toLocaleString()} <span className="text-sm text-muted-foreground font-normal">/ 組</span></div>

          <Card>
            <CardContent className="p-4 space-y-2">
              <div className="text-sm font-medium">套組內容（每組）</div>
              {(bundle.items ?? []).map((it: any) => (
                <div key={it.id} className="flex items-center gap-3 py-1.5 border-b last:border-0">
                  <div className="h-10 w-10 rounded bg-muted overflow-hidden shrink-0">
                    {it.product?.image && <img src={it.product.image} alt={it.product.name} className="h-full w-full object-cover" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{it.product?.name}</div>
                    {it.product?.sku && <div className="text-[10px] text-muted-foreground">{it.product.sku}</div>}
                  </div>
                  <Badge variant="secondary">× {it.quantity}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="flex items-center gap-3">
            <label className="text-sm">組數</label>
            <Input type="number" min={1} max={bundle.max_per_order ?? undefined} value={copies}
              onChange={(e) => setCopies(Math.max(1, Number(e.target.value) || 1))} className="w-24" />
            {bundle.max_per_order && <span className="text-xs text-muted-foreground">單筆最多 {bundle.max_per_order} 組</span>}
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40">
            <div>
              <div className="text-xs text-muted-foreground">合計</div>
              <div className="text-xl font-bold text-primary tabular-nums">NT$ {total.toLocaleString()}</div>
              <div className="text-xs text-amber-500 flex items-center gap-1"><Gift className="h-3 w-3" />+{rewardTotal.toLocaleString()} 獎勵點</div>
            </div>
            <Button size="lg" onClick={handleAdd} disabled={adding}>
              <ShoppingCart className="h-4 w-4 mr-2" />{adding ? "加入中…" : "加入購物車"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
