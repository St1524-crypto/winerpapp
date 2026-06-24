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

export const Route = createFileRoute("/_authenticated/admin/vip-upgrade-bonus-cap")({
  component: Page,
  head: () => ({ meta: [{ title: "VIP 升級分紅上限 — winerp" }] }),
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

  const [summary, setSummary] = useState<any[]>([]);
  const [ledger, setLedger] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [memberId, setMemberId] = useState("");
  const [tierCode, setTierCode] = useState("E");
  const [bonusAmount, setBonusAmount] = useState(5000);
  const [preview1, setPreview1] = useState<any>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [s, l] = await Promise.all([listSummary(), listLedger({ data: {} })]);
        setSummary(s as any[]);
        setLedger(l as any[]);
      } catch (e: any) {
        toast.error(e.message ?? "載入失敗");
      } finally {
        setLoading(false);
      }
    })();
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

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">VIP 升級分紅上限管理</h1>
        <Badge variant="secondary">第一階段：計算 / 查詢（未接核心發放）</Badge>
      </div>

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
          <CardTitle>升級分紅發放紀錄 ledger</CardTitle>
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
