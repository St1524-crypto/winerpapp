// 收入判斷：只把「有收入」的獎金列入明細與總表。
// - bonus_points > 0
// - status ∈ { waiting_release, released }
// - 排除 cancelled / failed / pending / 0 點
// 供 /admin/bonuses/{daily-details, monthly-details, member-details, summary} 共用。

export const INCOME_STATUSES = new Set(["waiting_release", "released"]);

export function isIncomeRow(r: any): boolean {
  if (!r) return false;
  const pts = Number(r.bonus_points ?? 0);
  if (!Number.isFinite(pts) || pts <= 0) return false;
  return INCOME_STATUSES.has(String(r.status));
}

export function filterIncome<T>(rows: T[] | null | undefined): T[] {
  return (rows ?? []).filter(isIncomeRow as any);
}

export type IncomeSummary = {
  totalCount: number;
  totalPoints: number;
  releasedPoints: number;
  waitingPoints: number;
  byType: Array<{ bonus_type: string; count: number; points: number; released: number; waiting: number }>;
};

export function summarizeIncome(rows: any[] | null | undefined): IncomeSummary {
  const src = filterIncome(rows);
  const map = new Map<string, { count: number; points: number; released: number; waiting: number }>();
  let totalPoints = 0;
  let releasedPoints = 0;
  let waitingPoints = 0;
  for (const r of src) {
    const pts = Number(r.bonus_points ?? 0);
    totalPoints += pts;
    if (r.status === "released") releasedPoints += pts;
    else if (r.status === "waiting_release") waitingPoints += pts;
    const t = String(r.bonus_type ?? "unknown");
    const cur = map.get(t) ?? { count: 0, points: 0, released: 0, waiting: 0 };
    cur.count += 1;
    cur.points += pts;
    if (r.status === "released") cur.released += pts;
    else if (r.status === "waiting_release") cur.waiting += pts;
    map.set(t, cur);
  }
  return {
    totalCount: src.length,
    totalPoints,
    releasedPoints,
    waitingPoints,
    byType: Array.from(map.entries())
      .map(([bonus_type, v]) => ({ bonus_type, ...v }))
      .sort((a, b) => b.points - a.points),
  };
}
