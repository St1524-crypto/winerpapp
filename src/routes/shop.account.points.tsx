import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useEffect, useMemo, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Coins, Gift, Percent, History, Copy, TrendingUp, CalendarDays, CalendarRange, Sparkles, Wallet, Info } from "lucide-react";
import { toast } from "sonner";
import { useWallet, useVipStatus } from "@/hooks/use-wallet";
import { getMyPointTx, getMyReferralStats, getMyLegacyBonus } from "@/lib/points.functions";
import { getMyCashWallet, getMyCashLedger } from "@/lib/cash-wallet.functions";
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
  bonus_release: "獎金發放",
  cash_topup: "現金儲值",
  cash_withdraw: "現金提領",
  cash_buy_points: "現金購買購物點",
  cash_refund: "現金退款",
  cash_adjust: "現金調整",
};

const WALLET_LABELS: Record<string, string> = {
  cash: "現金餘額",
  shopping: "購物點",
  reward: "貢獻點",
  discount: "折扣點",
};

type Tx = {
  id: string;
  amount: number;
  point_type: "shopping" | "reward" | "discount" | string;
  source: string;
  note?: string | null;
  created_at: string;
};

// 統一化的「獎金/收益」條目（現金餘額 + 購物點 + 貢獻點）
type Entry = {
  id: string;
  wallet: "cash" | "shopping" | "reward" | "discount";
  amount: number;
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

  const [cash, setCash] = useState(0);
  const [cashTx, setCashTx] = useState<any[]>([]);

  useEffect(() => {
    setTxLoading(true);
    Promise.all([
      getMyPointTx().then((d) => setTx(d as Tx[])).catch(() => {}),
      getMyCashLedger().then((d) => setCashTx((d as any[]) ?? [])).catch(() => {}),
    ]).finally(() => setTxLoading(false));
    getMyCashWallet().then((d: any) => setCash(Number(d?.cash_balance ?? 0))).catch(() => {});
    getMyReferralStats().then((d) => setRef(d as any)).catch(() => {});
    getMyLegacyBonus().then((d) => setLegacy(d as any)).catch(() => {});
  }, []);

  const shareLink = ref.referral_code
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/login?ref=${ref.referral_code}`
    : "";

  // 全部異動（現金 + 點數）
  const allEntries = useMemo<Entry[]>(() => {
    const pointRows: Entry[] = tx.map((t) => ({
      id: t.id,
      wallet: (t.point_type as Entry["wallet"]) ?? "reward",
      amount: Number(t.amount ?? 0),
      source: t.source,
      note: t.note,
      created_at: t.created_at,
    }));
    const cashRows: Entry[] = (cashTx ?? [])
      .filter((c) => ["completed", "approved"].includes(String(c.status)))
      .map((c) => {
        const raw = Number(c.amount ?? 0);
        const outflow = ["withdraw", "buy_points"].includes(String(c.tx_type));
        return {
          id: `cash-${c.id}`,
          wallet: "cash" as const,
          amount: outflow ? -Math.abs(raw) : raw,
          source: `cash_${c.tx_type}`,
          note: c.note,
          created_at: c.created_at,
        };
      });
    return [...pointRows, ...cashRows].sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  }, [tx, cashTx]);

  // 獎金/收益 = 現金餘額、購物點、貢獻點的正向異動
  const earnings = useMemo(
    () => allEntries.filter((e) => e.amount > 0 && ["cash", "shopping", "reward"].includes(e.wallet)),
    [allEntries],
  );

  const earningsSum = useMemo(() => earnings.reduce((s, t) => s + t.amount, 0), [earnings]);
  const totalEarnings = earningsSum + (legacy.legacy_bonus_total ?? 0);

  // 本日收益：顯示「昨日」產生的獎金（日結於隔日入帳）
  const yesterday = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d;
  }, []);
  const prevMonthDate = useMemo(() => {
    const d = new Date();
    d.setDate(1);
    d.setMonth(d.getMonth() - 1);
    return d;
  }, []);
  const yesterdayKey = ymd(yesterday);
  const prevMonthKey = ym(prevMonthDate);

  const yesterdayEarnings = useMemo(
    () => earnings.filter((t) => ymd(new Date(t.created_at)) === yesterdayKey).reduce((s, t) => s + t.amount, 0),
    [earnings, yesterdayKey],
  );

  const prevMonthEarnings = useMemo(
    () => earnings.filter((t) => ym(new Date(t.created_at)) === prevMonthKey).reduce((s, t) => s + t.amount, 0),
    [earnings, prevMonthKey],
  );

  // 日明細：近 60 天，附各獎金來源明細
  const dailyDetail = useMemo(() => {
    const map = new Map<string, { date: string; amount: number; count: number; bySource: Map<string, { amount: number; count: number; notes: string[] }> }>();
    for (const t of earnings) {
      const k = ymd(new Date(t.created_at));
      const cur = map.get(k) ?? { date: k, amount: 0, count: 0, bySource: new Map() };
      cur.amount += t.amount;
      cur.count += 1;
      const key = `${t.wallet}:${t.source}`;
      const src = cur.bySource.get(key) ?? { amount: 0, count: 0, notes: [] };
      src.amount += t.amount;
      src.count += 1;
      if (t.note) src.notes.push(t.note);
      cur.bySource.set(key, src);
      map.set(k, cur);
    }
    return [...map.values()]
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, 60)
      .map((d) => ({
        ...d,
        sources: [...d.bySource.entries()]
          .map(([key, v]) => ({ key, ...v }))
          .sort((a, b) => b.amount - a.amount),
      }));
  }, [earnings]);


  // 月明細：近 12 個月
  const monthlyDetail = useMemo(() => {
    const map = new Map<string, { month: string; amount: number; count: number }>();
    for (const t of earnings) {
      const k = ym(new Date(t.created_at));
      const cur = map.get(k) ?? { month: k, amount: 0, count: 0 };
      cur.amount += t.amount;
      cur.count += 1;
      map.set(k, cur);
    }
    return [...map.values()].sort((a, b) => (a.month < b.month ? 1 : -1)).slice(0, 24);
  }, [earnings]);

  return (
    <div className="space-y-6">
      {/* 收益總覽 */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
              匯入累計獎金 {(legacy.legacy_bonus_total ?? 0).toLocaleString()} + 新增獎金 {earningsSum.toLocaleString()}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-info/10 to-transparent">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground">
              <Wallet className="h-4 w-4 text-primary" />現金餘額
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold tabular-nums">NT$ {cash.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">獎金 80% 撥入現金錢包</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-success/10 to-transparent border-success/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground">
              <Sparkles className="h-4 w-4 text-success" />本日收益
            </CardTitle>
          </CardHeader>
          <CardContent>
            {txLoading ? <Skeleton className="h-8 w-24" /> : (
              <div className="text-3xl font-bold tabular-nums text-success">+{yesterdayEarnings.toLocaleString()}</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">{yesterdayKey}（昨日產生之獎金）</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-warning/10 to-transparent border-warning/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground">
              <CalendarRange className="h-4 w-4 text-warning" />前月收入
            </CardTitle>
          </CardHeader>
          <CardContent>
            {txLoading ? <Skeleton className="h-8 w-24" /> : (
              <div className="text-3xl font-bold tabular-nums text-warning">+{prevMonthEarnings.toLocaleString()}</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">{prevMonthKey}</p>
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

      {/* 獎金明細：日 / 月 / 全部（現金餘額 + 購物點 + 貢獻點） */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Gift className="h-4 w-4 text-warning" />獎金明細
            <span className="text-xs font-normal text-muted-foreground">現金餘額 / 購物點 / 貢獻點</span>
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
                      <TableHead>日期 / 錢包來源</TableHead>
                      <TableHead className="text-right">筆數</TableHead>
                      <TableHead className="text-right">獲得金額 / 點數</TableHead>
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
                          <TableRow key={`${d.date}-${s.key}`}>
                            <TableCell className="pl-8 text-xs text-muted-foreground">
                              <div>
                                {WALLET_LABELS[s.key.split(":")[0]] ?? s.key.split(":")[0]}
                                {" · "}
                                {SOURCE_LABELS[s.key.split(":").slice(1).join(":")] ?? s.key.split(":").slice(1).join(":")}
                              </div>
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
                      <TableHead className="text-right">獲得金額 / 點數</TableHead>
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
                          {t.point_type === "shopping" ? "購物點" : t.point_type === "reward" ? "貢獻點" : "折扣點"}
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
