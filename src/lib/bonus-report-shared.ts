// 依上傳範本（日獎金總表分開/合計 & 月獎金總表 & 月獎金明細分開.pdf）之欄位定義。
// 資料來源：bonus_records + profiles + calculation_detail（不改業務邏輯，僅呈現）。
// 未有 DB 對應之欄位（如 組織對碰、報件獎金、車馬津貼 …）在 UI/XLS 一律顯示 0，
// 稅額為報表估算，不影響實際發放。

export type BonusRow = {
  id: string;
  member_id: string;
  bonus_type: string | null;
  status: string | null;
  bonus_points: number | null;
  settlement_date: string | null;
  release_date: string | null;
  calculation_detail?: any;
  source_order_id?: string | null;
  source_member_id?: string | null;
  generation_level?: number | null;
  bonus_rate?: number | null;
  base_amount?: number | null;
};

export type MemberInfo = {
  id: string;
  member_no?: string | null;
  name?: string | null;
  is_vip?: boolean | null;
  vip_expires_at?: string | null;
};

/* ─── 欄位定義 ─── */

// 日報：bonus_type → 範本欄位
// 現行 DB 只有 referral / repurchase 屬日結；其餘欄位保留 0 便於未來擴充。
export const DAILY_COLUMN_MAP: Record<string, string> = {
  referral: "推薦獎金",
  repurchase: "消費回饋",
};

// 月報
export const MONTHLY_COLUMN_MAP: Record<string, string> = {
  monthly_vip: "重消獎金",
  rank_rebate: "達成分紅",
  rank_diff_rebate: "超額獎金",
  national_share: "全國分紅",
  business_bonus: "營業分紅",
  upgrade_bonus: "營業分紅",
  repurchase: "重消回饋",
};

export const DAILY_TEMPLATE_COLUMNS = [
  "推薦獎金",
  "組織對碰",
  "營業分紅",
  "消費回饋",
  "報件獎金",
];

export const MONTHLY_TEMPLATE_COLUMNS = [
  "重消獎金",
  "超額獎金",
  "超額對等",
  "推薦王獎金",
  "重消回饋",
  "達成分紅",
  "全國分紅",
  "分球分紅",
  "車馬津貼",
  "應付應扣",
];

/* ─── 稅務估算（本國個人） ─── */
// 逾 1,000 元 → 5% 稅；逾 20,000 元 → 加健保 2.11%。
// 事業團體固定 10%（若後續 profiles 有 entity_type 再切換）。
export function estimateTaxes(total: number, entityType: "individual" | "corp" = "individual") {
  if (entityType === "corp") {
    const t10 = Math.round(total * 0.1);
    return { t5: 0, t10, health: 0, subtotal: total - t10 };
  }
  const t5 = total >= 1000 ? Math.round(total * 0.05) : 0;
  const health = total >= 20000 ? Math.round(total * 0.0211) : 0;
  return { t5, t10: 0, health, subtotal: total - t5 - health };
}

/* ─── 聚合：一列 = 一位會員的一期彙總 ─── */
export type SummaryRow = {
  memberId: string;
  member_no: string;
  name: string;
  columns: Record<string, number>;
  total: number;
  t5: number;
  t10: number;
  health: number;
  subtotal: number;
  address?: string;
  national_id?: string;
  entity_label?: string;
};

export function aggregateMerged(
  rows: BonusRow[],
  members: Record<string, MemberInfo>,
  columnMap: Record<string, string>,
  templateCols: string[],
): SummaryRow[] {
  const map = new Map<string, SummaryRow>();
  for (const r of rows) {
    if (r.status === "cancelled" || r.status === "failed") continue;
    const m = members[r.member_id] ?? { id: r.member_id };
    const key = r.member_id;
    let bucket = map.get(key);
    if (!bucket) {
      const cols: Record<string, number> = {};
      templateCols.forEach((c) => (cols[c] = 0));
      bucket = {
        memberId: key,
        member_no: m.member_no ?? "—",
        name: m.name ?? "—",
        columns: cols,
        total: 0,
        t5: 0,
        t10: 0,
        health: 0,
        subtotal: 0,
      };
      map.set(key, bucket);
    }
    const col = r.bonus_type ? columnMap[r.bonus_type] : undefined;
    const pts = Number(r.bonus_points ?? 0);
    if (col && bucket.columns[col] !== undefined) bucket.columns[col] += pts;
  }
  for (const b of map.values()) {
    b.total = Object.values(b.columns).reduce((s, x) => s + x, 0);
    const t = estimateTaxes(b.total);
    b.t5 = t.t5; b.t10 = t.t10; b.health = t.health; b.subtotal = t.subtotal;
  }
  return Array.from(map.values()).sort((a, b) => a.member_no.localeCompare(b.member_no));
}

