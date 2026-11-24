/** 分月責任額：拆分與下一個應重購日（純函式，可測試） */
export function ymAdd(ym: string, n: number): string {
  const y = Number(ym.slice(0, 4)), m = Number(ym.slice(4, 6)) - 1 + n;
  const yy = y + Math.floor(m / 12), mm = ((m % 12) + 12) % 12 + 1;
  return `${yy}${String(mm).padStart(2, "0")}`;
}

/** 依每月責任額拆分：1000 點、200/月 → 5 個月各 200；餘數併入第一個月 */
export function splitPointsByMonth(points: number, startYm: string, required: number): { ym: string; points: number }[] {
  const total = Math.floor(points);
  if (total <= 0) return [];
  if (required <= 0 || total < required * 2) return [{ ym: startYm, points: total }];
  const n = Math.floor(total / required);
  return Array.from({ length: n }, (_, i) => ({
    ym: ymAdd(startYm, i),
    points: i === 0 ? total - required * (n - 1) : required,
  }));
}

/** 從本月起連續達標的月份之後，第一個未達標月份的 1 日（YYYY-MM-DD） */
export function nextRepurchaseDate(rows: { ym: string; points: number }[], currentYm: string, required: number): string {
  const map = new Map(rows.map((r) => [String(r.ym), Number(r.points ?? 0)]));
  let ym = currentYm;
  for (let i = 0; i < 120 && (map.get(ym) ?? 0) >= required; i++) ym = ymAdd(ym, 1);
  return `${ym.slice(0, 4)}-${ym.slice(4, 6)}-01`;
}
