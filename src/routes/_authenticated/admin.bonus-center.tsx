import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth, type AppRole } from "@/hooks/use-auth";
import { ForbiddenScreen } from "@/components/ForbiddenScreen";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Coins, Play, Send, Settings as SettingsIcon, History } from "lucide-react";
import { toast } from "sonner";
import {
  getBonusSettings, updateBonusSettings,
  upsertRepurchaseRate, upsertRankRebate, deleteRankRebate,
  upsertMonthlyTier, deleteMonthlyTier,
  runDailySettlement, runMonthlySettlement,
  releaseDueRewards, manualReleaseRewards,
  listSettlementBatches, listBonusRecords,
} from "@/lib/bonus.functions";


const ALLOW: AppRole[] = ["super_admin", "admin", "finance"];

export const Route = createFileRoute("/_authenticated/admin/bonus-center")({
  component: Guard,
});

function Guard() {
  const { roles, loading } = useAuth();
  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }
  if (!roles.some((r) => ALLOW.includes(r))) {
    return <ForbiddenScreen requiredRoles={ALLOW} pageName="獎金管理中心" />;
  }
  return <Page />;
}

const TYPE_LABEL: Record<string, string> = {
  referral: "推薦獎勵",
  repurchase: "復購獎勵",
  monthly_vip: "月獎金",
  rank_rebate: "位階回饋",
};
const STATUS_LABEL: Record<string, string> = {
  pending: "待結算", settled: "已結算", waiting_release: "等待發放",
  released: "已發放", cancelled: "已取消", failed: "發放失敗",
};

