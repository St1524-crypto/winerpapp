import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Plus, RefreshCw, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  listBonusPoolMembers,
  searchMembersForPool,
  upsertBonusPoolMember,
  removeBonusPoolMember,
  bulkUpdatePoolPeriod,
} from "@/lib/bonus-pool-members.functions";

export const Route = createFileRoute("/_authenticated/admin/bonuses/pool-members")({
  head: () => ({
    meta: [
      { title: "分紅名單管理｜POOL_VSTEA 名單與期間" },
      { name: "description", content: "超級管理員可編輯消費分紅（POOL_VSTEA）與營業分紅的合格名單與授權期間。" },
      { property: "og:title", content: "分紅名單管理｜POOL_VSTEA 名單與期間" },
      { property: "og:description", content: "編輯分紅池合格名單、授權起迄日，並與制度升級條件頁同步對照。" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PoolMembersPage,
});

const todayStr = () => new Date().toISOString().slice(0, 10);
const fmt = (n: number | null | undefined) => Number(n ?? 0).toLocaleString("zh-TW", { maximumFractionDigits: 2 });
/** 發放拆分：現金錢包 80%、貢獻點 20% */
const CASH_RATE = 0.8;
const round2 = (n: number) => Math.round(n * 100) / 100;
function splitPoints(points: number) {
  const total = round2(Math.max(0, points));
  const cash = round2(total * CASH_RATE);
  return { total, cash, point: round2(total - cash) };
}
function plusMonths(d: string, m: number) {
  const base = new Date(d);
  base.setMonth(base.getMonth() + m);
  return base.toISOString().slice(0, 10);
}

function PoolMembersPage() {
  const loadFn = useServerFn(listBonusPoolMembers);
  const searchFn = useServerFn(searchMembersForPool);
  const upsertFn = useServerFn(upsertBonusPoolMember);
  const removeFn = useServerFn(removeBonusPoolMember);
  const bulkFn = useServerFn(bulkUpdatePoolPeriod);

  const [poolKind, setPoolKind] = useState<"consumption" | "business">("consumption");
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [pick, setPick] = useState<any>(null);
  const [starts, setStarts] = useState(todayStr());
  const [ends, setEnds] = useState(plusMonths(todayStr(), 3));
  const [reason, setReason] = useState("");
  const [bulkStart, setBulkStart] = useState(todayStr());
  const [bulkEnd, setBulkEnd] = useState(plusMonths(todayStr(), 3));
  const [poolPoints, setPoolPoints] = useState("");

  const load = useCallback(async () => {
    try {
      setData(await loadFn({ data: { poolKind } }));
    } catch (e: any) {
      toast.error(e.message ?? "讀取失敗");
    }
  }, [loadFn, poolKind]);

  useEffect(() => {
    load();
  }, [load]);

  const search = async () => {
    if (!q.trim()) return;
    setBusy(true);
    try {
      setResults((await searchFn({ data: { q: q.trim() } })) as any[]);
    } catch (e: any) {
      toast.error(e.message ?? "搜尋失敗");
    } finally {
      setBusy(false);
    }
  };

  const addMember = async () => {
    if (!pick) return toast.error("請先選擇會員");
    setBusy(true);
    try {
      await upsertFn({
        data: { poolKind, userId: pick.id, startsOn: starts, endsOn: ends, exclusive: true, reason },
      });
      toast.success("已加入名單");
      setPick(null);
      setResults([]);
      setQ("");
      await load();
    } catch (e: any) {
      toast.error(e.message ?? "新增失敗");
    } finally {
      setBusy(false);
    }
  };

  const saveRow = async (row: any) => {
    setBusy(true);
    try {
      await upsertFn({
        data: {
          poolKind,
          userId: row.user_id,
          startsOn: row.starts_on,
          endsOn: row.ends_on,
          exclusive: !!row.exclusive,
          reason: row.reason ?? "",
        },
      });
      toast.success("期間已更新");
      await load();
    } catch (e: any) {
      toast.error(e.message ?? "更新失敗");
    } finally {
      setBusy(false);
    }
  };

  const removeRow = async (row: any) => {
    if (!confirm(`確定將 ${row.name ?? row.memberNo ?? "此會員"} 移出名單？`)) return;
    setBusy(true);
    try {
      await removeFn({ data: { id: row.id } });
      toast.success("已移除");
      await load();
    } catch (e: any) {
      toast.error(e.message ?? "移除失敗");
    } finally {
      setBusy(false);
    }
  };

  const bulkUpdate = async () => {
    if (!confirm(`將整份名單（${data?.rows?.length ?? 0} 筆）期間改為 ${bulkStart} ~ ${bulkEnd}？`)) return;
    setBusy(true);
    try {
      const res: any = await bulkFn({ data: { poolKind, startsOn: bulkStart, endsOn: bulkEnd, confirmed: true } });
      toast.success(`已更新 ${res.updated} 筆`);
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

  const canEdit = !!data.canEdit;

  // 均分試算：有效且未達上限者平均分配，再依 80% 現金 / 20% 貢獻點拆分
  const payableRows = (data.rows as any[]).filter((r) => r.active && !r.capReached);
  const totalPoints = Number(poolPoints) > 0 ? Number(poolPoints) : 0;
  const perPerson = payableRows.length > 0 ? round2(totalPoints / payableRows.length) : 0;
  const shareOf = (row: any) => {
    if (!row.active || row.capReached || perPerson <= 0) return splitPoints(0);
    const limited = row.cap > 0 && row.remaining != null ? Math.min(perPerson, Number(row.remaining)) : perPerson;
    return splitPoints(limited);
  };
  const shareTotals = (data.rows as any[]).reduce(
    (acc, r) => {
      const s = shareOf(r);
      return { total: acc.total + s.total, cash: acc.cash + s.cash, point: acc.point + s.point };
    },
    { total: 0, cash: 0, point: 0 },
  );

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link to="/admin/vip-upgrade-rules" className="mb-1 inline-flex items-center gap-1 text-sm text-muted-foreground">
            <ArrowLeft className="h-4 w-4" /> 前往制度升級條件
          </Link>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Users className="h-6 w-6" /> 分紅名單管理
          </h1>
          <p className="text-sm text-muted-foreground">
            管理 POOL_VSTEA（消費分紅）與營業分紅的合格名單與授權期間；名單到期後恢復制度一般條件。
          </p>
        </div>
        <Button variant="outline" onClick={load} disabled={busy}>
          <RefreshCw className="mr-2 h-4 w-4" /> 重新整理
        </Button>
      </div>

      <Tabs value={poolKind} onValueChange={(v) => setPoolKind(v as any)}>
        <TabsList>
          <TabsTrigger value="consumption">消費分紅（POOL_VSTEA）</TabsTrigger>
          <TabsTrigger value="business">營業分紅</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>分紅池</CardDescription>
            <CardTitle className="text-xl">{data.pool?.name ?? "（未設定池）"}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            {data.pool ? (
              <>
                代碼 {data.pool.code}／狀態 {data.pool.status}／費率{" "}
                {(Number(data.pool.bonus_rate ?? 0) * 100).toFixed(2)}%
                <div>適用階級：{(data.pool.tier_codes ?? []).join("、") || "—"}</div>
              </>
            ) : (
              "此分紅類別未對應 vip_bonus_pools 設定"
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>名單人數（有效／全部）</CardDescription>
            <CardTitle className="text-2xl">
              {data.activeCount} / {data.rows.length}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            今日：{data.today}
            <div>
              領獎上限合計：{fmt(data.capTotal)}／目前總收入合計：{fmt(data.earningsTotal)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>批次調整名單期間</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex gap-2">
              <Input type="date" value={bulkStart} onChange={(e) => setBulkStart(e.target.value)} />
              <Input type="date" value={bulkEnd} onChange={(e) => setBulkEnd(e.target.value)} />
            </div>
            <Button size="sm" variant="secondary" disabled={!canEdit || busy} onClick={bulkUpdate}>
              套用至整份名單
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">分紅均分試算（現金 80%／貢獻點 20%）</CardTitle>
          <CardDescription>
            輸入本期分紅總點數，系統依「有效且未達上限」人數平均分配，再拆分 80% 現金錢包、20% 貢獻點。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label>本期分紅總點數</Label>
              <Input
                className="w-48"
                type="number"
                min={0}
                step="0.01"
                value={poolPoints}
                onChange={(e) => setPoolPoints(e.target.value)}
                placeholder="例：1000"
              />
            </div>
            <div className="text-sm text-muted-foreground">
              可分配人數 <span className="font-semibold text-foreground">{payableRows.length}</span> 人（有效
              {data.activeCount} 人，扣除已達上限）
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">每人均分點數</div>
              <div className="text-2xl font-bold tabular-nums">{fmt(perPerson)}</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">每人現金錢包 80%</div>
              <div className="text-2xl font-bold tabular-nums">NT$ {fmt(splitPoints(perPerson).cash)}</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">每人貢獻點 20%</div>
              <div className="text-2xl font-bold tabular-nums">{fmt(splitPoints(perPerson).point)}</div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            實際發放合計：{fmt(shareTotals.total)} 點＝現金 {fmt(shareTotals.cash)}＋貢獻點 {fmt(shareTotals.point)}
            （超過剩餘額度者以剩餘額度為上限）。
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">加入名單</CardTitle>
          <CardDescription>搜尋姓名／會員編號／電話後選擇會員，設定授權期間。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Input
              className="w-64"
              placeholder="搜尋會員"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search()}
            />
            <Button variant="outline" onClick={search} disabled={busy}>
              搜尋
            </Button>
            {results.length > 0 && (
              <Select value={pick?.id ?? ""} onValueChange={(v) => setPick(results.find((r) => r.id === v))}>
                <SelectTrigger className="w-72">
                  <SelectValue placeholder="選擇會員" />
                </SelectTrigger>
                <SelectContent>
                  {results.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name ?? "—"}（{r.member_no ?? "無編號"}）
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label>起日</Label>
              <Input type="date" value={starts} onChange={(e) => setStarts(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>迄日</Label>
              <Input type="date" value={ends} onChange={(e) => setEnds(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>備註</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="授權原因" />
            </div>
            <Button onClick={addMember} disabled={!canEdit || busy || !pick}>
              <Plus className="mr-2 h-4 w-4" /> 加入名單
            </Button>
          </div>
          {!canEdit && <p className="text-sm text-muted-foreground">僅超級管理員可編輯名單，目前為唯讀檢視。</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">名單明細</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>會員</TableHead>
                <TableHead>階級</TableHead>
                <TableHead className="text-right">領獎上限</TableHead>
                <TableHead className="text-right">目前總收入</TableHead>
                <TableHead className="text-right">剩餘額度</TableHead>
                <TableHead className="text-right">本期應發</TableHead>
                <TableHead className="text-right">現金 80%</TableHead>
                <TableHead className="text-right">貢獻點 20%</TableHead>
                <TableHead>起日</TableHead>
                <TableHead>迄日</TableHead>
                <TableHead>狀態</TableHead>
                <TableHead>備註</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={13} className="text-center text-muted-foreground">
                    尚無名單
                  </TableCell>
                </TableRow>
              )}
              {data.rows.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs">
                    {r.name ?? "—"} <Badge variant="outline">{r.memberNo ?? "—"}</Badge>
                  </TableCell>
                  <TableCell className="text-xs">{r.tierCode ?? "—"}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums">
                    {r.cap > 0 ? fmt(r.cap) : "無上限／未設定"}
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums">{fmt(r.totalEarnings)}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums">
                    {r.cap > 0 ? (
                      <Badge variant={r.capReached ? "destructive" : "outline"}>
                        {r.capReached ? "已達上限" : fmt(r.remaining)}
                      </Badge>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-right text-xs font-semibold tabular-nums">
                    {fmt(shareOf(r).total)}
                  </TableCell>
                  <TableCell className="text-right text-xs tabular-nums">NT$ {fmt(shareOf(r).cash)}</TableCell>
                  <TableCell className="text-right text-xs tabular-nums">{fmt(shareOf(r).point)}</TableCell>
                  <TableCell>
                    <Input
                      type="date"
                      className="w-36"
                      defaultValue={r.starts_on}
                      disabled={!canEdit}
                      onBlur={(e) => e.target.value !== r.starts_on && saveRow({ ...r, starts_on: e.target.value })}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      type="date"
                      className="w-36"
                      defaultValue={r.ends_on}
                      disabled={!canEdit}
                      onBlur={(e) => e.target.value !== r.ends_on && saveRow({ ...r, ends_on: e.target.value })}
                    />
                  </TableCell>
                  <TableCell>
                    <Badge variant={r.active ? "default" : "outline"}>{r.active ? "有效" : "已到期"}</Badge>
                  </TableCell>
                  <TableCell className="max-w-[220px] truncate text-xs">{r.reason ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" disabled={!canEdit || busy} onClick={() => removeRow(r)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
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
