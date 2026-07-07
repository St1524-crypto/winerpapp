import { Link, createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Coins, Download, Loader2, Search, User, Calendar, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ForbiddenScreen } from "@/components/ForbiddenScreen";
import { useAuth, type AppRole } from "@/hooks/use-auth";
import { getMemberBonusBreakdown, searchBonusMembers } from "@/lib/bonus.functions";
import { toast } from "sonner";

const ALLOWED_ROLES: AppRole[] = ["super_admin", "admin", "finance"];

const TYPE_LABEL: Record<string, string> = {
  referral: "推薦獎勵",
  repurchase: "復購獎勵",
  monthly_vip: "月獎金",
  rank_rebate: "位階回饋",
};

const STATUS_LABEL: Record<string, string> = {
  waiting_release: "待發放",
  released: "已發放",
  failed: "發放失敗",
  pending: "待結算",
  cancelled: "已取消",
};

export const Route = createFileRoute("/_authenticated/admin/bonuses_/vip-detail")({
  component: Guard,
});

function Guard() {
  const { roles, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!roles.some((r) => ALLOWED_ROLES.includes(r))) {
    return <ForbiddenScreen requiredRoles={ALLOWED_ROLES} pageName="VIP 獎金明細" />;
  }
  return <VipBonusDetailPage />;
}

