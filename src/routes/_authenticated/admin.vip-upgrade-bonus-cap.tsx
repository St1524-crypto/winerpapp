import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import {
  adminListMembersUpgradeBonusSummary,
  adminListUpgradeBonusLedger,
  previewUpgradeBonusRelease,
} from "@/lib/vip-upgrade-bonus-cap.functions";
import {
  runDailyRevenueBonus,
  listDailyRevenueBonusLedger,
} from "@/lib/vip-daily-revenue-bonus.functions";
import { BONUS_PAGE_LABELS, pageMetaTitle } from "@/lib/bonus-pool-labels";

export const Route = createFileRoute("/_authenticated/admin/vip-upgrade-bonus-cap")({
  component: Page,
  head: () => ({ meta: [{ title: pageMetaTitle(BONUS_PAGE_LABELS.vipUpgradeBonusCap) }] }),
  errorComponent: ({ error, reset }) => {
    const router = useRouter();
    return (
      <div className="p-6">
        <p className="text-destructive">載入失敗：{error.message}</p>
        <Button
          className="mt-2"
          onClick={() => {
            reset();
            router.invalidate();
          }}
        >
          重試
        </Button>
      </div>
    );
  },
  notFoundComponent: () => <div className="p-6">找不到頁面</div>,
});

function fmt(n: number | null | undefined) {
  if (n === null || n === undefined) return "—";
  return `NT$${Number(n).toLocaleString()}`;
}

