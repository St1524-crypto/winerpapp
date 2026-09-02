import { createFileRoute, Link as RouterLink } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Crown, RotateCcw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import {
  listVipUpgradeRules,
  previewVipUpgradeRuleChanges,
  applyVipUpgradeRuleChanges,
} from "@/lib/vip-upgrade-rules.functions";
import { getPayoutSummaryForRules } from "@/lib/bonus-payout-report.functions";

export const Route = createFileRoute("/_authenticated/admin/vip-upgrade-rules")({
  component: VipUpgradeRulesPage,
  head: () => ({
    meta: [
      { title: "新VIP制度升級條件設定 — winerp" },
      {
        name: "description",
        content: "超級管理員可編輯各 VIP 階級升級條件，套用前先檢視現值與目標值差異對照並確認。",
      },
      { property: "og:title", content: "新VIP制度升級條件設定 — winerp" },
      {
        property: "og:description",
        content: "編輯 VIP 升級門檻、直推／輔導條件與續領規則，套用前需經差異確認流程。",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Row = {
  id: string;
  code: string;
  name: string;
  status: string;
  required_reward_points: number;
  required_direct_vip: number;
  required_mentor_tier: string | null;
  required_mentor_count: number;
  renewal_window_days: number;
  renewal_required_new_vip: number;
};

type Diff = {
  code: string;
  name: string;
  label: string;
  from: string | number | null;
  to: string | number | null;
};

function normalize(r: any): Row {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    status: r.status,
    required_reward_points: Number(r.required_reward_points ?? 0),
    required_direct_vip: Number(r.required_direct_vip ?? 0),
    required_mentor_tier: r.required_mentor_tier ?? "",
    required_mentor_count: Number(r.required_mentor_count ?? 0),
    renewal_window_days: Number(r.renewal_window_days ?? 0),
    renewal_required_new_vip: Number(r.renewal_required_new_vip ?? 0),
  };
}

function VipUpgradeRulesPage() {
  const loadFn = useServerFn(listVipUpgradeRules);
  const previewFn = useServerFn(previewVipUpgradeRuleChanges);
  const applyFn = useServerFn(applyVipUpgradeRuleChanges);

  const [original, setOriginal] = useState<Row[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [diffs, setDiffs] = useState<Diff[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<any>(null);
  const summaryFn = useServerFn(getPayoutSummaryForRules);

  useEffect(() => {
    summaryFn()
      .then((r: any) => setSummary(r))
      .catch(() => setSummary(null));
  }, []);

  async function load() {
    setLoading(true);
    try {
      const res: any = await loadFn();
      const list = (res.rows ?? []).map(normalize);
      setOriginal(list);
      setRows(list.map((r: Row) => ({ ...r })));
      setCanEdit(!!res.canEdit);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  const dirty = useMemo(
    () => JSON.stringify(rows) !== JSON.stringify(original),
    [rows, original],
  );

  function update(id: string, field: keyof Row, value: string) {
    setRows((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              [field]:
                field === "required_mentor_tier" ? value.toUpperCase() : Number(value) || 0,
            }
          : r,
      ),
    );
  }

  function payload() {
    return rows.map((r) => ({
      id: r.id,
      code: r.code,
      required_reward_points: r.required_reward_points,
      required_direct_vip: r.required_direct_vip,
      required_mentor_tier: r.required_mentor_tier ? r.required_mentor_tier : null,
      required_mentor_count: r.required_mentor_count,
      renewal_window_days: r.renewal_window_days,
      renewal_required_new_vip: r.renewal_required_new_vip,
    }));
  }

  async function preview() {
    setBusy(true);
    try {
      const res: any = await previewFn({ data: { rows: payload() } });
      if (!res.count) {
        toast.info("沒有偵測到任何變更");
        return;
      }
      setDiffs(res.diffs);
      setConfirmOpen(true);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    setBusy(true);
    try {
      await applyFn({ data: { rows: payload(), confirmed: true } });
      toast.success("制度升級條件已更新");
      setConfirmOpen(false);
      await load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Crown className="h-6 w-6" />
            新VIP制度升級條件
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            編輯後請先「檢視差異」，確認現值 → 目標值對照無誤再套用。
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setRows(original.map((r) => ({ ...r })))} disabled={!dirty}>
            <RotateCcw className="h-4 w-4 mr-1" />
            還原
          </Button>
          <Button onClick={preview} disabled={!canEdit || !dirty || busy}>
            <ShieldCheck className="h-4 w-4 mr-1" />
            檢視差異並確認
          </Button>
        </div>
      </div>

      {!canEdit && (
        <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          目前為唯讀模式，只有超級管理員可以修改制度升級條件。
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">制度同步對照：分紅名單與 80/20 發放</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              與獎金發放中心、分紅名單管理即時同步（現金錢包 80%／貢獻點 20%）。
            </p>
          </div>
          <div className="flex gap-2">
            <RouterLink to="/admin/bonuses/pool-members">
              <Button variant="outline" size="sm">分紅名單管理</Button>
            </RouterLink>
            <RouterLink to="/admin/bonuses/payout-report">
              <Button variant="outline" size="sm">發放報表</Button>
            </RouterLink>
          </div>
        </CardHeader>
        <CardContent>
          {!summary ? (
            <div className="text-sm text-muted-foreground">載入中…</div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
              <div className="rounded-md border p-3">
                <div className="text-muted-foreground">POOL_VSTEA</div>
                <div className="font-semibold">
                  {summary.pool
                    ? `${summary.pool.status}／${(Number(summary.pool.bonus_rate ?? 0) * 100).toFixed(2)}%`
                    : "未設定"}
                </div>
                <div className="text-muted-foreground">
                  適用 {(summary.pool?.tier_codes ?? []).join("、") || "—"}／有效名單 {summary.poolActiveMembers} 位
                </div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-muted-foreground">已發放（80/20）</div>
                <div className="font-semibold tabular-nums">{summary.released.points.toLocaleString()} 點</div>
                <div className="text-muted-foreground tabular-nums">
                  現金 {summary.released.cash.toLocaleString()}／貢獻點 {summary.released.point.toLocaleString()}
                </div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-muted-foreground">待發放預估</div>
                <div className="font-semibold tabular-nums">{summary.waiting.points.toLocaleString()} 點</div>
                <div className="text-muted-foreground tabular-nums">
                  現金 {summary.waiting.cash.toLocaleString()}／貢獻點 {summary.waiting.point.toLocaleString()}
                </div>
              </div>
              <div className="rounded-md border p-3">
                <div className="text-muted-foreground">今日到期可發</div>
                <div className="font-semibold tabular-nums">{summary.due.points.toLocaleString()} 點</div>
                <div className="text-muted-foreground tabular-nums">
                  現金 {summary.due.cash.toLocaleString()}／貢獻點 {summary.due.point.toLocaleString()}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>


      <Card>
        <CardHeader>
          <CardTitle className="text-base">各階級升級條件參數</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {loading ? (
            <div className="text-sm text-muted-foreground py-6">載入中…</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-32">階級</TableHead>
                  <TableHead className="min-w-32">累積升級獎勵點</TableHead>
                  <TableHead className="min-w-28">直推 VIP</TableHead>
                  <TableHead className="min-w-28">輔導階級</TableHead>
                  <TableHead className="min-w-24">輔導人數</TableHead>
                  <TableHead className="min-w-28">續領週期(天)</TableHead>
                  <TableHead className="min-w-28">續領需新增</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const o = original.find((x) => x.id === r.id);
                  const changed = o && JSON.stringify(o) !== JSON.stringify(r);
                  return (
                    <TableRow key={r.id} className={changed ? "bg-muted/50" : undefined}>
                      <TableCell className="font-medium whitespace-nowrap">
                        {r.code} — {r.name}
                        {changed && (
                          <Badge variant="secondary" className="ml-2">
                            已修改
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          disabled={!canEdit}
                          value={r.required_reward_points}
                          onChange={(e) => update(r.id, "required_reward_points", e.target.value)}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          disabled={!canEdit}
                          value={r.required_direct_vip}
                          onChange={(e) => update(r.id, "required_direct_vip", e.target.value)}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          disabled={!canEdit}
                          value={r.required_mentor_tier ?? ""}
                          placeholder="如 E / STAR1"
                          onChange={(e) => update(r.id, "required_mentor_tier", e.target.value)}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          disabled={!canEdit}
                          value={r.required_mentor_count}
                          onChange={(e) => update(r.id, "required_mentor_count", e.target.value)}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          disabled={!canEdit}
                          value={r.renewal_window_days}
                          onChange={(e) => update(r.id, "renewal_window_days", e.target.value)}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          disabled={!canEdit}
                          value={r.renewal_required_new_vip}
                          onChange={(e) => update(r.id, "renewal_required_new_vip", e.target.value)}
                        />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>確認制度升級條件變更</DialogTitle>
            <DialogDescription>
              以下為「現值 → 目標值」對照，共 {diffs.length} 項。確認後才會寫入資料庫。
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[50vh] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>階級</TableHead>
                  <TableHead>項目</TableHead>
                  <TableHead>現值</TableHead>
                  <TableHead>目標值</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {diffs.map((d, i) => (
                  <TableRow key={i}>
                    <TableCell className="whitespace-nowrap">
                      {d.code} — {d.name}
                    </TableCell>
                    <TableCell>{d.label}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {d.from === null || d.from === "" ? "—" : String(d.from)}
                    </TableCell>
                    <TableCell className="font-semibold">
                      {d.to === null || d.to === "" ? "—" : String(d.to)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={busy}>
              取消
            </Button>
            <Button onClick={apply} disabled={busy}>
              確認並套用
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
