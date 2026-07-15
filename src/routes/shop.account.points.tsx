import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useEffect, useMemo, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Coins, Gift, Percent, History, Copy, TrendingUp, CalendarDays, CalendarRange, Sparkles, Wallet, Info } from "lucide-react";
import { toast } from "sonner";
import { useWallet, useVipStatus } from "@/hooks/use-wallet";
import { getMyPointTx, getMyReferralStats, getMyLegacyBonus } from "@/lib/points.functions";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

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

type Tx = {
  id: string;
  amount: number;
  point_type: "shopping" | "reward" | "discount" | string;
  source: string;
  note?: string | null;
  created_at: string;
};

function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function ym(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function PointsPage() {
  const { wallet, loading } = useWallet();
  const { is_vip, vip_expires_at } = useVipStatus();
  const [tx, setTx] = useState<Tx[]>([]);
  const [txLoading, setTxLoading] = useState(true);
  const [ref, setRef] = useState<{ referral_code: string | null; total: number; total_points: number }>({
    referral_code: null,
    total: 0,
    total_points: 0,
  });
  const [legacy, setLegacy] = useState<{ legacy_bonus_total: number; member_no: string | null; source: string; imported_at: string | null }>({
    legacy_bonus_total: 0,
    member_no: null,
    source: "歷史匯入：累計獎金.pdf",
    imported_at: null,
  });

  useEffect(() => {
    setTxLoading(true);
    getMyPointTx()
      .then((d) => setTx(d as Tx[]))
      .catch(() => {})
      .finally(() => setTxLoading(false));
    getMyReferralStats().then((d) => setRef(d as any)).catch(() => {});
    getMyLegacyBonus().then((d) => setLegacy(d as any)).catch(() => {});
  }, []);

  const shareLink = ref.referral_code
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/login?ref=${ref.referral_code}`
    : "";

  // 收益 = 獎勵點正向異動
  const rewardEarnings = useMemo(() => tx.filter((t) => t.point_type === "reward" && t.amount > 0), [tx]);

  const rewardEarningsSum = useMemo(() => rewardEarnings.reduce((s, t) => s + t.amount, 0), [rewardEarnings]);
  const totalEarnings = rewardEarningsSum + (legacy.legacy_bonus_total ?? 0);

  const todayKey = ymd(new Date());
  const monthKey = ym(new Date());

  const todayEarnings = useMemo(
    () => rewardEarnings.filter((t) => ymd(new Date(t.created_at)) === todayKey).reduce((s, t) => s + t.amount, 0),
    [rewardEarnings, todayKey],
  );

  const monthEarnings = useMemo(
    () => rewardEarnings.filter((t) => ym(new Date(t.created_at)) === monthKey).reduce((s, t) => s + t.amount, 0),
    [rewardEarnings, monthKey],
  );

  // 日明細：近 60 天，附各獎金來源明細
  const dailyDetail = useMemo(() => {
    const map = new Map<string, { date: string; amount: number; count: number; bySource: Map<string, { amount: number; count: number; notes: string[] }> }>();
    for (const t of rewardEarnings) {
      const k = ymd(new Date(t.created_at));
      const cur = map.get(k) ?? { date: k, amount: 0, count: 0, bySource: new Map() };
      cur.amount += t.amount;
      cur.count += 1;
      const src = cur.bySource.get(t.source) ?? { amount: 0, count: 0, notes: [] };
      src.amount += t.amount;
      src.count += 1;
      if (t.note) src.notes.push(t.note);
      cur.bySource.set(t.source, src);
      map.set(k, cur);
    }
    return [...map.values()]
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, 60)
      .map((d) => ({
        ...d,
        sources: [...d.bySource.entries()]
          .map(([source, v]) => ({ source, ...v }))
          .sort((a, b) => b.amount - a.amount),
      }));
  }, [rewardEarnings]);


  // 月明細：近 12 個月
  const monthlyDetail = useMemo(() => {
    const map = new Map<string, { month: string; amount: number; count: number }>();
    for (const t of rewardEarnings) {
      const k = ym(new Date(t.created_at));
      const cur = map.get(k) ?? { month: k, amount: 0, count: 0 };
      cur.amount += t.amount;
      cur.count += 1;
      map.set(k, cur);
    }
    return [...map.values()].sort((a, b) => (a.month < b.month ? 1 : -1)).slice(0, 24);
  }, [rewardEarnings]);

  return (
    <div className="space-y-6">
      {/* 收益總覽 */}
      <div className="grid sm:grid-cols-3 gap-4">
        <Card className="bg-gradient-to-br from-primary/10 to-transparent border-primary/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground">
              <TrendingUp className="h-4 w-4 text-primary" />累計總收益
            </CardTitle>
          </CardHeader>
          <CardContent>
            {txLoading ? <Skeleton className="h-8 w-24" /> : (
              <div className="text-3xl font-bold tabular-nums text-primary">{totalEarnings.toLocaleString()}</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              匯入累計獎金 {(legacy.legacy_bonus_total ?? 0).toLocaleString()} + 新增貢獻點 {rewardEarningsSum.toLocaleString()}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-success/10 to-transparent border-success/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground">
              <Sparkles className="h-4 w-4 text-success" />今日收益
            </CardTitle>
          </CardHeader>
          <CardContent>
            {txLoading ? <Skeleton className="h-8 w-24" /> : (
              <div className="text-3xl font-bold tabular-nums text-success">+{todayEarnings.toLocaleString()}</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">{todayKey}</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-warning/10 to-transparent border-warning/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground">
              <CalendarRange className="h-4 w-4 text-warning" />本月收益
            </CardTitle>
          </CardHeader>
          <CardContent>
            {txLoading ? <Skeleton className="h-8 w-24" /> : (
              <div className="text-3xl font-bold tabular-nums text-warning">+{monthEarnings.toLocaleString()}</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">{monthKey}</p>
          </CardContent>
        </Card>
      </div>

      {/* 錢包餘額 */}
      <div className="grid sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2 text-muted-foreground"><Coins className="h-4 w-4 text-primary" />購物點</CardTitle></CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-8 w-24" /> : <div className="text-3xl font-bold tabular-nums">{wallet.shopping_points.toLocaleString()}</div>}
            <p className="text-xs text-muted-foreground mt-1">儲值點，1 點 = NT$ 1</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2 text-muted-foreground"><Gift className="h-4 w-4 text-warning" />貢獻點</CardTitle></CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-8 w-24" /> : <div className="text-3xl font-bold tabular-nums">{wallet.reward_points.toLocaleString()}</div>}
            <p className="text-xs text-muted-foreground mt-1">VIP 獎金 / 推薦 / 消費分紅 / 營業分紅</p>
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
          <p className="text-xs text-muted-foreground">分享連結讓朋友註冊，雙方各獲得 100 貢獻點。</p>
          <div className="flex gap-6 text-sm pt-2 border-t border-border/40">
            <div><span className="text-muted-foreground">已推薦：</span><span className="font-medium">{ref.total} 人</span></div>
            <div><span className="text-muted-foreground">累計獲得：</span><span className="font-medium">{ref.total_points.toLocaleString()} 點</span></div>
          </div>
        </CardContent>
      </Card>

      {/* 貢獻點明細：日 / 月 / 全部 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Gift className="h-4 w-4 text-warning" />貢獻點明細
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="daily">
            <TabsList>
              <TabsTrigger value="daily" className="gap-1"><CalendarDays className="h-3.5 w-3.5" />日明細</TabsTrigger>
              <TabsTrigger value="monthly" className="gap-1"><CalendarRange className="h-3.5 w-3.5" />月明細</TabsTrigger>
              <TabsTrigger value="all" className="gap-1"><History className="h-3.5 w-3.5" />全部異動</TabsTrigger>
            </TabsList>

            <TabsContent value="daily" className="mt-4">
              {txLoading ? (
                <Skeleton className="h-40 w-full" />
              ) : dailyDetail.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">尚無紀錄</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>日期 / 來源</TableHead>
                      <TableHead className="text-right">筆數</TableHead>
                      <TableHead className="text-right">獲得貢獻點</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dailyDetail.map((d) => (
                      <Fragment key={d.date}>
                        <TableRow className="bg-muted/30">
                          <TableCell className="font-mono text-xs font-semibold">{d.date}</TableCell>
                          <TableCell className="text-right tabular-nums text-xs font-semibold">{d.count}</TableCell>
                          <TableCell className="text-right tabular-nums font-semibold text-success">+{d.amount.toLocaleString()}</TableCell>
                        </TableRow>
                        {d.sources.map((s) => (
                          <TableRow key={`${d.date}-${s.source}`}>
                            <TableCell className="pl-8 text-xs text-muted-foreground">
                              <div>{SOURCE_LABELS[s.source] ?? s.source}</div>
                              {s.notes.length > 0 && (
                                <div className="text-[11px] text-muted-foreground/80 mt-0.5 line-clamp-2">
                                  {[...new Set(s.notes)].slice(0, 3).join("；")}
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-xs text-muted-foreground">{s.count}</TableCell>
                            <TableCell className="text-right tabular-nums text-xs text-success">+{s.amount.toLocaleString()}</TableCell>
                          </TableRow>
                        ))}
                      </Fragment>
                    ))}

                  </TableBody>
                </Table>

              )}
            </TabsContent>

            <TabsContent value="monthly" className="mt-4">
              {txLoading ? (
                <Skeleton className="h-40 w-full" />
              ) : monthlyDetail.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">尚無紀錄</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>月份</TableHead>
                      <TableHead className="text-right">筆數</TableHead>
                      <TableHead className="text-right">獲得貢獻點</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {monthlyDetail.map((m) => (
                      <TableRow key={m.month}>
                        <TableCell className="font-mono text-xs">{m.month}</TableCell>
                        <TableCell className="text-right tabular-nums text-xs">{m.count}</TableCell>
                        <TableCell className="text-right tabular-nums font-semibold text-success">+{m.amount.toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>

            <TabsContent value="all" className="mt-4">
              {txLoading ? (
                <Skeleton className="h-40 w-full" />
              ) : tx.length === 0 ? (
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
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
