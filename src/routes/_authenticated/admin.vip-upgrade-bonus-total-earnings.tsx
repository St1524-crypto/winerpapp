import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  adminListTiersTotalEarningsCap,
  adminListTotalEarningsLedger,
  getUpgradeBonusTotalEarningsTypes,
  previewUpgradeBonusTotalEarningsRelease,
  updateTierTotalEarningsCap,
  updateUpgradeBonusTotalEarningsTypes,
} from "@/lib/vip-upgrade-bonus-total-earnings.functions";

export const Route = createFileRoute("/_authenticated/admin/vip-upgrade-bonus-total-earnings")({
  component: Page,
  head: () => ({ meta: [{ title: "升級分紅總收益上限 — winerp" }] }),
  errorComponent: ({ error, reset }) => {
    const router = useRouter();
    return (
      <div className="p-6">
        <p className="text-destructive">載入失敗：{error.message}</p>
        <Button className="mt-2" onClick={() => { reset(); router.invalidate(); }}>重試</Button>
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
  const listTiers = useServerFn(adminListTiersTotalEarningsCap);
  const updateTier = useServerFn(updateTierTotalEarningsCap);
  const getTypes = useServerFn(getUpgradeBonusTotalEarningsTypes);
  const updateTypes = useServerFn(updateUpgradeBonusTotalEarningsTypes);
  const listLedger = useServerFn(adminListTotalEarningsLedger);
  const preview = useServerFn(previewUpgradeBonusTotalEarningsRelease);

  const [tiers, setTiers] = useState<any[]>([]);
  const [types, setTypes] = useState<string>("");
  const [ledger, setLedger] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [memberId, setMemberId] = useState("");
  const [tierCode, setTierCode] = useState("E");
  const [bonusAmount, setBonusAmount] = useState(5000);
  const [previewResult, setPreviewResult] = useState<any>(null);

  async function load() {
    setLoading(true);
    try {
      const [t, ty, l] = await Promise.all([listTiers(), getTypes(), listLedger({ data: {} })]);
      setTiers(t as any[]);
      setTypes(((ty as string[]) ?? []).join(","));
      setLedger(l as any[]);
    } catch (e: any) {
      toast.error(e.message ?? "載入失敗");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function saveTier(t: any) {
    try {
      await updateTier({
        data: {
          tierId: t.id,
          capAmount: Number(t.upgrade_total_earnings_cap_amount ?? 0),
          capBasis: (t.upgrade_bonus_cap_basis as any) ?? "total_earnings",
        },
      });
      toast.success(`已更新 ${t.code}`);
    } catch (e: any) { toast.error(e.message ?? "更新失敗"); }
  }

  async function saveTypes() {
    try {
      const arr = types.split(",").map((s) => s.trim()).filter(Boolean);
      await updateTypes({ data: { types: arr } });
      toast.success("已更新總收益納入類型");
    } catch (e: any) { toast.error(e.message ?? "更新失敗"); }
  }

  async function runPreview() {
    try {
      const r = await preview({ data: { memberId, tierCode, bonusAmount: Number(bonusAmount) } });
      setPreviewResult(r);
    } catch (e: any) { toast.error(e.message ?? "計算失敗"); }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">升級分紅總收益上限管理</h1>
        <Badge variant="secondary">第一階段：設定 / 試算（未接核心發放）</Badge>
      </div>

      <Card>
        <CardHeader><CardTitle>各 VIP 階級 — 升級分紅總收益上限</CardTitle></CardHeader>
        <CardContent>
          {loading ? <p className="text-muted-foreground">載入中…</p> : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>階級</TableHead>
                  <TableHead>名稱</TableHead>
                  <TableHead>判斷依據</TableHead>
                  <TableHead>總收益上限</TableHead>
                  <TableHead>升級分紅累計上限（參考）</TableHead>
                  <TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tiers.map((t, i) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.code}</TableCell>
                    <TableCell>{t.name}</TableCell>
                    <TableCell>
                      <select
                        className="border rounded px-2 py-1 bg-background"
                        value={t.upgrade_bonus_cap_basis ?? "total_earnings"}
                        onChange={(e) => {
                          const next = [...tiers]; next[i] = { ...t, upgrade_bonus_cap_basis: e.target.value }; setTiers(next);
                        }}
                      >
                        <option value="total_earnings">total_earnings</option>
                        <option value="upgrade_only">upgrade_only</option>
                      </select>
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        className="w-32"
                        value={t.upgrade_total_earnings_cap_amount ?? 0}
                        onChange={(e) => {
                          const next = [...tiers]; next[i] = { ...t, upgrade_total_earnings_cap_amount: e.target.value }; setTiers(next);
                        }}
                      />
                    </TableCell>
                    <TableCell className="text-muted-foreground">{fmt(t.upgrade_bonus_cap_amount)}</TableCell>
                    <TableCell><Button size="sm" onClick={() => saveTier(t)}>儲存</Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>納入「總收益」的 bonus 類型（以逗號分隔）</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Textarea rows={2} value={types} onChange={(e) => setTypes(e.target.value)} />
          <p className="text-xs text-muted-foreground">
            例：daily_bonus,monthly_bonus,referral_bonus,repurchase_bonus,upgrade_bonus,business_bonus
          </p>
          <Button onClick={saveTypes}>儲存類型清單</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>試算（不會寫入）</CardTitle></CardHeader>
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
            <Input type="number" value={bonusAmount} onChange={(e) => setBonusAmount(Number(e.target.value))} />
          </div>
          <div className="flex items-end">
            <Button onClick={runPreview} disabled={!memberId}>試算</Button>
          </div>
          {previewResult && (
            <div className="md:col-span-4 grid grid-cols-2 md:grid-cols-7 gap-2 text-sm">
              <Field label="原應發" value={fmt(previewResult.original_bonus_amount)} />
              <Field label="實發" value={fmt(previewResult.payable_amount)} />
              <Field label="截斷" value={fmt(previewResult.capped_amount)} />
              <Field label="總收益(前)" value={fmt(previewResult.member_total_earnings_before)} />
              <Field label="總收益(後)" value={fmt(previewResult.member_total_earnings_after)} />
              <Field label="上限" value={fmt(previewResult.cap_amount)} />
              <Field label="狀態" value={previewResult.status} />
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>發放紀錄 ledger</CardTitle></CardHeader>
        <CardContent>
          {ledger.length === 0 ? (
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
                  <TableHead>總收益 前/後</TableHead>
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
                    <TableCell>{fmt(r.original_bonus_amount)}</TableCell>
                    <TableCell>{fmt(r.payable_amount)}</TableCell>
                    <TableCell>{fmt(r.capped_amount)}</TableCell>
                    <TableCell className="text-xs">{fmt(r.member_total_earnings_before)} → {fmt(r.member_total_earnings_after)}</TableCell>
                    <TableCell>{fmt(r.cap_amount)}</TableCell>
                    <TableCell>
                      <Badge variant={r.status === "released" ? "default" : r.status === "partial_capped" ? "secondary" : "destructive"}>
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
