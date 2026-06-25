import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Crown, Check, Loader2, Gift, ShoppingCart } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useVipStatus } from "@/hooks/use-wallet";
import { useCart } from "@/hooks/use-cart";
import { listVipTiers, listVipUpgradePackages, purchaseVipUpgrade } from "@/lib/vip-tiers.functions";
import { listPublicAnnualFeeVipPackages } from "@/lib/annual-fee-vip.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/shop/vip")({
  component: VipPage,
  head: () => ({ meta: [{ title: "VIP 升級套組 — 源晶商城" }] }),
});

function VipPage() {
  const { user } = useAuth();
  const { is_vip, vip_expires_at, refresh } = useVipStatus();
  const nav = useNavigate();
  const tiersFn = useServerFn(listVipTiers);
  const pkgFn = useServerFn(listVipUpgradePackages);
  const buyFn = useServerFn(purchaseVipUpgrade);
  const [tiers, setTiers] = useState<any[]>([]);
  const [packages, setPackages] = useState<any[]>([]);
  const [buying, setBuying] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([tiersFn(), pkgFn()]).then(([t, p]) => {
      setTiers(t as any[]); setPackages(p as any[]);
    }).catch(() => {});
  }, []);

  async function buy(pkgId: string) {
    if (!user) { nav({ to: "/login" }); return; }
    setBuying(pkgId);
    try {
      const r: any = await buyFn({ data: { packageId: pkgId } });
      if (r.pending) {
        toast.success("已送出升級申請，待管理員確認金流後生效");
      } else {
        toast.success(r.upgraded ? `升級成功！現為 ${r.new_tier}` : "已加值（同階或低階，僅發放贈點）");
      }
      refresh();
    } catch (e: any) { toast.error(e.message ?? "購買失敗"); }
    finally { setBuying(null); }
  }

  const groups = tiers.map((t) => ({ tier: t, items: packages.filter((p) => p.tier_code === t.code) }));

  return (
    <div className="container mx-auto px-4 py-10 max-w-6xl">
      <div className="text-center mb-10">
        <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-gradient-primary mb-4">
          <Crown className="h-8 w-8 text-primary-foreground" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight">VIP 升級套組</h1>
        <p className="text-sm text-muted-foreground mt-2">直接購買升級至對應 VIP 階級，付款成功即生效</p>
        {is_vip && (
          <p className="mt-3 text-sm text-success">您已是 VIP，有效期至 {vip_expires_at ? new Date(vip_expires_at).toLocaleDateString() : "—"}</p>
        )}
      </div>

      <div className="space-y-8">
        {groups.map((g) => (
          <div key={g.tier.code}>
            <div className="flex items-baseline gap-3 mb-3">
              <h2 className="text-xl font-bold">{g.tier.code} 級 — {g.tier.name}</h2>
              <Badge>回饋 {g.tier.cashback_rate}%</Badge>
              {g.tier.revenue_share_rate > 0 && <Badge variant="secondary">營業分紅 {g.tier.revenue_share_rate}%</Badge>}
            </div>
            {g.items.length === 0 ? (
              <p className="text-sm text-muted-foreground">此階級尚無上架套組</p>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {g.items.map((p) => (
                  <Card key={p.id} className="relative overflow-hidden">
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-primary" />
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Crown className="h-5 w-5 text-primary" />{p.name}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="text-2xl font-bold">NT$ {Number(p.price).toLocaleString()}
                        {p.duration_days > 0 && <span className="text-sm font-normal text-muted-foreground"> / {p.duration_days} 天</span>}
                      </div>
                      {p.description && <p className="text-sm text-muted-foreground">{p.description}</p>}
                      <ul className="space-y-1 text-sm">
                        <li className="flex items-center gap-2"><Check className="h-4 w-4 text-success" />升級至 {p.tier_code} 級 VIP</li>
                        {p.bonus_points > 0 && <li className="flex items-center gap-2"><Check className="h-4 w-4 text-success" />贈送 {p.bonus_points} 獎勵點</li>}
                        <li className="flex items-center gap-2"><Check className="h-4 w-4 text-success" />享 {g.tier.cashback_rate}% 回饋</li>
                      </ul>
                      <Button className="w-full bg-gradient-primary" disabled={buying === p.id} onClick={() => buy(p.id)}>
                        {buying === p.id && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}立即購買升級
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground text-center mt-8">
        購買紀錄可於 <Link to="/shop/account/vip" className="text-primary underline">我的 VIP</Link> 查看
      </p>
    </div>
  );
}