function VipBonusDetailPage() {
  const [keyword, setKeyword] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const search = useMutation({
    mutationFn: (kw: string) => searchBonusMembers({ data: { keyword: kw } }),
    onError: (e: any) => toast.error(e?.message ?? "搜尋失敗"),
  });

  const detail = useQuery({
    queryKey: ["member-bonus-breakdown", selectedId, dateFrom, dateTo],
    queryFn: () => getMemberBonusBreakdown({
      data: { memberId: selectedId!, scope: "all", dateFrom: dateFrom || undefined, dateTo: dateTo || undefined },
    }),
    enabled: !!selectedId,
  });

  const results = search.data ?? [];
  const data = detail.data;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="space-y-2">
        <Button asChild variant="ghost" size="sm" className="w-fit px-0">
          <Link to="/admin/bonuses">
            <ArrowLeft className="mr-2 h-4 w-4" />
            返回獎金營運中心
          </Link>
        </Button>
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Coins className="h-6 w-6 text-primary" />
            VIP 個人日/月獎金明細
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            輸入姓名、會員編號、Email 或電話搜尋 VIP，查看該會員所有推薦、復購、月獎金與位階回饋明細。
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">搜尋會員</CardTitle>
          <CardDescription>依姓名 / 會員編號 / Email / 電話</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (keyword.trim()) search.mutate(keyword.trim());
            }}
          >
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="搜尋 VIP 會員..."
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={search.isPending}>
              {search.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "搜尋"}
            </Button>
          </form>

          {results.length > 0 && (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead>會員</TableHead>
                    <TableHead>聯絡方式</TableHead>
                    <TableHead>VIP</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {results.map((m: any) => (
                    <TableRow key={m.id} className={selectedId === m.id ? "bg-primary/5" : ""}>
                      <TableCell>
                        <div className="font-medium">{m.name ?? "—"}</div>
                        <div className="text-xs text-muted-foreground font-mono">{m.member_no}</div>
                      </TableCell>
                      <TableCell className="text-xs">
                        <div>{m.email ?? "—"}</div>
                        <div className="text-muted-foreground">{m.phone ?? "—"}</div>
                      </TableCell>
                      <TableCell className="text-xs">
                        {m.is_vip ? (
                          <Badge>VIP{m.vip_expires_at ? ` · ${new Date(m.vip_expires_at).toLocaleDateString()}` : ""}</Badge>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant={selectedId === m.id ? "default" : "outline"} onClick={() => setSelectedId(m.id)}>
                          查看明細
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {selectedId && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <User className="h-4 w-4 text-primary" />
              {data?.member?.name ?? "會員"} 的獎金明細
              {data?.member?.member_no && (
                <span className="text-xs font-mono text-muted-foreground">({data.member.member_no})</span>
              )}
            </CardTitle>
            <CardDescription>可依時間篩選；點數依 bonus_records 統計。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <Label className="text-xs flex items-center gap-1"><Calendar className="h-3 w-3" />起始日</Label>
                <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-40" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs flex items-center gap-1"><Calendar className="h-3 w-3" />結束日</Label>
                <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-40" />
              </div>
              <Button variant="outline" onClick={() => { setDateFrom(""); setDateTo(""); }}>清除日期</Button>
              <Button variant="outline" onClick={() => detail.refetch()} disabled={detail.isFetching}>
                {detail.isFetching ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                重新整理
              </Button>
            </div>

            {detail.isLoading ? (
              <div className="py-10 text-center text-muted-foreground">
                <Loader2 className="mx-auto h-5 w-5 animate-spin" />
              </div>
            ) : data ? (
              <Tabs defaultValue="daily">
                <TabsList>
                  <TabsTrigger value="daily">日獎金明細（{data.daily.records.length}）</TabsTrigger>
                  <TabsTrigger value="monthly">月獎金明細（{data.monthly.records.length}）</TabsTrigger>
                </TabsList>
                <TabsContent value="daily" className="space-y-4 pt-4">
                  <div className="flex justify-end">
                    <ExportCsvButton
                      disabled={data.daily.records.length === 0}
                      onClick={() => exportBonusCsv({
                        scope: "daily",
                        member: data.member,
                        records: data.daily.records,
                        sources: data.sources,
                        dateFrom, dateTo,
                      })}
                    />
                  </div>
                  <SummaryStrip summary={data.daily.summary} />
                  <BonusRecordsTable records={data.daily.records} sources={data.sources} />
                </TabsContent>
                <TabsContent value="monthly" className="space-y-4 pt-4">
                  <div className="flex justify-end">
                    <ExportCsvButton
                      disabled={data.monthly.records.length === 0}
                      onClick={() => exportBonusCsv({
                        scope: "monthly",
                        member: data.member,
                        records: data.monthly.records,
                        sources: data.sources,
                        dateFrom, dateTo,
                      })}
                    />
                  </div>
                  <SummaryStrip summary={data.monthly.summary} />
                  <BonusRecordsTable records={data.monthly.records} sources={data.sources} />
                </TabsContent>
              </Tabs>
            ) : null}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function SummaryStrip({ summary }: { summary: any }) {
  return (
    <div className="grid gap-3 md:grid-cols-4">
      <MiniStat title="總筆數" value={summary.totalCount} />
      <MiniStat title="總點數" value={summary.totalPoints} tone="primary" />
      <MiniStat title="已發放" value={summary.releasedPoints} tone="success" />
      <MiniStat title="待發放 / 失敗" value={`${summary.waitingPoints} / ${summary.failedPoints}`} tone="warn" />
      {Object.keys(summary.byType).length > 0 && (
        <div className="md:col-span-4 rounded-lg border p-3">
          <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
            <TrendingUp className="h-3 w-3" /> 依獎金類型
          </div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(summary.byType).map(([type, s]: [string, any]) => (
              <Badge key={type} variant="outline" className="text-xs">
                {TYPE_LABEL[type] ?? type}：{s.count} 筆 / {s.points.toLocaleString()} 點
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MiniStat({ title, value, tone }: { title: string; value: number | string; tone?: "primary" | "success" | "warn" }) {
  const cls = tone === "primary" ? "text-primary" : tone === "success" ? "text-emerald-600" : tone === "warn" ? "text-amber-600" : "";
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{title}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${cls}`}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
    </div>
  );
}

function BonusRecordsTable({ records, sources }: { records: any[]; sources: Record<string, any> }) {
  if (records.length === 0) {
    return <div className="rounded-lg border py-8 text-center text-sm text-muted-foreground">此區間沒有紀錄</div>;
  }
  return (
    <div className="rounded-lg border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40">
            <TableHead>建立時間</TableHead>
            <TableHead>類型</TableHead>
            <TableHead>來源會員</TableHead>
            <TableHead>層級</TableHead>
            <TableHead className="text-right">基數</TableHead>
            <TableHead className="text-right">比例</TableHead>
            <TableHead className="text-right">點數</TableHead>
            <TableHead>狀態</TableHead>
            <TableHead>結算日</TableHead>
            <TableHead>發放日</TableHead>
            <TableHead>失敗原因</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {records.map((r: any) => {
            const src = r.source_member_id ? sources[r.source_member_id] : null;
            return (
              <TableRow key={r.id}>
                <TableCell className="text-xs whitespace-nowrap">{new Date(r.created_at).toLocaleString("zh-TW", { hour12: false })}</TableCell>
                <TableCell><Badge variant="outline">{TYPE_LABEL[r.bonus_type] ?? r.bonus_type}</Badge></TableCell>
                <TableCell className="text-xs">
                  {src ? (
                    <>
                      <div>{src.name}</div>
                      <div className="font-mono text-muted-foreground">{src.member_no}</div>
                    </>
                  ) : "—"}
                </TableCell>
                <TableCell className="text-xs tabular-nums">{r.generation_level ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{Number(r.base_amount ?? 0).toLocaleString()}</TableCell>
                <TableCell className="text-right tabular-nums">{Number(r.bonus_rate ?? 0)}%</TableCell>
                <TableCell className="text-right font-semibold tabular-nums">{Number(r.bonus_points ?? 0).toLocaleString()}</TableCell>
                <TableCell>
                  <Badge variant={r.status === "failed" ? "destructive" : r.status === "released" ? "default" : "secondary"}>
                    {STATUS_LABEL[r.status] ?? r.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs">{r.settlement_date ?? "—"}</TableCell>
                <TableCell className="text-xs">{r.release_date ?? "—"}</TableCell>
                <TableCell className="text-xs text-destructive max-w-[180px] truncate" title={r.fail_reason ?? ""}>{r.fail_reason ?? "—"}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
