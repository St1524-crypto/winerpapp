import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { bonusTypeLabel } from "@/lib/bonus-labels";
import { summarizeIncome } from "@/lib/bonus-income";

// 獎金收入總表：僅統計「有收入」的列（bonus_points>0 且 status ∈ released/waiting_release）。
// 使用位置：/admin/bonuses/daily-details, monthly-details, member-details, summary。
export function BonusIncomeSummary({
  rows,
  title = "獎金收入總表",
  description = "僅統計 bonus_points > 0 且狀態為『已成功發放』或『待發放』的收入。已取消 / 失敗 / 未達成不列入。",
}: {
  rows: any[] | null | undefined;
  title?: string;
  description?: string;
}) {
  const s = summarizeIncome(rows);
  if (s.totalCount === 0) return null;
  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription className="text-xs">{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="收入總筆數" value={s.totalCount} />
          <Metric label="應發貢獻點合計" value={s.totalPoints} strong />
          <Metric label="已發放" value={s.releasedPoints} tone="primary" />
          <Metric label="待發放" value={s.waitingPoints} />
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>獎金類型</TableHead>
                <TableHead className="text-right">筆數</TableHead>
                <TableHead className="text-right">點數合計</TableHead>
                <TableHead className="text-right">已發放</TableHead>
                <TableHead className="text-right">待發放</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {s.byType.map((r) => (
                <TableRow key={r.bonus_type}>
                  <TableCell>{bonusTypeLabel(r.bonus_type)}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.count.toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">{r.points.toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums text-primary">{r.released.toLocaleString()}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.waiting.toLocaleString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value, strong, tone }: { label: string; value: number; strong?: boolean; tone?: "primary" }) {
  const color = tone === "primary" ? "text-primary" : "";
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 text-xl tabular-nums ${strong ? "font-bold" : "font-semibold"} ${color}`}>
        {value.toLocaleString()}
      </div>
    </div>
  );
}

export function IncomeEmptyState() {
  return (
    <div className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
      此期間無可收入獎金
    </div>
  );
}
