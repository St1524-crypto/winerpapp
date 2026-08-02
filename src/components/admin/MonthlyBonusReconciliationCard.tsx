import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { bonusTypeLabel } from "@/lib/bonus-labels";
import { isIncomeRow } from "@/lib/bonus-income";

type Row = {
  bonus_type?: string | null;
  status?: string | null;
  bonus_points?: number | string | null;
};

const n = (v: unknown) => {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
};

// 月獎金對帳摘要：以「全部查詢結果」為母體，逐獎金類型列出筆數/點數，
// 並核對 已發放 + 待發放 + 其他 是否等於總計。
export function MonthlyBonusReconciliationCard({
  rows,
  title = "月獎金對帳摘要",
}: {
  rows: Row[] | null | undefined;
  title?: string;
}) {
  const src = rows ?? [];
  if (src.length === 0) return null;

  const map = new Map<
    string,
    { count: number; points: number; released: number; waiting: number; other: number; otherCount: number; incomeCount: number }
  >();

  for (const r of src) {
    const t = String(r.bonus_type ?? "unknown");
    const pts = n(r.bonus_points);
    const cur =
      map.get(t) ?? { count: 0, points: 0, released: 0, waiting: 0, other: 0, otherCount: 0, incomeCount: 0 };
    cur.count += 1;
    cur.points += pts;
    if (r.status === "released") cur.released += pts;
    else if (r.status === "waiting_release") cur.waiting += pts;
    else {
      cur.other += pts;
      cur.otherCount += 1;
    }
    if (isIncomeRow(r)) cur.incomeCount += 1;
    map.set(t, cur);
  }

  const byType = Array.from(map.entries())
    .map(([bonus_type, v]) => ({ bonus_type, ...v }))
    .sort((a, b) => b.points - a.points);

  const total = byType.reduce(
    (acc, r) => ({
      count: acc.count + r.count,
      points: acc.points + r.points,
      released: acc.released + r.released,
      waiting: acc.waiting + r.waiting,
      other: acc.other + r.other,
      otherCount: acc.otherCount + r.otherCount,
      incomeCount: acc.incomeCount + r.incomeCount,
    }),
    { count: 0, points: 0, released: 0, waiting: 0, other: 0, otherCount: 0, incomeCount: 0 },
  );

  const balanced = total.released + total.waiting + total.other === total.points;

  return (
    <Card className={balanced ? "" : "border-destructive/50"}>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            <CardDescription className="text-xs">
              以查詢結果全部紀錄（含 0 點 / 已取消）核對：已發放 + 待發放 + 其他狀態 = 應發合計。
            </CardDescription>
          </div>
          <Badge variant={balanced ? "default" : "destructive"}>{balanced ? "結算總計一致" : "結算總計不一致"}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="全部筆數" value={total.count} />
          <Metric label="有收入筆數" value={total.incomeCount} tone="primary" />
          <Metric label="應發點數合計" value={total.points} strong />
          <Metric label="其他狀態點數（取消/失敗等）" value={total.other} />
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>獎金類型</TableHead>
                <TableHead className="text-right">筆數</TableHead>
                <TableHead className="text-right">有收入筆數</TableHead>
                <TableHead className="text-right">應發點數</TableHead>
                <TableHead className="text-right">已發放</TableHead>
                <TableHead className="text-right">待發放</TableHead>
                <TableHead className="text-right">其他狀態</TableHead>
                <TableHead>核對</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byType.map((r) => {
                const ok = r.released + r.waiting + r.other === r.points;
                return (
                  <TableRow key={r.bonus_type}>
                    <TableCell>{bonusTypeLabel(r.bonus_type)}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.count.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.incomeCount.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">{r.points.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums text-primary">{r.released.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.waiting.toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {r.other.toLocaleString()}
                      {r.otherCount > 0 ? `（${r.otherCount} 筆）` : ""}
                    </TableCell>
                    <TableCell>
                      <Badge variant={ok ? "outline" : "destructive"}>{ok ? "一致" : "不一致"}</Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
              <TableRow className="bg-muted/40 font-medium">
                <TableCell>合計</TableCell>
                <TableCell className="text-right tabular-nums">{total.count.toLocaleString()}</TableCell>
                <TableCell className="text-right tabular-nums">{total.incomeCount.toLocaleString()}</TableCell>
                <TableCell className="text-right tabular-nums font-bold">{total.points.toLocaleString()}</TableCell>
                <TableCell className="text-right tabular-nums text-primary">{total.released.toLocaleString()}</TableCell>
                <TableCell className="text-right tabular-nums">{total.waiting.toLocaleString()}</TableCell>
                <TableCell className="text-right tabular-nums text-muted-foreground">
                  {total.other.toLocaleString()}
                </TableCell>
                <TableCell>
                  <Badge variant={balanced ? "outline" : "destructive"}>{balanced ? "一致" : "不一致"}</Badge>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value, strong, tone }: { label: string; value: number; strong?: boolean; tone?: "primary" }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={`mt-1 text-xl tabular-nums ${strong ? "font-bold" : "font-semibold"} ${
          tone === "primary" ? "text-primary" : ""
        }`}
      >
        {value.toLocaleString()}
      </div>
    </div>
  );
}
