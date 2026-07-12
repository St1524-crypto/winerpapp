import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2, Search, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useAuth, type AppRole } from "@/hooks/use-auth";
import { ForbiddenScreen } from "@/components/ForbiddenScreen";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listMemberBonusDetails, getBonusRecordDetail } from "@/lib/bonus.functions";

const ALLOWED_ROLES: AppRole[] = ["super_admin", "admin", "finance"];

type Category = "daily" | "monthly";

const DAILY_TYPES = [
  { value: "referral", label: "推薦獎勵" },
  { value: "repurchase", label: "復購獎勵" },
];
const MONTHLY_TYPES = [
  { value: "monthly_vip", label: "月獎金" },
  { value: "rank_rebate", label: "位階回饋" },
];

const STATUS_OPTIONS = [
  { value: "pending", label: "待結算" },
  { value: "waiting_release", label: "待發放" },
  { value: "released", label: "已發放" },
  { value: "failed", label: "發放失敗" },
  { value: "cancelled", label: "已取消" },
];

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

const STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  released: "default",
  waiting_release: "secondary",
  pending: "outline",
  failed: "destructive",
  cancelled: "outline",
};

export const Route = createFileRoute("/_authenticated/admin/bonuses/member-details")({
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
    return <ForbiddenScreen requiredRoles={ALLOWED_ROLES} pageName="會員獎金明細" />;
  }
  return <MemberBonusDetailsPage />;
}

type Filters = {
  memberName: string;
  memberNo: string;
  memberId: string;
  bonusType: string;
  status: string;
  settlementBatchId: string;
  dateFrom: string;
  dateTo: string;
};

const EMPTY_FILTERS: Filters = {
  memberName: "", memberNo: "", memberId: "",
  bonusType: "", status: "", settlementBatchId: "",
  dateFrom: "", dateTo: "",
};

