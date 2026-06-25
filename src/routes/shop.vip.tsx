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
  const { addItem } = useCart();
  const tiersFn = useServerFn(listVipTiers);
  const pkgFn = useServerFn(listVipUpgradePackages);
  const buyFn = useServerFn(purchaseVipUpgrade);
  const publicAnnualFn = useServerFn(listPublicAnnualFeeVipPackages);
  const [tiers, setTiers] = useState<any[]>([]);
  const [packages, setPackages] = useState<any[]>([]);
  const [annualPkgs, setAnnualPkgs] = useState<any[]>([]);
  const [buying, setBuying] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([tiersFn(), pkgFn(), publicAnnualFn()]).then(([t, p, a]) => {
      setTiers(t as any[]); setPackages(p as any[]); setAnnualPkgs(a as any[]);
    }).catch(() => {});
  }, []);

  async function addAnnualToCart(pkg: any) {
    if (!pkg) { toast.error("此 VIP 升級套組目前未開放"); return; }
    if (!pkg.product?.id) { toast.error("年費商品已下架，請聯絡客服"); return; }
    setAdding(pkg.id);
    try {
      await addItem(pkg.product.id, 1);
    } catch (e: any) {
      toast.error(e?.message || "加入購物車失敗，請稍後再試");
    } finally { setAdding(null); }
  }


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
                {g.items.map((p) => {
                  const products: any[] = (p.products ?? []).filter((x: any) => x && x.status === "active");
                  const hasProducts = products.length > 0;
                  const displayPrice = Number(p.price);
                  return (
                  <Card key={p.id} className="relative overflow-hidden">
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-primary" />
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Crown className="h-5 w-5 text-primary" />{p.name}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="text-2xl font-bold">NT$ {displayPrice.toLocaleString()}
                        {p.duration_days > 0 && <span className="text-sm font-normal text-muted-foreground"> / {p.duration_days} 天</span>}
                      </div>
                      {p.description && <p className="text-sm text-muted-foreground">{p.description}</p>}
                      <ul className="space-y-1 text-sm">
                        <li className="flex items-center gap-2"><Check className="h-4 w-4 text-success" />升級至 {p.tier_code} 級 VIP</li>
                        {p.bonus_points > 0 && <li className="flex items-center gap-2"><Check className="h-4 w-4 text-success" />贈送 {p.bonus_points} 獎勵點（整組僅 1 次）</li>}
                        <li className="flex items-center gap-2"><Check className="h-4 w-4 text-success" />享 {g.tier.cashback_rate}% 回饋</li>
                        {hasProducts && (
                          <li className="flex items-start gap-2">
                            <Gift className="h-4 w-4 text-success mt-0.5" />
                            <span>
                              <span className="font-medium">贈品商品（{products.length} 項）：</span>
                              <ul className="pl-3 list-disc text-muted-foreground">
                                {products.map((pr) => <li key={pr.id} className="truncate">{pr.name}</li>)}
                              </ul>
                            </span>
                          </li>
                        )}
                      </ul>
                      {p.package_product_id ? (
                        <Button
                          className="w-full bg-gradient-primary"
                          disabled={adding === p.id}
                          onClick={async () => {
                            setAdding(p.id);
                            try {
                              // 僅加入 anchor 商品（套組金額），贈品於付款後系統自動發放並扣庫存
                              await addItem(p.package_product_id, 1);
                            }
                            catch (e: any) { toast.error(e?.message || "加入購物車失敗"); }
                            finally { setAdding(null); }
                          }}
                        >
                          {adding === p.id
                            ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            : <ShoppingCart className="h-4 w-4 mr-2" />}
                          加入購物車
                        </Button>
                      ) : (
                        <Button className="w-full bg-gradient-primary" disabled={buying === p.id} onClick={() => buy(p.id)}>
                          {buying === p.id && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}立即購買升級
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      {annualPkgs.length > 0 && (
        <div className="mt-12">
          <div className="flex items-baseline gap-3 mb-3">
            <h2 className="text-xl font-bold">年費升級套組</h2>
            <Badge variant="secondary">購買年費商品自動升級 VIP</Badge>
          </div>
          <p className="text-sm text-muted-foreground mb-4">將年費商品加入購物車，結帳付款成功後系統自動升級 VIP 並發放獎勵點。</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {annualPkgs.map((p) => (
              <Card key={p.id} className="relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-primary" />
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Crown className="h-5 w-5 text-primary" />
                    {p.product?.name ?? p.sku}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="text-2xl font-bold">
                    {p.product ? <>NT$ {Number(p.product.price).toLocaleString()}</> : <span className="text-base text-muted-foreground">商品已下架</span>}
                    {p.upgrade_days > 0 && <span className="text-sm font-normal text-muted-foreground"> / {p.upgrade_days} 天</span>}
                  </div>
                  <ul className="space-y-1 text-sm">
                    {p.target_tier_code && (
                      <li className="flex items-center gap-2"><Check className="h-4 w-4 text-success" />升級至 {p.target_tier_code} 級 VIP</li>
                    )}
                    <li className="flex items-center gap-2"><Check className="h-4 w-4 text-success" />VIP 期限 +{p.upgrade_days} 天</li>
                    {p.reward_points > 0 && (
                      <li className="flex items-center gap-2"><Check className="h-4 w-4 text-success" />贈送 {p.reward_points} 獎勵點</li>
                    )}
                    {p.gift && (
                      <li className="flex items-center gap-2"><Gift className="h-4 w-4 text-success" />贈品：{p.gift.name} × {p.gift_quantity ?? 1}</li>
                    )}
                  </ul>
                  {p.notes && <p className="text-xs text-muted-foreground">{p.notes}</p>}
                  <Button
                    className="w-full bg-gradient-primary"
                    disabled={!p.product || adding === p.id}
                    onClick={() => addAnnualToCart(p)}
                  >
                    {adding === p.id
                      ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      : <ShoppingCart className="h-4 w-4 mr-2" />}
                    加入購物車
                  </Button>
                  {!user && (
                    <p className="text-xs text-muted-foreground text-center">未登入也可加入；結帳時可登入或快速註冊</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground text-center mt-8">
        購買紀錄可於 <Link to="/shop/account/vip" className="text-primary underline">我的 VIP</Link> 查看
      </p>
    </div>
  );
}