function Page() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [batches, setBatches] = useState<any[]>([]);
  const [records, setRecords] = useState<any>({ records: [], members: {} });
  const [filter, setFilter] = useState({ status: "", bonusType: "" });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  async function loadAll() {
    setLoading(true);
    try {
      const [s, b, r] = await Promise.all([
        getBonusSettings(),
        listSettlementBatches(),
        listBonusRecords({ data: { limit: 200 } }),
      ]);
      setData(s); setBatches(b); setRecords(r);
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { loadAll(); }, []);

  async function loadRecords() {
    const r = await listBonusRecords({ data: { ...filter, limit: 200 } as any });
    setRecords(r); setSelected(new Set());
  }

  async function save(patch: any) {
    setBusy(true);
    try {
      await updateBonusSettings({ data: patch });
      toast.success("已儲存");
      loadAll();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  async function action(fn: () => Promise<any>, label: string) {
    setBusy(true);
    try { const r = await fn(); toast.success(`${label}：${JSON.stringify(r)}`); loadAll(); }
    catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  }

  if (loading || !data) {
    return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const s = data.settings;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Coins className="h-6 w-6 text-primary" />獎金管理中心
        </h1>
        <p className="text-sm text-muted-foreground mt-1">日獎金 / 月獎金 / 復購 / 位階回饋 / 發放管控</p>
      </div>

      <Tabs defaultValue="settings">
        <TabsList>
          <TabsTrigger value="settings"><SettingsIcon className="h-4 w-4 mr-1" />設定</TabsTrigger>
          <TabsTrigger value="actions"><Play className="h-4 w-4 mr-1" />結算 / 發放</TabsTrigger>
          <TabsTrigger value="records"><Coins className="h-4 w-4 mr-1" />獎金明細</TabsTrigger>
          <TabsTrigger value="batches"><History className="h-4 w-4 mr-1" />結算紀錄</TabsTrigger>
        </TabsList>

        {/* 設定 */}
        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">日獎金</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3">
                <Switch checked={s.daily_bonus_auto_enabled}
                  onCheckedChange={(v) => save({ daily_bonus_auto_enabled: v })} />
                <span>自動結算</span>
              </div>
              <div className="grid grid-cols-2 gap-3 max-w-md">
                <div>
                  <Label>結算週期（天）</Label>
                  <Input type="number" min={1} defaultValue={s.daily_bonus_cycle_days}
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (v > 0 && v !== s.daily_bonus_cycle_days) save({ daily_bonus_cycle_days: v });
                    }} />
                </div>
                <div>
                  <Label>下次結算時間</Label>
                  <Input value={new Date(s.daily_next_settlement_at).toLocaleString()} readOnly />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">月獎金</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3 max-w-md">
                <div>
                  <Label>結算模式</Label>
                  <Select value={s.monthly_bonus_mode}
                    onValueChange={(v) => save({ monthly_bonus_mode: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">自動</SelectItem>
                      <SelectItem value="manual">手動</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>每月結算日（1–28）</Label>
                  <Input type="number" min={1} max={28} defaultValue={s.monthly_bonus_settlement_day}
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (v >= 1 && v <= 28 && v !== s.monthly_bonus_settlement_day)
                        save({ monthly_bonus_settlement_day: v });
                    }} />
                </div>
                <div>
                  <Label>VIP 責任額預設</Label>
                  <Input type="number" min={0} defaultValue={s.vip_required_points}
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (v >= 0 && v !== s.vip_required_points) save({ vip_required_points: v });
                    }} />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">月達成獎金階梯</CardTitle>
              <p className="text-xs text-muted-foreground mt-1">
                以「當月自我消費 + 第一代消費」總額為基數，達到門檻即加發對應比例的獎勵點（取符合條件的最高階）。
              </p>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow>
                  <TableHead>門檻（點/元）</TableHead>
                  <TableHead>加發比例 %</TableHead>
                  <TableHead>排序</TableHead>
                  <TableHead>啟用</TableHead>
                  <TableHead></TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {(data.monthlyTiers ?? []).map((r: any) => (
                    <MonthlyTierRow key={r.id} row={r} onSaved={loadAll} />
                  ))}
                  <MonthlyTierRow row={{ threshold_points: 0, bonus_rate: 0, sort_order: (data.monthlyTiers?.length ?? 0) + 1, enabled: true }} isNew onSaved={loadAll} />
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>

            <CardHeader><CardTitle className="text-base">獎勵點發放</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3 max-w-md">
                <div>
                  <Label>結算後等待天數</Label>
                  <Input type="number" min={0} defaultValue={s.reward_release_days}
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (v >= 0 && v !== s.reward_release_days) save({ reward_release_days: v });
                    }} />
                </div>
                <div>
                  <Label>發放模式</Label>
                  <Select value={s.reward_release_mode}
                    onValueChange={(v) => save({ reward_release_mode: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">自動發放</SelectItem>
                      <SelectItem value="manual">手動發放</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">復購獎勵比例（每代）</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow><TableHead>代數</TableHead><TableHead>比例 %</TableHead><TableHead>啟用</TableHead><TableHead></TableHead></TableRow></TableHeader>
                <TableBody>
                  {data.repurchase.map((r: any) => (
                    <RepurchaseRow key={r.id} row={r} onSaved={loadAll} />
                  ))}
                  <RepurchaseRow row={{ generation_level: (data.repurchase.length || 0) + 1, bonus_rate: 0, enabled: true }} isNew onSaved={loadAll} />
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">位階回饋設定</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader><TableRow>
                  <TableHead>代碼</TableHead><TableHead>名稱</TableHead>
                  <TableHead>責任額</TableHead><TableHead>超額回饋 %</TableHead>
                  <TableHead>排序</TableHead><TableHead>啟用</TableHead><TableHead></TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {data.rebate.map((r: any) => (
                    <RebateRow key={r.id} row={r} onSaved={loadAll} />
                  ))}
                  <RebateRow row={{ rank_code: "", rank_name: "", required_points: 200, exceeded_rebate_rate: 0, sort_order: 99, enabled: true }} isNew onSaved={loadAll} />
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 結算 / 發放 */}
        <TabsContent value="actions" className="space-y-3">
          <Card>
            <CardContent className="pt-6 space-y-3">
              <div className="flex flex-wrap gap-2">
                <Button disabled={busy} onClick={() => action(() => runDailySettlement(), "日結算")}>
                  <Play className="h-4 w-4 mr-1" />立即執行日結算
                </Button>
                <Button disabled={busy} variant="secondary"
                  onClick={() => action(() => runMonthlySettlement({ data: {} }), "月結算")}>
                  <Play className="h-4 w-4 mr-1" />立即執行月結算（本月）
                </Button>
                <Button disabled={busy} variant="secondary"
                  onClick={() => action(() => releaseDueRewards(), "到期發放")}>
                  <Send className="h-4 w-4 mr-1" />發放到期獎勵點
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                * 自動結算與發放透過 pg_cron 每日呼叫 `/api/public/hooks/bonus-daily-tick`。
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 獎金明細 */}
        <TabsContent value="records" className="space-y-3">
          <Card>
            <CardContent className="pt-6 space-y-3">
              <div className="flex flex-wrap gap-2 items-end">
                <div>
                  <Label>狀態</Label>
                  <Select value={filter.status || "_all"}
                    onValueChange={(v) => setFilter({ ...filter, status: v === "_all" ? "" : v })}>
                    <SelectTrigger className="w-40"><SelectValue placeholder="全部" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_all">全部</SelectItem>
                      {Object.entries(STATUS_LABEL).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>類型</Label>
                  <Select value={filter.bonusType || "_all"}
                    onValueChange={(v) => setFilter({ ...filter, bonusType: v === "_all" ? "" : v })}>
                    <SelectTrigger className="w-40"><SelectValue placeholder="全部" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="_all">全部</SelectItem>
                      {Object.entries(TYPE_LABEL).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={loadRecords} variant="outline">套用篩選</Button>
                <Button disabled={busy || selected.size === 0}
                  onClick={() => action(() => manualReleaseRewards({ data: { recordIds: Array.from(selected) } }), "手動發放")}>
                  <Send className="h-4 w-4 mr-1" />手動發放選取 ({selected.size})
                </Button>
                <Button variant="outline" onClick={() => {
                  const rows = [["時間","領取人","類型","代","金額","比例","點數","狀態","發放日"],
                    ...records.records.map((r: any) => [
                      new Date(r.created_at).toLocaleString(),
                      records.members[r.member_id]?.name ?? r.member_id,
                      TYPE_LABEL[r.bonus_type] ?? r.bonus_type,
                      r.generation_level ?? "",
                      r.base_amount, r.bonus_rate, r.bonus_points,
                      STATUS_LABEL[r.status] ?? r.status,
                      r.release_date ?? "",
                    ])];
                  const csv = rows.map((r) => r.map((c: any) => `"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n");
                  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(blob);
                  a.download = `bonus-${Date.now()}.csv`; a.click();
                }}>匯出 CSV</Button>
              </div>

              <Table>
                <TableHeader><TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>時間</TableHead><TableHead>領取人</TableHead>
                  <TableHead>類型</TableHead><TableHead>代</TableHead>
                  <TableHead className="text-right">金額</TableHead><TableHead className="text-right">比例%</TableHead>
                  <TableHead className="text-right">點數</TableHead>
                  <TableHead>狀態</TableHead><TableHead>發放日</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {records.records.map((r: any) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        {r.status === "waiting_release" && (
                          <Checkbox checked={selected.has(r.id)} onCheckedChange={(v) => {
                            const s = new Set(selected);
                            v ? s.add(r.id) : s.delete(r.id);
                            setSelected(s);
                          }} />
                        )}
                      </TableCell>
                      <TableCell className="text-xs">{new Date(r.created_at).toLocaleString()}</TableCell>
                      <TableCell className="text-xs">
                        {records.members[r.member_id]?.name ?? "—"}
                        <span className="ml-1 text-muted-foreground">{records.members[r.member_id]?.member_no}</span>
                      </TableCell>
                      <TableCell><Badge variant="outline">{TYPE_LABEL[r.bonus_type] ?? r.bonus_type}</Badge></TableCell>
                      <TableCell className="text-xs">{r.generation_level ?? "-"}</TableCell>
                      <TableCell className="text-right tabular-nums text-xs">{Number(r.base_amount).toLocaleString()}</TableCell>
                      <TableCell className="text-right text-xs">{r.bonus_rate}%</TableCell>
                      <TableCell className="text-right tabular-nums font-medium text-primary">+{r.bonus_points}</TableCell>
                      <TableCell><Badge variant={r.status === "released" ? "default" : "secondary"}>{STATUS_LABEL[r.status] ?? r.status}</Badge></TableCell>
                      <TableCell className="text-xs">{r.release_date ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                  {records.records.length === 0 && (
                    <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">尚無紀錄</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 結算批次 */}
        <TabsContent value="batches">
          <Card>
            <CardContent className="pt-6">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>時間</TableHead><TableHead>類型</TableHead>
                  <TableHead>期間</TableHead><TableHead className="text-right">會員數</TableHead>
                  <TableHead className="text-right">點數</TableHead><TableHead>狀態</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {batches.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell className="text-xs">{new Date(b.created_at).toLocaleString()}</TableCell>
                      <TableCell>{b.settlement_type === "daily" ? "日獎金" : "月獎金"}</TableCell>
                      <TableCell className="text-xs">{b.settlement_period_start} ~ {b.settlement_period_end}</TableCell>
                      <TableCell className="text-right tabular-nums">{b.total_members}</TableCell>
                      <TableCell className="text-right tabular-nums text-primary">{b.total_bonus_points}</TableCell>
                      <TableCell><Badge>{b.status}</Badge></TableCell>
                    </TableRow>
                  ))}
                  {batches.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">尚無結算紀錄</TableCell></TableRow>}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function RepurchaseRow({ row, isNew, onSaved }: { row: any; isNew?: boolean; onSaved: () => void }) {
  const [r, setR] = useState({ ...row });
  const [busy, setBusy] = useState(false);
  return (
    <TableRow>
      <TableCell>
        <Input type="number" min={1} className="w-16" value={r.generation_level}
          onChange={(e) => setR({ ...r, generation_level: Number(e.target.value) })} disabled={!isNew} />
      </TableCell>
      <TableCell>
        <Input type="number" step="0.1" min={0} max={100} className="w-24" value={r.bonus_rate}
          onChange={(e) => setR({ ...r, bonus_rate: Number(e.target.value) })} />
      </TableCell>
      <TableCell>
        <Switch checked={r.enabled} onCheckedChange={(v) => setR({ ...r, enabled: v })} />
      </TableCell>
      <TableCell>
        <Button size="sm" disabled={busy} onClick={async () => {
          setBusy(true);
          try {
            await upsertRepurchaseRate({ data: { generation_level: r.generation_level, bonus_rate: r.bonus_rate, enabled: r.enabled } });
            toast.success("已儲存"); onSaved();
          } catch (e: any) { toast.error(e.message); }
          finally { setBusy(false); }
        }}>{isNew ? "新增" : "儲存"}</Button>
      </TableCell>
    </TableRow>
  );
}

function RebateRow({ row, isNew, onSaved }: { row: any; isNew?: boolean; onSaved: () => void }) {
  const [r, setR] = useState({ ...row });
  const [busy, setBusy] = useState(false);
  return (
    <TableRow>
      <TableCell><Input className="w-24" value={r.rank_code} onChange={(e) => setR({ ...r, rank_code: e.target.value })} disabled={!isNew} /></TableCell>
      <TableCell><Input className="w-28" value={r.rank_name} onChange={(e) => setR({ ...r, rank_name: e.target.value })} /></TableCell>
      <TableCell><Input type="number" min={0} className="w-24" value={r.required_points} onChange={(e) => setR({ ...r, required_points: Number(e.target.value) })} /></TableCell>
      <TableCell><Input type="number" step="0.1" min={0} max={100} className="w-24" value={r.exceeded_rebate_rate} onChange={(e) => setR({ ...r, exceeded_rebate_rate: Number(e.target.value) })} /></TableCell>
      <TableCell><Input type="number" className="w-20" value={r.sort_order} onChange={(e) => setR({ ...r, sort_order: Number(e.target.value) })} /></TableCell>
      <TableCell><Switch checked={r.enabled} onCheckedChange={(v) => setR({ ...r, enabled: v })} /></TableCell>
      <TableCell className="flex gap-1">
        <Button size="sm" disabled={busy || !r.rank_code || !r.rank_name} onClick={async () => {
          setBusy(true);
          try {
            await upsertRankRebate({ data: r });
            toast.success("已儲存"); onSaved();
          } catch (e: any) { toast.error(e.message); }
          finally { setBusy(false); }
        }}>{isNew ? "新增" : "儲存"}</Button>
        {!isNew && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={async () => {
            if (!confirm("確定刪除？")) return;
            await deleteRankRebate({ data: { id: r.id } });
            onSaved();
          }}>刪除</Button>
        )}
      </TableCell>
    </TableRow>
  );
}

function MonthlyTierRow({ row, isNew, onSaved }: { row: any; isNew?: boolean; onSaved: () => void }) {
  const [r, setR] = useState({ ...row });
  const [busy, setBusy] = useState(false);
  return (
    <TableRow>
      <TableCell>
        <Input type="number" min={0} className="w-32" value={r.threshold_points}
          onChange={(e) => setR({ ...r, threshold_points: Number(e.target.value) })} />
      </TableCell>
      <TableCell>
        <Input type="number" step="0.1" min={0} max={100} className="w-24" value={r.bonus_rate}
          onChange={(e) => setR({ ...r, bonus_rate: Number(e.target.value) })} />
      </TableCell>
      <TableCell>
        <Input type="number" className="w-20" value={r.sort_order}
          onChange={(e) => setR({ ...r, sort_order: Number(e.target.value) })} />
      </TableCell>
      <TableCell>
        <Switch checked={r.enabled} onCheckedChange={(v) => setR({ ...r, enabled: v })} />
      </TableCell>
      <TableCell className="flex gap-1">
        <Button size="sm" disabled={busy || r.threshold_points < 0} onClick={async () => {
          setBusy(true);
          try {
            const payload: any = {
              threshold_points: r.threshold_points,
              bonus_rate: r.bonus_rate,
              sort_order: r.sort_order,
              enabled: r.enabled,
            };
            if (!isNew && r.id) payload.id = r.id;
            await upsertMonthlyTier({ data: payload });
            toast.success("已儲存"); onSaved();
          } catch (e: any) { toast.error(e.message); }
          finally { setBusy(false); }
        }}>{isNew ? "新增" : "儲存"}</Button>
        {!isNew && (
          <Button size="sm" variant="ghost" disabled={busy} onClick={async () => {
            if (!confirm("確定刪除？")) return;
            await deleteMonthlyTier({ data: { id: r.id } });
            onSaved();
          }}>刪除</Button>
        )}
      </TableCell>
    </TableRow>
  );
}