// 分開版：同會員每個 bonus_type 各一列
export function aggregateSplit(
  rows: BonusRow[],
  members: Record<string, MemberInfo>,
  columnMap: Record<string, string>,
  templateCols: string[],
): SummaryRow[] {
  const map = new Map<string, SummaryRow>();
  for (const r of rows) {
    if (r.status === "cancelled" || r.status === "failed") continue;
    const m = members[r.member_id] ?? { id: r.member_id };
    const col = r.bonus_type ? columnMap[r.bonus_type] : undefined;
    if (!col) continue;
    const key = `${r.member_id}::${col}`;
    let bucket = map.get(key);
    if (!bucket) {
      const cols: Record<string, number> = {};
      templateCols.forEach((c) => (cols[c] = 0));
      bucket = {
        memberId: r.member_id,
        member_no: m.member_no ?? "—",
        name: m.name ?? "—",
        columns: cols,
        total: 0, t5: 0, t10: 0, health: 0, subtotal: 0,
      };
      map.set(key, bucket);
    }
    bucket.columns[col] += Number(r.bonus_points ?? 0);
  }
  for (const b of map.values()) {
    b.total = Object.values(b.columns).reduce((s, x) => s + x, 0);
    const t = estimateTaxes(b.total);
    b.t5 = t.t5; b.t10 = t.t10; b.health = t.health; b.subtotal = t.subtotal;
  }
  return Array.from(map.values()).sort((a, b) => a.member_no.localeCompare(b.member_no));
}

/* ─── XLS 匯出（HTML table → application/vnd.ms-excel） ─── */
export function exportSummaryXls(opts: {
  periodLabel: string;
  templateCols: string[];
  rows: SummaryRow[];
  filename: string;
  scope: "daily" | "monthly";
}) {
  const { periodLabel, templateCols, rows, filename, scope } = opts;
  const headBase = ["會員編號", "姓名", "身份証號", "証號別"];
  const headTail = ["獎金合計", "5%稅", "10%稅", "健保費", "小計", "地址"];
  const headers = [...headBase, ...templateCols, ...headTail];
  const colspan = headers.length;
  const td = (v: string | number) =>
    `<TD style='text-align:left'>${v ?? ""} </TD>`;
  const tr = (r: SummaryRow) =>
    `<TR>${headBase.map((_, i) => td([r.member_no, r.name, r.national_id ?? "", r.entity_label ?? "本國個人"][i])).join("")}${templateCols
      .map((c) => td(r.columns[c] ?? 0))
      .join("")}${headTail
      .map((_, i) => td([r.total, r.t5, r.t10, r.health, r.subtotal, r.address ?? ""][i]))
      .join("")}</TR>`;

  const html = `<meta http-equiv=Content-Type content=text/html;charset=utf-8><style type=text/css>td{mso-number-format:0;}</style><Table borderColor=black border=1><TR><td align='left' colspan='${colspan}'>獎金期間： ${periodLabel}</td></TR><TR>${headers
    .map((h) => `<TD bgcolor=#fff8dc>${h}</TD>`)
    .join("")}</TR>${rows.map(tr).join("")}</Table>`;

  const blob = new Blob(["\uFEFF" + html], { type: "application/vnd.ms-excel" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}-${scope}-${periodLabel.replace(/[^\d]/g, "")}.xls`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function fmtN(v: any) {
  return Number(v ?? 0).toLocaleString();
}
