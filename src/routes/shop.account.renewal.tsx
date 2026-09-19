import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CalendarClock, Loader2, Wallet, Coins } from "lucide-react";
import { getMyRenewalInfo, renewAnnualFee } from "@/lib/vip-renewal.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/shop/account/renewal")({
  component: RenewalPage,
  head: () => ({
    meta: [
      { title: "年費續約 — 源晶商城" },
      { name: "description", content: "以現金錢包或購物錢包支付年費 NT$1,500，續約 365 天 VIP 資格。" },
      { property: "og:title", content: "年費續約 — 源晶商城" },
      { property: "og:description", content: "年費 NT$1,500，可用現金錢包或購物錢包支付。" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function RenewalPage() {
  const infoFn = useServerFn(getMyRenewalInfo);
  const renewFn = useServerFn(renewAnnualFee);
  const [info, setInfo] = useState<any>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    try { setInfo(await infoFn()); } catch { /* ignore */ }
  }
  useEffect(() => { load(); }, []);

  async function pay(method: "cash" | "shopping") {
    if (!confirm(`確認以${method === "cash" ? "現金錢包" : "購物錢包"}支付年費 NT$1,500？`)) return;
    setBusy(method);
    try {
      const r: any = await renewFn({ data: { method } });
      toast.success(`續約成功！有效期至 ${new Date(r.vip_expires_at).toLocaleDateString()}`);
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "續約失敗");
    } finally { setBusy(null); }
  }

  const fee = info?.fee ?? 1500;
  const cash = Number(info?.cash_balance ?? 0);
  const points = Number(info?.shopping_points ?? 0);

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <CalendarClock className="h-6 w-6 text-primary" />年費續約
        </h1>
        <p className="text-sm text-muted-foreground mt-1">年費 NT$ {fee.toLocaleString()}，續約後 VIP 資格延長 365 天。</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">目前狀態</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            VIP 狀態：
            <Badge variant={info?.is_vip ? "default" : "secondary"}>{info?.is_vip ? "有效" : "未生效 / 已到期"}</Badge>
          </div>
          <div>到期日：{info?.vip_expires_at ? new Date(info.vip_expires_at).toLocaleDateString() : "—"}</div>
        </CardContent>
      </Card>

      <div className="grid sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Wallet className="h-4 w-4" />現金錢包支付</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>目前餘額：<span className="font-bold">NT$ {cash.toLocaleString()}</span></div>
            <div className="text-muted-foreground">扣款金額：NT$ {fee.toLocaleString()}</div>
            <Button
              className="w-full bg-gradient-primary"
              disabled={!info || busy !== null || cash < fee}
              onClick={() => pay("cash")}
            >
              {busy === "cash" && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {cash < fee ? "餘額不足" : "以現金錢包續約"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Coins className="h-4 w-4" />購物錢包支付</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>目前購物點：<span className="font-bold">{points.toLocaleString()} 點</span></div>
            <div className="text-muted-foreground">扣除點數：{fee.toLocaleString()} 點（1 點 = NT$1）</div>
            <Button
              className="w-full"
              variant="secondary"
              disabled={!info || busy !== null || points < fee}
              onClick={() => pay("shopping")}
            >
              {busy === "shopping" && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {points < fee ? "點數不足" : "以購物錢包續約"}
            </Button>
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-muted-foreground">
        續約僅延長 VIP 效期，不發放升級獎勵點；如需提升位階請至「VIP 升級」購買升級套組。
      </p>
    </div>
  );
}
