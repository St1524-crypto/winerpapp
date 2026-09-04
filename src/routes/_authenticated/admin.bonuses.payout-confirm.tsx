import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, Loader2, RefreshCw, Wallet } from "lucide-react";
import { toast } from "sonner";
import { useAuth, type AppRole } from "@/hooks/use-auth";
import { ForbiddenScreen } from "@/components/ForbiddenScreen";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listBonusRecords, manualReleaseRewards } from "@/lib/bonus.functions";
import { bonusTypeLabel } from "@/lib/bonus-labels";

const ALLOWED: AppRole[] = ["super_admin", "admin", "finance"];

/** 發放拆分：現金錢包 80%、貢獻點 20% */
const CASH_RATE = 0.8;
const round2 = (n: number) => Math.round(n * 100) / 100;
const fmt = (n: number) => round2(n).toLocaleString(undefined, { maximumFractionDigits: 2 });

export const Route = createFileRoute("/_authenticated/admin/bonuses/payout-confirm")({
  head: () => ({
    meta: [
      { title: "分紅名單確認｜逐筆勾選後發放" },
      { name: "description", content: "後台逐筆勾選或全選確認待發放分紅名單後，才可觸發自動發放並拆分 80% 現金、20% 貢獻點。" },
      { property: "og:title", content: "分紅名單確認｜逐筆勾選後發放" },
      { property: "og:description", content: "後台逐筆勾選或全選確認待發放分紅名單後，才可觸發自動發放。" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Guard,
});

function Guard() {
  const { roles, loading } = useAuth();
  if (loading) return <div className="p-6 text-sm text-muted-foreground">載入中…</div>;
  if (!roles.some((r) => ALLOWED.includes(r))) return <ForbiddenScreen />;
  return <PayoutConfirmPage />;
}

type Row = {
  id: string;
  member_id: string;
  bonus_type: string;
  bonus_points: number;
  settlement_date: string | null;
  created_at: string;
};

function PayoutConfirmPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [members, setMembers] = useState<Record<string, any>>({});
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res: any = await listBonusRecords({ data: { status: "waiting_release", limit: 500 } });
      const list = ((res?.records ?? []) as Row[]).filter((r) => Number(r.bonus_points ?? 0) > 0);
      setRows(list);
      setMembers(res?.members ?? {});
      setChecked({});
    } catch (e: any) {
      toast.error(e?.message ?? "載入失敗");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const selectedIds = useMemo(() => rows.filter((r) => checked[r.id]).map((r) => r.id), [rows, checked]);
  const allChecked = rows.length > 0 && selectedIds.length === rows.length;

  const totals = useMemo(() => {
    const total = round2(rows.filter((r) => checked[r.id]).reduce((s, r) => s + Number(r.bonus_points ?? 0), 0));
    const cash = round2(total * CASH_RATE);
    return { total, cash, point: round2(total - cash) };
  }, [rows, checked]);

  const toggleAll = (v: boolean) => {
    const next: Record<string, boolean> = {};
    if (v) rows.forEach((r) => { next[r.id] = true; });
    setChecked(next);
  };

  const release = async () => {
    if (!allChecked) {
      toast.error("請逐筆勾選確認全部名單，或使用全選後才可發放");
      return;
    }
    if (!confirm(`確認發放 ${selectedIds.length} 筆、合計 ${fmt(totals.total)} 點？（現金 ${fmt(totals.cash)}／貢獻點 ${fmt(totals.point)}）`)) return;
    setBusy(true);
    try {
      const res: any = await manualReleaseRewards({ data: { recordIds: selectedIds } });
      toast.success(`已發放 ${res?.released ?? 0} 筆，合計 ${fmt(Number(res?.points ?? 0))} 點`);
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "發放失敗");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" />分紅名單確認
          </h1>
          <p className="text-sm text-muted-foreground">逐筆勾選或全選確認後，才能觸發自動發放（現金 80%／貢獻點 20%）。</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link to="/admin/bonuses/payout"><ArrowLeft className="h-4 w-4 mr-1" />獎金發放中心</Link>
          </Button>
          <Button variant="outline" size="sm" onClick={load} disabled={loading || busy}>
            <RefreshCw className="h-4 w-4 mr-1" />重新載入
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardDescription>待發放筆數</CardDescription></CardHeader>
          <CardContent><div className="text-2xl font-bold tabular-nums">{rows.length}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardDescription>已確認筆數</CardDescription></CardHeader>
          <CardContent><div className="text-2xl font-bold tabular-nums">{selectedIds.length}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardDescription>確認金額 · 現金 80%</CardDescription></CardHeader>
          <CardContent><div className="text-2xl font-bold tabular-nums">NT$ {fmt(totals.cash)}</div></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardDescription>確認金額 · 貢獻點 20%</CardDescription></CardHeader>
          <CardContent><div className="text-2xl font-bold tabular-nums">{fmt(totals.point)}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">待發放分紅名單</CardTitle>
            <CardDescription>合計 {fmt(totals.total)} 點已確認 / 共 {rows.length} 筆</CardDescription>
          </div>
          <Button size="sm" onClick={release} disabled={!allChecked || busy || rows.length === 0}>
            {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
            確認並自動發放
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">載入中…</p>
          ) : rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">目前沒有待發放的分紅紀錄</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox checked={allChecked} onCheckedChange={(v) => toggleAll(!!v)} aria-label="全選" />
                  </TableHead>
                  <TableHead>會員</TableHead>
                  <TableHead>獎金類別</TableHead>
                  <TableHead>結算日</TableHead>
                  <TableHead className="text-right">點數</TableHead>
                  <TableHead className="text-right">現金 80%</TableHead>
                  <TableHead className="text-right">貢獻點 20%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const pts = round2(Number(r.bonus_points ?? 0));
                  const cash = round2(pts * CASH_RATE);
                  const m = members[r.member_id];
                  return (
                    <TableRow key={r.id} className={checked[r.id] ? "bg-muted/40" : undefined}>
                      <TableCell>
                        <Checkbox
                          checked={!!checked[r.id]}
                          onCheckedChange={(v) => setChecked((p) => ({ ...p, [r.id]: !!v }))}
                          aria-label="確認此筆"
                        />
                      </TableCell>
                      <TableCell className="text-xs">
                        {m?.name ?? "—"} <Badge variant="outline">{m?.member_no ?? "—"}</Badge>
                      </TableCell>
                      <TableCell className="text-xs">{bonusTypeLabel(r.bonus_type)}</TableCell>
                      <TableCell className="text-xs font-mono">{r.settlement_date ?? "—"}</TableCell>
                      <TableCell className="text-right text-xs font-semibold tabular-nums">{fmt(pts)}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums">NT$ {fmt(cash)}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{fmt(round2(pts - cash))}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
          {!allChecked && rows.length > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">尚未全部確認，發放按鈕維持鎖定。</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
