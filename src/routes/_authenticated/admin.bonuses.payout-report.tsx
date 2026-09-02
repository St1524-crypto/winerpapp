import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Coins, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getVipPayoutReport } from "@/lib/bonus-payout-report.functions";

export const Route = createFileRoute("/_authenticated/admin/bonuses/payout-report")({
  head: () => ({
    meta: [
      { title: "VIP 發放報表｜日結月結待發與已發 80/20" },
      { name: "description", content: "列出每位 VIP 的日結、月結待發放與已發放金額，並對應 80% 現金錢包與 20% 貢獻點拆分。" },
      { property: "og:title", content: "VIP 發放報表｜日結月結待發與已發 80/20" },
      { property: "og:description", content: "後台報表：每位 VIP 的待發放與已發放獎金及 80/20 拆分明細。" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PayoutReportPage,
});

const fmt = (n: any) => Number(n ?? 0).toLocaleString();

function PayoutReportPage() {
  const loadFn = useServerFn(getVipPayoutReport);
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const load = useCallback(async () => {
    setBusy(true);
    try {
      setData(await loadFn({ data: { from: from || undefined, to: to || undefined } }));
    } catch (e: any) {
      toast.error(e.message ?? "讀取失敗");
    } finally {
      setBusy(false);
    }
  }, [loadFn, from, to]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!data)
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );

  const t = data.totals;
  const cell = (b: any) => (
    <>
      <div className="tabular-nums">{fmt(b.points)}</div>
      <div className="text-[11px] text-muted-foreground tabular-nums">
        現 {fmt(b.cash)}／貢 {fmt(b.point)}
      </div>
    </>
  );

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/admin/bonuses/payout" className="mb-1 inline-flex items-center gap-1 text-sm text-muted-foreground">
            <ArrowLeft className="h-4 w-4" /> 返回獎金發放中心
          </Link>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Coins className="h-6 w-6" /> VIP 發放報表
          </h1>
          <p className="text-sm text-muted-foreground">
            依會員彙總日結／月結的待發放與已發放獎金，並對應 80% 現金錢包、20% 貢獻點拆分。
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label className="text-xs">結算日起</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">結算日迄</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <Button variant="outline" onClick={load} disabled={busy}>
            <RefreshCw className="mr-2 h-4 w-4" /> 查詢
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        {[
          ["日結待發放", t.waitingDaily],
          ["月結待發放", t.waitingMonthly],
          ["今日到期可發", t.due],
          ["日結已發放", t.releasedDaily],
          ["月結已發放", t.releasedMonthly],
        ].map(([label, b]: any) => (
          <Card key={label}>
            <CardHeader className="pb-2">
              <CardDescription>{label}</CardDescription>
              <CardTitle className="text-2xl">{fmt(b.points)} 點</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {fmt(b.count)} 筆　現金 {fmt(b.cash)}／貢獻點 {fmt(b.point)}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">每位 VIP 明細（{fmt(data.memberCount)} 位）</CardTitle>
          <CardDescription>金額欄位皆以「總點數／現金 80%／貢獻點 20%」呈現。</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>會員</TableHead>
                <TableHead>階級</TableHead>
                <TableHead className="text-right">日結待發</TableHead>
                <TableHead className="text-right">月結待發</TableHead>
                <TableHead className="text-right">今日到期</TableHead>
                <TableHead className="text-right">日結已發</TableHead>
                <TableHead className="text-right">月結已發</TableHead>
                <TableHead className="text-right">現金錢包</TableHead>
                <TableHead className="text-right">貢獻點</TableHead>
                <TableHead>最近發放</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.members.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-muted-foreground">
                    查無資料
                  </TableCell>
                </TableRow>
              )}
              {data.members.map((m: any) => (
                <TableRow key={m.memberId}>
                  <TableCell className="text-xs">
                    {m.name ?? "—"} <Badge variant="outline">{m.memberNo ?? "—"}</Badge>
                  </TableCell>
                  <TableCell className="text-xs">{m.tierCode ?? "—"}</TableCell>
                  <TableCell className="text-right text-xs">{cell(m.waitingDaily)}</TableCell>
                  <TableCell className="text-right text-xs">{cell(m.waitingMonthly)}</TableCell>
                  <TableCell className="text-right text-xs">{cell(m.due)}</TableCell>
                  <TableCell className="text-right text-xs">{cell(m.releasedDaily)}</TableCell>
                  <TableCell className="text-right text-xs">{cell(m.releasedMonthly)}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums">{fmt(m.cashBalance)}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums">{fmt(m.contributionPoints)}</TableCell>
                  <TableCell className="text-xs">
                    {m.lastReleasedAt ? new Date(m.lastReleasedAt).toLocaleString() : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