function Page() {
  const listSummary = useServerFn(adminListMembersUpgradeBonusSummary);
  const listLedger = useServerFn(adminListUpgradeBonusLedger);
  const preview = useServerFn(previewUpgradeBonusRelease);
  const runDaily = useServerFn(runDailyRevenueBonus);
  const listDaily = useServerFn(listDailyRevenueBonusLedger);

  const [summary, setSummary] = useState<any[]>([]);
  const [ledger, setLedger] = useState<any[]>([]);
  const [daily, setDaily] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [memberId, setMemberId] = useState("");
  const [tierCode, setTierCode] = useState("E");
  const [bonusAmount, setBonusAmount] = useState(5000);
  const [preview1, setPreview1] = useState<any>(null);

  const [runDate, setRunDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  });
  const [runResult, setRunResult] = useState<any>(null);
  const [running, setRunning] = useState(false);

  async function loadAll() {
    setLoading(true);
    try {
      const [s, l, d] = await Promise.all([
        listSummary(),
        listLedger({ data: {} }),
        listDaily(),
      ]);
      setSummary(s as any[]);
      setLedger(l as any[]);
      setDaily(d as any[]);
    } catch (e: any) {
      toast.error(e.message ?? "載入失敗");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  async function runPreview() {
    try {
      const r = await preview({
        data: { memberId, tierCode, bonusAmount: Number(bonusAmount) },
      });
      setPreview1(r);
    } catch (e: any) {
      toast.error(e.message ?? "計算失敗");
    }
  }

  async function runDailyNow() {
    setRunning(true);
    try {
      const r = await runDaily({ data: { date: runDate } });
      setRunResult(r);
      toast.success("已執行每日發放");
      loadAll();
    } catch (e: any) {
      toast.error(e.message ?? "發放失敗");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{BONUS_PAGE_LABELS.vipUpgradeBonusCap}管理</h1>
        <Badge variant="secondary">每日按星級池 5% 平均分配</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>每日營業分紅發放（V1~V7 + 董事）</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-end gap-3 flex-wrap">
            <div className="space-y-1">
              <Label>發放日期（讀取當日訂單獎勵點 × 5%）</Label>
              <Input type="date" value={runDate} onChange={(e) => setRunDate(e.target.value)} />
            </div>
            <Button onClick={runDailyNow} disabled={running}>
              {running ? "執行中…" : "手動執行發放"}
            </Button>
            <span className="text-xs text-muted-foreground">
              系統排程每日 00:10 自動執行前一天；同日重複執行不會重複發放。
            </span>
          </div>
          {runResult && (
            <div className="grid grid-cols-2 md:grid-cols-6 gap-2 text-sm">
              <Field label="當日獎勵點總額" value={fmt(runResult.total_reward_points)} />
              <Field label="池金額 (5%)" value={fmt(runResult.pool_amount)} />
              <Field label="有效人數" value={String(runResult.eligible_count ?? 0)} />
              <Field label="每人分配" value={fmt(runResult.per_head_amount)} />
              <Field label="實發總額" value={fmt(runResult.distributed_amount)} />
              <Field label="截斷總額" value={fmt(runResult.capped_total)} />
            </div>
          )}
          <div>
            <div className="text-sm font-medium mb-2">最近發放紀錄（500 筆）</div>
            {daily.length === 0 ? (
              <p className="text-muted-foreground text-sm">尚無紀錄</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>日期</TableHead>
                    <TableHead>會員</TableHead>
                    <TableHead>階級</TableHead>
                    <TableHead>分配</TableHead>
                    <TableHead>實發</TableHead>
                    <TableHead>截斷</TableHead>
                    <TableHead>累計/上限</TableHead>
                    <TableHead>狀態</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {daily.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs">{r.distribution_date}</TableCell>
                      <TableCell className="text-xs">{r.member_id?.slice(0, 8)}</TableCell>
                      <TableCell>{r.tier_code}</TableCell>
                      <TableCell>{fmt(r.allocated_amount)}</TableCell>
                      <TableCell>{fmt(r.payable_amount)}</TableCell>
                      <TableCell>{fmt(r.capped_amount)}</TableCell>
                      <TableCell className="text-xs">
                        {fmt(r.total_after)} / {fmt(r.cap_amount)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            r.status === "released"
                              ? "default"
                              : r.status === "partial_capped"
                                ? "secondary"
                                : "destructive"
                          }
                        >
                          {r.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </CardContent>
      </Card>



      <Card>
        <CardHeader>
          <CardTitle>計算試算（不會寫入）</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <div className="space-y-1">
            <Label>會員 ID</Label>
            <Input value={memberId} onChange={(e) => setMemberId(e.target.value)} placeholder="uuid" />
          </div>
          <div className="space-y-1">
            <Label>當時階級</Label>
            <Input value={tierCode} onChange={(e) => setTierCode(e.target.value.toUpperCase())} />
          </div>
          <div className="space-y-1">
            <Label>本次應發金額</Label>
            <Input
              type="number"
              value={bonusAmount}
              onChange={(e) => setBonusAmount(Number(e.target.value))}
            />
          </div>
          <div className="flex items-end">
            <Button onClick={runPreview} disabled={!memberId}>
              試算
            </Button>
          </div>
          {preview1 && (
            <div className="md:col-span-4 grid grid-cols-2 md:grid-cols-7 gap-2 text-sm">
              <Field label="原應發" value={fmt(preview1.bonus_amount)} />
              <Field label="實發" value={fmt(preview1.payable_amount)} />
              <Field label="截斷" value={fmt(preview1.capped_amount)} />
              <Field label="發前累計" value={fmt(preview1.total_before)} />
              <Field label="發後累計" value={fmt(preview1.total_after)} />
              <Field label="上限" value={fmt(preview1.cap_amount)} />
              <Field label="狀態" value={preview1.status} />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>會員累計 / 上限 / 剩餘可領</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground">載入中…</p>
          ) : summary.length === 0 ? (
            <p className="text-muted-foreground">尚無紀錄</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>會員</TableHead>
                  <TableHead>階級</TableHead>
                  <TableHead>已領累計</TableHead>
                  <TableHead>上限</TableHead>
                  <TableHead>剩餘可領</TableHead>
                  <TableHead>狀態</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.map((m) => (
                  <TableRow key={m.memberId}>
                    <TableCell>
                      <div className="font-medium">{m.name ?? m.memberNo ?? m.memberId.slice(0, 8)}</div>
                      <div className="text-xs text-muted-foreground">{m.memberNo}</div>
                    </TableCell>
                    <TableCell>{m.tierCode || "—"}</TableCell>
                    <TableCell>{fmt(m.total)}</TableCell>
                    <TableCell>{fmt(m.cap)}</TableCell>
                    <TableCell>{fmt(m.remaining)}</TableCell>
                    <TableCell>
                      {m.reachedCap ? (
                        <Badge variant="destructive">已達上限</Badge>
                      ) : (
                        <Badge variant="secondary">可領</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>營業分紅發放紀錄 ledger</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground">載入中…</p>
          ) : ledger.length === 0 ? (
            <p className="text-muted-foreground">尚無紀錄</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>時間</TableHead>
                  <TableHead>會員</TableHead>
                  <TableHead>階級</TableHead>
                  <TableHead>原應發</TableHead>
                  <TableHead>實發</TableHead>
                  <TableHead>截斷</TableHead>
                  <TableHead>發前/發後</TableHead>
                  <TableHead>上限</TableHead>
                  <TableHead>狀態</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ledger.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs">{new Date(r.created_at).toLocaleString()}</TableCell>
                    <TableCell className="text-xs">{r.member_id?.slice(0, 8)}</TableCell>
                    <TableCell>{r.tier_code}</TableCell>
                    <TableCell>{fmt(r.bonus_amount)}</TableCell>
                    <TableCell>{fmt(r.payable_amount)}</TableCell>
                    <TableCell>{fmt(r.capped_amount)}</TableCell>
                    <TableCell className="text-xs">
                      {fmt(r.total_before)} → {fmt(r.total_after)}
                    </TableCell>
                    <TableCell>{fmt(r.cap_amount)}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          r.status === "released"
                            ? "default"
                            : r.status === "partial_capped"
                              ? "secondary"
                              : "destructive"
                        }
                      >
                        {r.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border p-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}
