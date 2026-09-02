import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Loader2, PlayCircle, RefreshCw, Wallet } from "lucide-react";
import { toast } from "sonner";
import { useAuth, type AppRole } from "@/hooks/use-auth";
import { ForbiddenScreen } from "@/components/ForbiddenScreen";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  getBonusPayoutOverview,
  releaseAllWaitingRewards,
  releaseDueRewards,
  runDailySettlement,
  runMonthlySettlement,
  updateBonusSettings,
} from "@/lib/bonus.functions";

const ALLOWED: AppRole[] = ["super_admin", "admin", "finance"];

export const Route = createFileRoute("/_authenticated/admin/bonuses/payout")({
  head: () => ({
    meta: [
      { title: "獎金發放中心｜日結月結 80/20 拆分" },
      { name: "description", content: "後台一鍵執行日結與月結，並將獎金以 80% 現金錢包、20% 貢獻點拆分發放。" },
      { property: "og:title", content: "獎金發放中心｜日結月結 80/20 拆分" },
      { property: "og:description", content: "後台一鍵執行日結與月結，並將獎金以 80% 現金錢包、20% 貢獻點拆分發放。" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Guard,
});

function Guard() {
  const { roles, loading } = useAuth();
  if (loading)
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  if (!roles.some((r) => ALLOWED.includes(r)))
    return <ForbiddenScreen requiredRoles={ALLOWED} pageName="獎金發放中心" />;
  return <Page />;
}

const fmt = (n: any) => Number(n ?? 0).toLocaleString();

function prevMonthYm() {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Taipei" }));
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function Page() {
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [ym, setYm] = useState(prevMonthYm());
  const [lastResult, setLastResult] = useState<{ label: string; payload: any } | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await getBonusPayoutOverview());
    } catch (e: any) {
      toast.error(e.message ?? "讀取失敗");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const run = async (label: string, fn: () => Promise<any>, confirmText?: string) => {
    if (confirmText && !confirm(confirmText)) return;
    setBusy(true);
    try {
      const res = await fn();
      setLastResult({ label, payload: res });
      toast.success(`${label} 完成`);
      await load();
    } catch (e: any) {
      toast.error(`${label} 失敗：${e.message ?? e}`);
    } finally {
      setBusy(false);
    }
  };

  const saveSetting = async (patch: Record<string, any>, label: string) => {
    setBusy(true);
    try {
      await updateBonusSettings({ data: patch });
      toast.success(`${label} 已更新`);
      await load();
    } catch (e: any) {
      toast.error(e.message ?? "更新失敗");
    } finally {
      setBusy(false);
    }
  };

  if (!data)
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );

  const s = data.settings;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/admin/bonuses" className="mb-1 inline-flex items-center gap-1 text-sm text-muted-foreground">
            <ArrowLeft className="h-4 w-4" /> 返回獎金營運中心
          </Link>
          <h1 className="text-2xl font-bold">獎金發放中心</h1>
          <p className="text-sm text-muted-foreground">
            日結／月結自動或手動執行，發放時自動拆分 80% 現金錢包、20% 貢獻點並寫入資料庫。
          </p>
        </div>
        <Button variant="outline" onClick={load} disabled={busy}>
          <RefreshCw className="mr-2 h-4 w-4" /> 重新整理
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>待發放（全部）</CardDescription>
            <CardTitle className="text-2xl">{fmt(data.waiting.points)} 點</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {fmt(data.waiting.count)} 筆　→ 現金 {fmt(data.waiting.cash)}／貢獻點 {fmt(data.waiting.point)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>今日到期可發放</CardDescription>
            <CardTitle className="text-2xl">{fmt(data.due.total)} 點</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {fmt(data.due.count)} 筆　→ 現金 {fmt(data.due.cash)}／貢獻點 {fmt(data.due.point)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>拆分比例</CardDescription>
            <CardTitle className="text-2xl">80% / 20%</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            現金錢包 cash_balance／貢獻點 reward_points，同步寫入交易紀錄
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>自動排程設定</CardTitle>
          <CardDescription>關閉自動時，可於下方以手動一鍵執行。</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="flex items-center justify-between rounded-md border p-3">
            <Label>日結自動執行</Label>
            <Switch
              checked={!!s.daily_bonus_auto_enabled}
              disabled={busy}
              onCheckedChange={(v) => saveSetting({ daily_bonus_auto_enabled: v }, "日結自動")}
            />
          </div>
          <div className="space-y-1">
            <Label>月結模式</Label>
            <Select
              value={s.monthly_bonus_mode}
              onValueChange={(v) => saveSetting({ monthly_bonus_mode: v }, "月結模式")}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">自動</SelectItem>
                <SelectItem value="manual">手動</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>發放模式</Label>
            <Select
              value={s.reward_release_mode}
              onValueChange={(v) => saveSetting({ reward_release_mode: v }, "發放模式")}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">自動（到期自動發放）</SelectItem>
                <SelectItem value="manual">手動</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>發放等待天數</Label>
            <Input
              type="number"
              min={0}
              defaultValue={s.reward_release_days}
              disabled={busy}
              onBlur={(e) => {
                const v = Number(e.target.value);
                if (v >= 0 && v !== s.reward_release_days) saveSetting({ reward_release_days: v }, "發放等待天數");
              }}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>一鍵執行</CardTitle>
          <CardDescription>結算只產生獎金紀錄；發放才會寫入錢包並拆分 80/20。</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button
            disabled={busy}
            onClick={() => run("日結算", () => runDailySettlement(), "確定執行日結算？")}
          >
            <PlayCircle className="mr-2 h-4 w-4" /> 執行日結算
          </Button>
          <div className="flex items-center gap-2">
            <Input className="w-32" value={ym} onChange={(e) => setYm(e.target.value)} placeholder="YYYYMM" />
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => run(`月結算 ${ym}`, () => runMonthlySettlement({ data: { yyyymm: ym } }), `確定執行 ${ym} 月結算？`)}
            >
              <PlayCircle className="mr-2 h-4 w-4" /> 執行月結算
            </Button>
          </div>
          <Button
            variant="default"
            disabled={busy || data.due.count === 0}
            onClick={() =>
              run(
                "到期發放",
                () => releaseDueRewards(),
                `確定發放今日到期 ${fmt(data.due.count)} 筆（現金 ${fmt(data.due.cash)}／貢獻點 ${fmt(data.due.point)}）？`,
              )
            }
          >
            <Wallet className="mr-2 h-4 w-4" /> 到期發放
          </Button>
          <Button
            variant="outline"
            disabled={busy || data.waiting.count === 0}
            onClick={() =>
              run(
                "手動全部發放",
                () => releaseAllWaitingRewards({ data: { limit: 500 } }),
                `將忽略到期日，立即發放待發放紀錄（最多 500 筆）。\n預估現金 ${fmt(data.waiting.cash)}／貢獻點 ${fmt(data.waiting.point)}。\n確定執行？`,
              )
            }
          >
            <Wallet className="mr-2 h-4 w-4" /> 手動立即發放全部
          </Button>
          {busy && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
        </CardContent>
      </Card>

      {lastResult && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">最近執行結果：{lastResult.label}</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="overflow-x-auto rounded bg-muted p-3 text-xs">
              {JSON.stringify(lastResult.payload, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>最近發放紀錄（80/20 拆分）</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>會員</TableHead>
                <TableHead>類型</TableHead>
                <TableHead className="text-right">獎金</TableHead>
                <TableHead className="text-right">現金錢包 80%</TableHead>
                <TableHead className="text-right">貢獻點 20%</TableHead>
                <TableHead>結算日</TableHead>
                <TableHead>發放時間</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.recent.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    尚無發放紀錄
                  </TableCell>
                </TableRow>
              )}
              {data.recent.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs">
                    {r.name ?? "—"} <Badge variant="outline">{r.memberNo ?? "—"}</Badge>
                  </TableCell>
                  <TableCell className="text-xs">{r.bonusType}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(r.points)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(r.cash)}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmt(r.point)}</TableCell>
                  <TableCell className="text-xs">{r.settlementDate ?? "—"}</TableCell>
                  <TableCell className="text-xs">
                    {r.releasedAt ? new Date(r.releasedAt).toLocaleString() : "—"}
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
