import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Coins, Gift, Percent, History, Copy } from "lucide-react";
import { toast } from "sonner";
import { useWallet, useVipStatus } from "@/hooks/use-wallet";
import { getMyPointTx, getMyReferralStats } from "@/lib/points.functions";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/shop/account/points")({
  component: PointsPage,
  head: () => ({ meta: [{ title: "我的點數 — 源晶商城" }] }),
});

const SOURCE_LABELS: Record<string, string> = {
  topup: "儲值",
  order_earn: "購物獲得",
  order_redeem: "結帳折抵",
  referral: "推薦獎勵",
  vip_bonus: "VIP 開通",
  admin_adjust: "管理員調整",
  expire: "點數過期",
};

function PointsPage() {
  const { wallet, loading } = useWallet();
  const { is_vip, vip_expires_at } = useVipStatus();
  const [tx, setTx] = useState<any[]>([]);
  const [ref, setRef] = useState<{ referral_code: string | null; total: number; total_points: number }>({
    referral_code: null,
    total: 0,
    total_points: 0,
  });

  useEffect(() => {
    getMyPointTx().then((d) => setTx(d as any[])).catch(() => {});
    getMyReferralStats().then((d) => setRef(d as any)).catch(() => {});
  }, []);

  const shareLink = ref.referral_code
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/login?ref=${ref.referral_code}`
    : "";

  return (
    <div className="space-y-6">
      <div className="grid sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2 text-muted-foreground"><Coins className="h-4 w-4 text-primary" />購物點</CardTitle></CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-8 w-24" /> : <div className="text-3xl font-bold tabular-nums">{wallet.shopping_points.toLocaleString()}</div>}
            <p className="text-xs text-muted-foreground mt-1">儲值點，1 點 = NT$ 1</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2 text-muted-foreground"><Gift className="h-4 w-4 text-warning" />獎勵點</CardTitle></CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-8 w-24" /> : <div className="text-3xl font-bold tabular-nums">{wallet.reward_points.toLocaleString()}</div>}
            <p className="text-xs text-muted-foreground mt-1">購物 / 推廣回饋</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2 text-muted-foreground"><Percent className="h-4 w-4 text-success" />折扣點</CardTitle></CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-8 w-24" /> : <div className="text-3xl font-bold tabular-nums">{wallet.discount_points.toLocaleString()}</div>}
            <p className="text-xs text-muted-foreground mt-1">結帳時可折抵</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center justify-between">
            <span>VIP 狀態</span>
            {is_vip ? <Badge className="bg-gradient-primary">VIP</Badge> : <Badge variant="outline">一般會員</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          {is_vip ? (
            <p>VIP 有效期至 <span className="font-medium">{vip_expires_at ? new Date(vip_expires_at).toLocaleDateString() : "—"}</span></p>
          ) : (
            <p className="text-muted-foreground">尚未升級 VIP。<a href="/shop/vip" className="text-primary underline ml-1">查看 VIP 方案</a></p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">我的推薦碼</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center gap-3">
            <div className="font-mono text-lg font-bold px-3 py-1.5 rounded bg-muted">{ref.referral_code ?? "—"}</div>
            <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(shareLink); toast.success("已複製分享連結"); }}>
              <Copy className="h-3 w-3 mr-1" />複製分享連結
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">分享連結讓朋友註冊，雙方各獲得 100 獎勵點。</p>
          <div className="flex gap-6 text-sm pt-2 border-t border-border/40">
            <div><span className="text-muted-foreground">已推薦：</span><span className="font-medium">{ref.total} 人</span></div>
            <div><span className="text-muted-foreground">累計獲得：</span><span className="font-medium">{ref.total_points.toLocaleString()} 點</span></div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><History className="h-4 w-4" />點數異動紀錄</CardTitle>
        </CardHeader>
        <CardContent>
          {tx.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">尚無紀錄</p>
          ) : (
            <div className="space-y-2 text-sm">
              {tx.map((t) => (
                <div key={t.id} className="flex items-center justify-between py-2 border-b border-border/40 last:border-0">
                  <div className="min-w-0">
                    <div className="font-medium text-xs">
                      {SOURCE_LABELS[t.source] ?? t.source} ·{" "}
                      {t.point_type === "shopping" ? "購物點" : t.point_type === "reward" ? "獎勵點" : "折扣點"}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {new Date(t.created_at).toLocaleString()} {t.note ? `· ${t.note}` : ""}
                    </div>
                  </div>
                  <div className={`tabular-nums font-semibold ${t.amount > 0 ? "text-success" : "text-destructive"}`}>
                    {t.amount > 0 ? "+" : ""}{t.amount}
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
