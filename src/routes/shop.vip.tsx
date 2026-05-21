import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Crown, Check, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { upgradeVip } from "@/lib/points.functions";
import { useAuth } from "@/hooks/use-auth";
import { useVipStatus } from "@/hooks/use-wallet";
import { toast } from "sonner";

export const Route = createFileRoute("/shop/vip")({
  component: VipPage,
  head: () => ({ meta: [{ title: "VIP 升級 — 源晶商城" }] }),
});

function VipPage() {
  const { user } = useAuth();
  const { is_vip, vip_expires_at, refresh } = useVipStatus();
  const nav = useNavigate();
  const [plans, setPlans] = useState<any[]>([]);
  const [upgrading, setUpgrading] = useState<string | null>(null);

  useEffect(() => {
    supabase.from("vip_plans" as any).select("*").eq("status", "active").order("sort_order").then(({ data }) => {
      setPlans((data ?? []) as any[]);
    });
  }, []);

  async function handleUpgrade(planId: string) {
    if (!user) { nav({ to: "/login" }); return; }
    setUpgrading(planId);
    try {
      await upgradeVip({ data: { planId } });
      toast.success("VIP 升級成功！");
      refresh();
    } catch (e: any) {
      toast.error(e.message ?? "升級失敗");
    } finally {
      setUpgrading(null);
    }
  }

  return (
    <div className="container mx-auto px-4 py-10 max-w-5xl">
      <div className="text-center mb-10">
        <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-gradient-primary mb-4">
          <Crown className="h-8 w-8 text-primary-foreground" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight">VIP 會員專屬權益</h1>
        <p className="text-sm text-muted-foreground mt-2">成為 VIP，享獨家價格、額外獎勵點、優先客服</p>
        {is_vip && (
          <p className="mt-3 text-sm text-success">您已是 VIP，有效期至 {vip_expires_at ? new Date(vip_expires_at).toLocaleDateString() : "—"}</p>
        )}
      </div>

      <div className="grid sm:grid-cols-2 gap-6">
        {plans.length === 0 && (
          <p className="col-span-full text-center text-muted-foreground py-12">尚無方案</p>
        )}
        {plans.map((p) => (
          <Card key={p.id} className="relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-primary" />
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Crown className="h-5 w-5 text-primary" />
                {p.name}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="text-3xl font-bold">NT$ {Number(p.price).toLocaleString()}<span className="text-sm font-normal text-muted-foreground"> / {p.duration_days} 天</span></div>
              {p.description && <p className="text-sm text-muted-foreground">{p.description}</p>}
              <ul className="space-y-2 text-sm">
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-success" />VIP 專屬商品價</li>
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-success" />立即獲得 {p.bonus_points} 獎勵點</li>
                <li className="flex items-center gap-2"><Check className="h-4 w-4 text-success" />優先客服支援</li>
              </ul>
              <Button className="w-full bg-gradient-primary" disabled={upgrading === p.id} onClick={() => handleUpgrade(p.id)}>
                {upgrading === p.id && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {is_vip ? "續約 VIP" : "立即升級"}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>

      <p className="text-xs text-muted-foreground text-center mt-8">
        升級後立即生效，點數記錄可於 <Link to="/shop/account/points" className="text-primary underline">我的點數</Link> 查看。
      </p>
    </div>
  );
}
