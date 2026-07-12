import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Package, Gift, ArrowRight } from "lucide-react";
import { listActiveBundles } from "@/lib/repurchase-bundles.functions";

export const Route = createFileRoute("/shop/bundles/")({
  component: BundlesIndex,
  head: () => ({
    meta: [
      { title: "復購優惠套組 — 源晶商城" },
      { name: "description", content: "多項商品組合套組，整組優惠價與整組獎勵點回饋。" },
      { property: "og:title", content: "復購優惠套組" },
      { property: "og:description", content: "整組購買、整組發放獎勵點的優惠套組。" },
    ],
  }),
});

function BundlesIndex() {
  const fn = useServerFn(listActiveBundles);
  const [bundles, setBundles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const rows = await fn();
        setBundles(rows as any[]);
      } finally { setLoading(false); }
    })();
  }, []);

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2"><Package className="h-6 w-6 text-primary" />復購優惠套組</h1>
        <p className="text-sm text-muted-foreground mt-1">將多項熱門商品組合成套組，整組優惠價、整組發放獎勵點。</p>
      </div>
      {loading ? (
        <div className="text-center py-16 text-muted-foreground">載入中…</div>
      ) : bundles.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">目前沒有可購買的套組</div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {bundles.map((b) => (
            <Card key={b.id} className="overflow-hidden hover:shadow-md transition">
              {b.cover_image && (
                <div className="h-40 bg-muted overflow-hidden">
                  <img src={b.cover_image} alt={b.name} className="h-full w-full object-cover" />
                </div>
              )}
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-semibold">{b.name}</div>
                  <Badge variant="outline" className="shrink-0"><Gift className="h-3 w-3 mr-1" />+{b.bundle_reward_points}</Badge>
                </div>
                {b.description && <p className="text-xs text-muted-foreground line-clamp-2">{b.description}</p>}
                <div className="text-xs text-muted-foreground">
                  含 {b.items?.length ?? 0} 項商品：
                  {(b.items ?? []).slice(0, 3).map((it: any) => it.product?.name).filter(Boolean).join("、")}
                  {(b.items?.length ?? 0) > 3 && " …"}
                </div>
                <div className="flex items-center justify-between pt-2">
                  <div className="text-lg font-bold text-primary tabular-nums">NT$ {Number(b.bundle_price).toLocaleString()}</div>
                  <Button asChild size="sm"><Link to="/shop/bundles/$slug" params={{ slug: b.slug }}>查看 <ArrowRight className="h-3 w-3 ml-1" /></Link></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
