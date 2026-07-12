// 共用：日期快捷 preset（今日 / 本週 / 本月 / 上月 / 自訂）
export type BonusDatePreset = "today" | "this_week" | "this_month" | "last_month" | "custom";

function pad(n: number) { return String(n).padStart(2, "0"); }
function fmt(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

export function computePreset(preset: BonusDatePreset): { dateFrom: string; dateTo: string } | null {
  const now = new Date();
  if (preset === "today") {
    const s = fmt(now);
    return { dateFrom: s, dateTo: s };
  }
  if (preset === "this_week") {
    const day = now.getDay(); // 0 Sun
    const start = new Date(now);
    start.setDate(now.getDate() - ((day + 6) % 7)); // 週一起
    const end = new Date(start); end.setDate(start.getDate() + 6);
    return { dateFrom: fmt(start), dateTo: fmt(end) };
  }
  if (preset === "this_month") {
    const s = new Date(now.getFullYear(), now.getMonth(), 1);
    const e = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { dateFrom: fmt(s), dateTo: fmt(e) };
  }
  if (preset === "last_month") {
    const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const e = new Date(now.getFullYear(), now.getMonth(), 0);
    return { dateFrom: fmt(s), dateTo: fmt(e) };
  }
  return null;
}

export const PRESET_OPTIONS: { value: BonusDatePreset; label: string }[] = [
  { value: "today", label: "今日" },
  { value: "this_week", label: "本週" },
  { value: "this_month", label: "本月" },
  { value: "last_month", label: "上月" },
  { value: "custom", label: "自訂" },
];
