import { Loader2, Search, RefreshCw, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PRESET_OPTIONS, type BonusDatePreset } from "@/lib/bonus-date-presets";

export type BonusFilters = {
  dateFrom: string;
  dateTo: string;
  bonusType: string;
  status: string;
  memberName: string;
  memberNo: string;
  settlementBatchId: string;
};

const STATUS_OPTIONS = [
  { value: "pending", label: "待結算" },
  { value: "waiting_release", label: "待發放" },
  { value: "released", label: "已成功發放" },
  { value: "failed", label: "發放失敗" },
  { value: "cancelled", label: "已取消" },
];

export function BonusFiltersCard({
  filters, setFilters, preset, setPreset, onLoad, loading, onExport, typeOptions,
}: {
  filters: BonusFilters;
  setFilters: (f: BonusFilters) => void;
  preset: BonusDatePreset;
  setPreset: (p: BonusDatePreset) => void;
  onLoad: () => void;
  loading: boolean;
  onExport?: () => void;
  typeOptions: { value: string; label: string }[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">查詢條件</CardTitle>
        <CardDescription>使用結算日期（settlement_date）作為期間篩選；空白欄位不參與過濾。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="space-y-1">
            <Label>快捷期間</Label>
            <Select value={preset} onValueChange={(v) => setPreset(v as BonusDatePreset)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PRESET_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label>起始日期</Label>
            <Input type="date" value={filters.dateFrom} onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })} /></div>
          <div className="space-y-1"><Label>結束日期</Label>
            <Input type="date" value={filters.dateTo} onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })} /></div>
          <div className="space-y-1">
            <Label>獎金類型</Label>
            <Select value={filters.bonusType || "all"} onValueChange={(v) => setFilters({ ...filters, bonusType: v === "all" ? "" : v })}>
              <SelectTrigger><SelectValue placeholder="全部" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部</SelectItem>
                {typeOptions.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>狀態</Label>
            <Select value={filters.status || "all"} onValueChange={(v) => setFilters({ ...filters, status: v === "all" ? "" : v })}>
              <SelectTrigger><SelectValue placeholder="全部" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部</SelectItem>
                {STATUS_OPTIONS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1"><Label>會員名稱</Label>
            <Input value={filters.memberName} onChange={(e) => setFilters({ ...filters, memberName: e.target.value })} placeholder="模糊搜尋" /></div>
          <div className="space-y-1"><Label>會員編號</Label>
            <Input value={filters.memberNo} onChange={(e) => setFilters({ ...filters, memberNo: e.target.value })} /></div>
          <div className="space-y-1"><Label>批次 ID</Label>
            <Input className="font-mono" value={filters.settlementBatchId} onChange={(e) => setFilters({ ...filters, settlementBatchId: e.target.value })} /></div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={onLoad} disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}查詢
          </Button>
          <Button variant="outline" onClick={onLoad} disabled={loading}><RefreshCw className="mr-2 h-4 w-4" />重新整理</Button>
          {onExport && <Button variant="outline" onClick={onExport}><Download className="mr-2 h-4 w-4" />匯出 CSV</Button>}
        </div>
      </CardContent>
    </Card>
  );
}
