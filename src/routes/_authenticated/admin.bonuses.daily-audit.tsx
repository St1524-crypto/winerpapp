import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Loader2, Search, RefreshCcw, AlertTriangle, CheckCircle2, Ghost } from "lucide-react";
import { toast } from "sonner";
import { useAuth, type AppRole } from "@/hooks/use-auth";
import { ForbiddenScreen } from "@/components/ForbiddenScreen";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDailyBonusAudit, adminRunBonusRecalculation } from "@/lib/bonus.functions";

const ALLOWED: AppRole[] = ["super_admin", "admin", "finance"];

export const Route = createFileRoute("/_authenticated/admin/bonuses/daily-audit")({
  component: Guard,
});

function Guard() {
  const { roles, loading } = useAuth();
  if (loading)
    return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!roles.some((r) => ALLOWED.includes(r)))
    return <ForbiddenScreen requiredRoles={ALLOWED} pageName="日獎金對帳" />;
  return <Page />;
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const fmt = (n: any) => Number(n ?? 0).toLocaleString();

function Page() {
  const [date, setDate] = useState(today());
  const [loading, setLoading] = useState(false);
  const [recalcBusy, setRecalcBusy] = useState(false);
  const [recalcMode, setRecalcMode] = useState<"preview" | "clawback" | "correction">("preview");
  const [dryRun, setDryRun] = useState(true);
  const [audit, setAudit] = useState<any>(null);
  const [recalcResult, setRecalcResult] = useState<any>(null);

  async function loadAudit() {
    setLoading(true);
    try {
      const res = await getDailyBonusAudit({ data: { settlementDate: date } });
      setAudit(res);
      toast.success("已載入對帳資料");
    } catch (e: any) {
      toast.error(e?.message ?? "載入失敗");
    } finally {
      setLoading(false);
    }
  }

  async function runRecalc() {
    if (!dryRun) {
      const ok = confirm(
        `即將以「${recalcMode}」模式對 ${date} 執行 apply（實際寫入）。確定執行？`,
      );
      if (!ok) return;
    }
    setRecalcBusy(true);
    setRecalcResult(null);
    try {
      const res = await adminRunBonusRecalculation({
        data: { scope: "daily", target: date, dryRun, mode: recalcMode },
      });
      setRecalcResult(res);
      toast.success(`${dryRun ? "Dry-run" : "Apply"} 完成`);
      if (!dryRun) await loadAudit();
    } catch (e: any) {
      toast.error(e?.message ?? "重算失敗");
    } finally {
      setRecalcBusy(false);
    }
  }

  const memberName = (id: string | null) => {
    if (!id) return "-";
    const m = audit?.members?.[id];
    return m ? `${m.name} (${m.member_no})` : `${id.slice(0, 8)}…`;
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/admin/bonuses"><ArrowLeft className="mr-1 h-4 w-4" />返回獎金中心</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5 text-primary" />日獎金對帳
          </CardTitle>
          <CardDescription>
            查詢指定日期的 bonus_records、來源訂單、被自動取消的孤兒紀錄摘要，並可就地重算（dry-run／clawback／correction）。
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div>
            <Label htmlFor="date">結算日期</Label>
            <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-48" />
          </div>
          <Button onClick={loadAudit} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
            查詢
          </Button>
          <div className="ml-auto flex flex-wrap items-end gap-2">
            <div>
              <Label>重算模式</Label>
              <Select value={recalcMode} onValueChange={(v: any) => setRecalcMode(v)}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="preview">Preview</SelectItem>
                  <SelectItem value="clawback">Clawback（追回）</SelectItem>
                  <SelectItem value="correction">Correction（更正）</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>執行方式</Label>
              <Select value={dryRun ? "dry" : "apply"} onValueChange={(v) => setDryRun(v === "dry")}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="dry">Dry-run</SelectItem>
                  <SelectItem value="apply">Apply</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={runRecalc} disabled={recalcBusy} variant={dryRun ? "outline" : "default"}>
              {recalcBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
              重算
            </Button>
          </div>
        </CardContent>
      </Card>

      {recalcResult ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              重算結果
              <Badge variant="secondary">{recalcMode}</Badge>
              <Badge variant={dryRun ? "outline" : "default"}>{dryRun ? "dry-run" : "apply"}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="max-h-72 overflow-auto rounded bg-muted p-3 text-xs">{JSON.stringify(recalcResult, null, 2)}</pre>
          </CardContent>
        </Card>
      ) : null}

      {audit ? (
        <>
          <div className="grid gap-3 md:grid-cols-4">
            <StatBox label="bonus_records 筆數" value={fmt(audit.recordsSummary.total)} />
            <StatBox label="bonus_records 總點數" value={fmt(audit.recordsSummary.totalPoints)} />
            <StatBox label="當日訂單數" value={fmt(audit.dayOrdersSummary.count)} />
            <StatBox label="訂單預期獎勵點" value={fmt(audit.dayOrdersSummary.expectedPoints)} />
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">依 status 分佈</CardTitle></CardHeader>
            <CardContent>
              <KV data={audit.recordsSummary.byStatus} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Ghost className={`h-4 w-4 ${audit.orphanSummary.count > 0 ? "text-destructive" : "text-muted-foreground"}`} />
                孤兒紀錄（source_order_id 已不存在）
              </CardTitle>
              <CardDescription>
                共 {fmt(audit.orphanSummary.count)} 筆 / {fmt(audit.orphanSummary.points)} 點
              </CardDescription>
            </CardHeader>
            <CardContent>
              {audit.orphanRecords.length === 0 ? (
                <div className="text-sm text-muted-foreground">無孤兒紀錄。</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>會員</TableHead>
                      <TableHead>type</TableHead>
                      <TableHead>status</TableHead>
                      <TableHead className="text-right">點數</TableHead>
                      <TableHead>來源訂單ID</TableHead>
                      <TableHead>fail_reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {audit.orphanRecords.map((r: any) => (
                      <TableRow key={r.id}>
                        <TableCell>{memberName(r.member_id)}</TableCell>
                        <TableCell>{r.bonus_type}</TableCell>
                        <TableCell><Badge variant="outline">{r.status}</Badge></TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(r.bonus_points)}</TableCell>
                        <TableCell className="font-mono text-xs">{String(r.source_order_id).slice(0, 8)}…</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{r.fail_reason ?? "-"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">當日來源訂單</CardTitle>
              <CardDescription>依 created_at UTC+8 落在此日期</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>訂單編號</TableHead>
                    <TableHead>買家</TableHead>
                    <TableHead>狀態</TableHead>
                    <TableHead className="text-right">金額</TableHead>
                    <TableHead className="text-right">獎勵點</TableHead>
                    <TableHead className="text-right">推薦獎勵</TableHead>
                    <TableHead>建立時間</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {audit.dayOrders.map((o: any) => (
                    <TableRow key={o.id}>
                      <TableCell className="font-mono text-xs">{o.order_no}</TableCell>
                      <TableCell>{memberName(o.buyer_id)}</TableCell>
                      <TableCell><Badge variant="outline">{o.status}</Badge></TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(o.total_amount)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(o.order_earn)}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmt(o.order_earn_referrer)}</TableCell>
                      <TableCell className="text-xs">{new Date(o.created_at).toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                  {audit.dayOrders.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">當日無訂單</TableCell></TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">bonus_records 明細（前 500 筆）</CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>會員</TableHead>
                    <TableHead>來源會員</TableHead>
                    <TableHead>type</TableHead>
                    <TableHead>status</TableHead>
                    <TableHead>gen</TableHead>
                    <TableHead className="text-right">rate</TableHead>
                    <TableHead className="text-right">base</TableHead>
                    <TableHead className="text-right">點數</TableHead>
                    <TableHead>release</TableHead>
                    <TableHead>來源訂單</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {audit.records.slice(0, 500).map((r: any) => {
                    const orphan = r.source_order_id && !audit.referencedOrders.find((o: any) => o.id === r.source_order_id);
                    return (
                      <TableRow key={r.id} className={orphan ? "bg-destructive/5" : ""}>
                        <TableCell className="text-xs">{memberName(r.member_id)}</TableCell>
                        <TableCell className="text-xs">{memberName(r.source_member_id)}</TableCell>
                        <TableCell>{r.bonus_type}</TableCell>
                        <TableCell><Badge variant="outline">{r.status}</Badge></TableCell>
                        <TableCell>{r.generation_level ?? "-"}</TableCell>
                        <TableCell className="text-right">{r.bonus_rate ?? "-"}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(r.base_amount)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(r.bonus_points)}</TableCell>
                        <TableCell className="text-xs">{r.release_date ?? "-"}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {r.source_order_id ? (
                            <span className={orphan ? "text-destructive flex items-center gap-1" : ""}>
                              {orphan ? <AlertTriangle className="h-3 w-3" /> : null}
                              {String(r.source_order_id).slice(0, 8)}…
                            </span>
                          ) : "-"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {audit.records.length === 0 ? (
                    <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-6">無 bonus_records</TableCell></TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{label}</CardTitle></CardHeader>
      <CardContent className="text-2xl font-bold tabular-nums">{value}</CardContent>
    </Card>
  );
}

function KV({ data }: { data: Record<string, { count: number; points: number }> }) {
  const entries = Object.entries(data ?? {});
  if (entries.length === 0) return <div className="text-sm text-muted-foreground">—</div>;
  return (
    <Table>
      <TableHeader><TableRow><TableHead>status</TableHead><TableHead className="text-right">筆數</TableHead><TableHead className="text-right">點數</TableHead></TableRow></TableHeader>
      <TableBody>
        {entries.map(([k, v]) => (
          <TableRow key={k}>
            <TableCell><Badge variant="outline">{k}</Badge></TableCell>
            <TableCell className="text-right tabular-nums">{fmt(v.count)}</TableCell>
            <TableCell className="text-right tabular-nums">{fmt(v.points)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