function MemberBonusDetailsPage() {
  const [tab, setTab] = useState<Category>("daily");

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">會員獎金明細</h1>
          <p className="mt-1 text-sm text-muted-foreground">依會員、獎金類型、狀態、結算批次或日期區間查詢日獎金與月獎金明細。</p>
        </div>
        <Button asChild variant="outline">
          <Link to="/admin/bonuses"><ArrowLeft className="mr-2 h-4 w-4" />返回獎金營運中心</Link>
        </Button>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Category)}>
        <TabsList>
          <TabsTrigger value="daily">日獎金明細</TabsTrigger>
          <TabsTrigger value="monthly">月獎金明細</TabsTrigger>
        </TabsList>
        <TabsContent value="daily" className="mt-4">
          <DetailSection category="daily" />
        </TabsContent>
        <TabsContent value="monthly" className="mt-4">
          <DetailSection category="monthly" />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function DetailSection({ category }: { category: Category }) {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [loading, setLoading] = useState(false);
  const [records, setRecords] = useState<any[]>([]);
  const [members, setMembers] = useState<Record<string, any>>({});
  const [batches, setBatches] = useState<Record<string, any>>({});
  const [detailId, setDetailId] = useState<string | null>(null);

  const typeOptions = category === "daily" ? DAILY_TYPES : MONTHLY_TYPES;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const payload: any = { category, limit: 200 };
      if (filters.memberName.trim()) payload.memberName = filters.memberName.trim();
      if (filters.memberNo.trim()) payload.memberNo = filters.memberNo.trim();
      if (filters.memberId.trim()) payload.memberId = filters.memberId.trim();
      if (filters.bonusType) payload.bonusType = filters.bonusType;
      if (filters.status) payload.status = filters.status;
      if (filters.settlementBatchId.trim()) payload.settlementBatchId = filters.settlementBatchId.trim();
      if (filters.dateFrom) payload.dateFrom = filters.dateFrom;
      if (filters.dateTo) payload.dateTo = filters.dateTo;

      const res = await listMemberBonusDetails({ data: payload });
      setRecords(res.records ?? []);
      setMembers(res.members ?? {});
      setBatches(res.batches ?? {});
    } catch (e: any) {
      toast.error(e?.message ?? "查詢獎金明細失敗");
    } finally {
      setLoading(false);
    }
  }, [category, filters]);

  useEffect(() => {
    // 每次切換 tab 時清空並重新查詢當前分類
    setRecords([]);
    setFilters(EMPTY_FILTERS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category]);

  const totalPoints = useMemo(
    () => records.reduce((s, r: any) => s + Number(r.bonus_points ?? 0), 0),
    [records],
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">搜尋條件</CardTitle>
          <CardDescription>可組合多個條件；未填寫的欄位不參與篩選。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-1.5">
              <Label>會員名稱</Label>
              <Input value={filters.memberName}
                onChange={(e) => setFilters({ ...filters, memberName: e.target.value })}
                placeholder="模糊搜尋姓名" />
            </div>
            <div className="space-y-1.5">
              <Label>會員編號</Label>
              <Input value={filters.memberNo}
                onChange={(e) => setFilters({ ...filters, memberNo: e.target.value })}
                placeholder="member_no" />
            </div>
            <div className="space-y-1.5">
              <Label>member_id</Label>
              <Input className="font-mono" value={filters.memberId}
                onChange={(e) => setFilters({ ...filters, memberId: e.target.value })}
                placeholder="profiles.id" />
            </div>
            <div className="space-y-1.5">
              <Label>獎金類型</Label>
              <Select value={filters.bonusType || "all"} onValueChange={(v) => setFilters({ ...filters, bonusType: v === "all" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="全部" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部</SelectItem>
                  {typeOptions.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>狀態</Label>
              <Select value={filters.status || "all"} onValueChange={(v) => setFilters({ ...filters, status: v === "all" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="全部" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部</SelectItem>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>結算批次 ID</Label>
              <Input className="font-mono" value={filters.settlementBatchId}
                onChange={(e) => setFilters({ ...filters, settlementBatchId: e.target.value })}
                placeholder="bonus_settlement_batches.id" />
            </div>
            <div className="space-y-1.5">
              <Label>結算日期起</Label>
              <Input type="date" value={filters.dateFrom}
                onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>結算日期迄</Label>
              <Input type="date" value={filters.dateTo}
                onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })} />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={load} disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
              查詢
            </Button>
            <Button variant="outline" onClick={() => setFilters(EMPTY_FILTERS)} disabled={loading}>
              重設
            </Button>
            <Button variant="outline" onClick={load} disabled={loading}>
              <RefreshCw className="mr-2 h-4 w-4" />重新整理
            </Button>
            <div className="ml-auto text-sm text-muted-foreground">
              共 {records.length} 筆，合計 {formatNumber(totalPoints)} 點
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {category === "daily" ? "日獎金明細" : "月獎金明細"}
          </CardTitle>
          <CardDescription>
            {category === "daily"
              ? "顯示 bonus_records 中屬於日獎金類型（推薦、復購）之紀錄。"
              : "顯示 bonus_records 中屬於月獎金類型（月獎金、位階回饋）之紀錄。"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : records.length === 0 ? (
            <div className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
              尚無符合條件的資料
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>會員</TableHead>
                    <TableHead>獎金類型</TableHead>
                    <TableHead className="text-right">點數</TableHead>
                    <TableHead>狀態</TableHead>
                    <TableHead>{category === "daily" ? "結算日期" : "結算月份"}</TableHead>
                    <TableHead>結算批次</TableHead>
                    <TableHead>預計發放日</TableHead>
                    <TableHead>發放時間</TableHead>
                    <TableHead>重試 / 來源</TableHead>
                    <TableHead>來源會員</TableHead>
                    <TableHead>失敗原因</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.map((r: any) => {
                    const m = members[r.member_id];
                    const batch = batches[r.settlement_batch_id];
                    const releasedMember = r.released_member_id && members[r.released_member_id];
                    const originalMember = r.original_member_id && members[r.original_member_id];
                    return (
                      <TableRow key={r.id}>
                        <TableCell>
                          <div className="font-medium">{m?.name ?? "—"}</div>
                          <div className="text-xs text-muted-foreground">{m?.member_no ?? shortId(r.member_id)}</div>
                        </TableCell>
                        <TableCell>{TYPE_LABEL[r.bonus_type] ?? r.bonus_type}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatNumber(r.bonus_points)}</TableCell>
                        <TableCell>
                          <Badge variant={STATUS_VARIANT[r.status] ?? "outline"}>
                            {STATUS_LABEL[r.status] ?? r.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {category === "monthly"
                            ? (batch?.period ?? formatMonth(r.settlement_date ?? batch?.settlement_date))
                            : formatDate(r.settlement_date ?? batch?.settlement_date)}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {r.settlement_batch_id ? shortId(r.settlement_batch_id) : "—"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{formatDate(r.release_date)}</TableCell>
                        <TableCell className="whitespace-nowrap">{formatDateTime(r.released_at)}</TableCell>
                        <TableCell className="whitespace-nowrap text-xs">
                          <div>重試 {r.release_attempts ?? 0} 次</div>
                          <div className="text-muted-foreground">{r.release_source ?? "—"}</div>
                        </TableCell>
                        <TableCell className="text-xs">
                          {releasedMember && (
                            <div>已發: {releasedMember.name}（{releasedMember.member_no}）</div>
                          )}
                          {originalMember && (
                            <div className="text-muted-foreground">原: {originalMember.name}（{originalMember.member_no}）</div>
                          )}
                          {!releasedMember && !originalMember && "—"}
                        </TableCell>
                        <TableCell className="max-w-[220px] truncate text-xs text-destructive" title={r.failed_reason ?? ""}>
                          {r.failed_reason ?? "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="outline" size="sm" onClick={() => setDetailId(r.id)}>明細</Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <RecordDetailDialog recordId={detailId} onOpenChange={(o) => !o && setDetailId(null)} />
    </div>
  );
}

function RecordDetailDialog({ recordId, onOpenChange }: { recordId: string | null; onOpenChange: (o: boolean) => void }) {
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<any | null>(null);

  useEffect(() => {
    if (!recordId) { setDetail(null); return; }
    let cancelled = false;
    setLoading(true);
    getBonusRecordDetail({ data: { recordId } })
      .then((d) => { if (!cancelled) setDetail(d); })
      .catch((e: any) => toast.error(e?.message ?? "讀取獎金明細失敗"))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [recordId]);

  return (
    <Dialog open={!!recordId} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>獎金紀錄明細</DialogTitle>
          <DialogDescription>{recordId ? `record: ${recordId}` : ""}</DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : detail ? (
          <div className="max-h-[60vh] overflow-auto space-y-3 text-sm">
            <pre className="rounded-md bg-muted p-3 text-xs overflow-x-auto">
{JSON.stringify(detail, null, 2)}
            </pre>
          </div>
        ) : (
          <div className="py-6 text-center text-sm text-muted-foreground">無資料</div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function formatNumber(n: number | null | undefined) {
  return Number(n ?? 0).toLocaleString("zh-TW");
}
function formatDate(s: string | null | undefined) {
  if (!s) return "—";
  try { return new Date(s).toLocaleDateString("zh-TW"); } catch { return s; }
}
function formatDateTime(s: string | null | undefined) {
  if (!s) return "—";
  try { return new Date(s).toLocaleString("zh-TW"); } catch { return s; }
}
function formatMonth(s: string | null | undefined) {
  if (!s) return "—";
  try {
    const d = new Date(s);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  } catch { return s; }
}
function shortId(id: string | null | undefined) {
  if (!id) return "—";
  return id.slice(0, 8);
}
