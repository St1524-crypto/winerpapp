// 月獎金明細表（依範本 PDF 版型）：每位會員 × 每個結算月份一張。
// 版型（依範本）：
//   第一列：應發獎金 = 重消獎金 + 超額獎金 + 超額對等 + 推薦王獎金 + 重消回饋 + 達成分紅
//   第二列：        + 全國分紅 + 全球分紅 + 車馬津貼 + 專員獎金 + 營業分紅 + 小組獎金
//   第三列：實領獎金 = 應發獎金 - 購物錢包 - 所得稅 + 其他應付 - 其他扣款 - 健保費
// 明細表（有訂單）欄位：會員編號 / 會員名稱 / 訂單編號 / 代數 / PV / 獎金% / 台幣獎金
// 明細表（無訂單）欄位：會員代號 / 會員名稱 / PV / 獎金% / 獎金
import { renderHtmlToCanvas } from "./pdf-iframe-render";
import jsPDF from "jspdf";

export type MonthlyStatementRow = {
  id: string;
  member_id: string;
  bonus_type: string | null;
  status: string | null;
  bonus_points: number | null;
  settlement_date: string | null;
  settlement_batch_id?: string | null;
  source_order_id?: string | null;
  source_member_id?: string | null;
  base_amount?: number | null;
  bonus_rate?: number | null;
  generation_level?: number | null;
  calculation_detail?: any;
};

type Members = Record<string, { name?: string | null; member_no?: string | null }>;
type Orders = Record<string, { order_no?: string | null }>;
type Tiers = Record<string, string>;
type Batches = Record<string, { period?: string | null }>;

// 範本欄位（bucket）定義：key / 標題 / 明細表型式 / 對應現有 bonus_type
type BucketKey =
  | "repurchase"
  | "excess"
  | "excess_match"
  | "referral_king"
  | "repurchase_rebate"
  | "achievement"
  | "national"
  | "global"
  | "transport"
  | "specialist"
  | "business"
  | "team";

const BUCKETS: Array<{
  key: BucketKey;
  label: string;
  variant: "order" | "team";
  types: string[];
}> = [
  { key: "repurchase", label: "重消獎金", variant: "order", types: ["repurchase"] },
  { key: "excess", label: "超額獎金", variant: "order", types: ["rank_diff_rebate"] },
  { key: "excess_match", label: "超額對等", variant: "order", types: [] },
  { key: "referral_king", label: "推薦王獎金", variant: "order", types: ["referral"] },
  { key: "repurchase_rebate", label: "重消回饋", variant: "order", types: [] },
  { key: "achievement", label: "達成分紅", variant: "order", types: ["monthly_vip"] },
  { key: "national", label: "全國分紅", variant: "team", types: ["national_share"] },
  { key: "global", label: "全球分紅", variant: "team", types: [] },
  { key: "transport", label: "車馬津貼", variant: "team", types: [] },
  { key: "specialist", label: "專員獎金", variant: "order", types: ["rank_rebate"] },
  { key: "business", label: "營業分紅", variant: "team", types: ["business_bonus"] },
  { key: "team", label: "小組獎金", variant: "team", types: ["upgrade_bonus"] },
];

const TYPE_TO_BUCKET: Record<string, BucketKey> = BUCKETS.reduce((acc, b) => {
  b.types.forEach((t) => { acc[t] = b.key; });
  return acc;
}, {} as Record<string, BucketKey>);

type BucketTotals = Record<BucketKey, number>;
type BucketRows = Record<BucketKey, MonthlyStatementRow[]>;

const emptyTotals = (): BucketTotals =>
  BUCKETS.reduce((acc, b) => { acc[b.key] = 0; return acc; }, {} as BucketTotals);
const emptyRows = (): BucketRows =>
  BUCKETS.reduce((acc, b) => { acc[b.key] = []; return acc; }, {} as BucketRows);

type Group = {
  key: string;
  memberId: string;
  memberNo: string;
  memberName: string;
  tier: string;
  period: string;
  buckets: BucketTotals;
  bucketRows: BucketRows;
  payable: number;
};

function n(v: any) { return Number(v ?? 0); }
function fmt(v: any) { return n(v).toLocaleString(); }

function periodOf(r: MonthlyStatementRow, batches: Batches) {
  const b = r.settlement_batch_id ? batches[r.settlement_batch_id] : undefined;
  return b?.period ?? (r.settlement_date ? String(r.settlement_date).slice(0, 7) : "—");
}

function groupRows(rows: MonthlyStatementRow[], members: Members, tiers: Tiers, batches: Batches): Group[] {
  const map = new Map<string, Group>();
  for (const r of rows) {
    if (!r.member_id) continue;
    const period = periodOf(r, batches);
    const key = `${r.member_id}::${period}`;
    const m = members[r.member_id] ?? {};
    let g = map.get(key);
    if (!g) {
      g = {
        key,
        memberId: r.member_id,
        memberNo: m.member_no ?? "—",
        memberName: m.name ?? "—",
        tier: tiers[r.member_id] ?? "—",
        period,
        buckets: emptyTotals(),
        bucketRows: emptyRows(),
        payable: 0,
      };
      map.set(key, g);
    }
    const pts = n(r.bonus_points);
    const bucket = TYPE_TO_BUCKET[r.bonus_type ?? ""] ?? "achievement";
    g.buckets[bucket] += pts;
    g.bucketRows[bucket].push(r);
    g.payable += pts;
  }
  return Array.from(map.values()).sort((a, b) =>
    a.period === b.period ? a.memberNo.localeCompare(b.memberNo) : a.period.localeCompare(b.period),
  );
}

function esc(s: unknown) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string
  ));
}

function detailTable(
  title: string,
  rows: MonthlyStatementRow[],
  total: number,
  members: Members,
  orders: Orders,
  variant: "order" | "team" = "order",
) {
  const headOrder = `
    <tr>
      <th style="padding:4px 6px;text-align:left">會員編號</th>
      <th style="padding:4px 6px;text-align:left">會員名稱</th>
      <th style="padding:4px 6px;text-align:left">訂單編號</th>
      <th style="padding:4px 6px;text-align:right">代數</th>
      <th style="padding:4px 6px;text-align:right">PV</th>
      <th style="padding:4px 6px;text-align:right">獎金%</th>
      <th style="padding:4px 6px;text-align:right">台幣獎金</th>
    </tr>`;
  const headTeam = `
    <tr>
      <th style="padding:4px 6px;text-align:left">會員代號</th>
      <th style="padding:4px 6px;text-align:left">會員名稱</th>
      <th style="padding:4px 6px;text-align:right">PV</th>
      <th style="padding:4px 6px;text-align:right">獎金%</th>
      <th style="padding:4px 6px;text-align:right">獎金</th>
    </tr>`;
  const colspan = variant === "team" ? 4 : 6;
  const body = rows.length
    ? rows.map((r) => {
        const src = members[r.source_member_id ?? ""] ?? {};
        const ord = orders[r.source_order_id ?? ""] ?? {};
        const rate = r.bonus_rate != null ? Number(r.bonus_rate).toFixed(2) : "—";
        if (variant === "team") {
          return `
      <tr>
        <td style="padding:4px 6px;border-bottom:1px solid #e5e7eb">${esc(src.member_no ?? "—")}</td>
        <td style="padding:4px 6px;border-bottom:1px solid #e5e7eb">${esc(src.name ?? "—")}</td>
        <td style="padding:4px 6px;border-bottom:1px solid #e5e7eb;text-align:right">${fmt(r.base_amount)}</td>
        <td style="padding:4px 6px;border-bottom:1px solid #e5e7eb;text-align:right">${rate}</td>
        <td style="padding:4px 6px;border-bottom:1px solid #e5e7eb;text-align:right">${fmt(r.bonus_points)}</td>
      </tr>`;
        }
        return `
      <tr>
        <td style="padding:4px 6px;border-bottom:1px solid #e5e7eb">${esc(src.member_no ?? "—")}</td>
        <td style="padding:4px 6px;border-bottom:1px solid #e5e7eb">${esc(src.name ?? "—")}</td>
        <td style="padding:4px 6px;border-bottom:1px solid #e5e7eb;font-family:monospace">${esc(ord.order_no ?? r.source_order_id ?? "—")}</td>
        <td style="padding:4px 6px;border-bottom:1px solid #e5e7eb;text-align:right">${r.generation_level ?? 0}</td>
        <td style="padding:4px 6px;border-bottom:1px solid #e5e7eb;text-align:right">${fmt(r.base_amount)}</td>
        <td style="padding:4px 6px;border-bottom:1px solid #e5e7eb;text-align:right">${rate}</td>
        <td style="padding:4px 6px;border-bottom:1px solid #e5e7eb;text-align:right">${fmt(r.bonus_points)}</td>
      </tr>`;
      }).join("")
    : `<tr><td colspan="${colspan + 1}" style="padding:6px;text-align:center;color:#94a3b8">本期無資料</td></tr>`;
  return `
    <div style="margin-top:12px">
      <div style="font-size:12px;font-weight:700;margin-bottom:3px">${esc(title)}明細</div>
      <table style="width:100%;border-collapse:collapse;font-size:11px;border:1px solid #e5e7eb">
        <thead style="background:#f1f5f9">${variant === "team" ? headTeam : headOrder}</thead>
        <tbody>${body}
          <tr><td colspan="${colspan}" style="padding:4px 6px;text-align:right;font-weight:700">合計</td>
            <td style="padding:4px 6px;text-align:right;font-weight:700">${fmt(total)}</td></tr>
        </tbody>
      </table>
    </div>`;
}

function boxCell(label: string, val: string | number) {
  return `
    <div style="display:inline-block;text-align:center;min-width:74px">
      <div style="border:1px solid #94a3b8;background:#f8fafc;padding:3px 6px;font-size:11px;font-weight:700;white-space:nowrap">${label}</div>
      <div style="border:1px solid #94a3b8;border-top:0;padding:5px;font-size:13px;font-weight:700;color:#0f172a">${val}</div>
    </div>`;
}

function op(symbol: string) {
  return `<div style="font-weight:800;font-size:16px;padding-bottom:6px">${symbol}</div>`;
}

function renderStatement(g: Group, members: Members, orders: Orders, printedAt: string, periodTo: string) {
  const b = g.buckets;
  const rowOne = BUCKETS.slice(0, 6);
  const rowTwo = BUCKETS.slice(6, 12);
  // 扣款欄位目前系統未串接（購物錢包 / 所得稅 / 其他應付 / 其他扣款 / 健保費），一律為 0。
  const deductions = { wallet: 0, tax: 0, otherPayable: 0, otherDeduct: 0, insurance: 0 };
  const net = g.payable - deductions.wallet - deductions.tax + deductions.otherPayable
    - deductions.otherDeduct - deductions.insurance;

  return `
    <div style="width:794px;padding:22px 26px;font-family:'Noto Sans TC','PingFang TC','Microsoft JhengHei',sans-serif;color:#0f172a;background:#fff">
      <div style="text-align:center">
        <div style="font-size:19px;font-weight:800;letter-spacing:5px">月 獎 金 明 細 表</div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:10px;font-size:12px;color:#334155">
        <div>期別：<b>${esc(g.period)}</b> ～ <b>${esc(periodTo || g.period)}</b></div>
        <div>列印日期：${esc(printedAt)}</div>
      </div>
      <div style="margin-top:2px;font-size:12px">
        會員：<b>${esc(g.memberNo)}</b>&nbsp;&nbsp;${esc(g.memberName)}${g.tier && g.tier !== "—" ? `　（${esc(g.tier)}）` : ""}
      </div>

      <div style="margin-top:14px;display:flex;align-items:flex-end;gap:5px;flex-wrap:nowrap">
        ${boxCell("應發獎金", fmt(g.payable))}
        ${op("=")}
        ${rowOne.map((x, i) => `${i ? op("+") : ""}${boxCell(x.label, fmt(b[x.key]))}`).join("")}
      </div>
      <div style="margin-top:6px;display:flex;align-items:flex-end;gap:5px;flex-wrap:nowrap;padding-left:96px">
        ${op("+")}
        ${rowTwo.map((x, i) => `${i ? op("+") : ""}${boxCell(x.label, fmt(b[x.key]))}`).join("")}
      </div>

      <div style="margin-top:14px;display:flex;align-items:flex-end;gap:5px;flex-wrap:nowrap">
        ${boxCell("實領獎金", fmt(net))}
        ${op("=")}
        ${boxCell("應發獎金", fmt(g.payable))}
        ${op("-")}
        ${boxCell("購物錢包", fmt(deductions.wallet))}
        ${op("-")}
        ${boxCell("所得稅", fmt(deductions.tax))}
        ${op("+")}
        ${boxCell("其他應付", fmt(deductions.otherPayable))}
        ${op("-")}
        ${boxCell("其他扣款", fmt(deductions.otherDeduct))}
        ${op("-")}
        ${boxCell("健保費", fmt(deductions.insurance))}
      </div>

      ${BUCKETS.map((x) => detailTable(x.label, g.bucketRows[x.key], b[x.key], members, orders, x.variant)).join("")}
    </div>`;
}

export async function exportMonthlyBonusStatements(opts: {
  rows: MonthlyStatementRow[];
  members: Members;
  orders: Orders;
  tiers: Tiers;
  batches?: Batches;
  periodTo?: string;
  filename?: string;
}) {
  const batches = opts.batches ?? {};
  const groups = groupRows(opts.rows, opts.members, opts.tiers, batches);
  if (!groups.length) throw new Error("無資料可產出");

  const printedAt = new Date().toLocaleDateString("zh-TW");
  const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();

  for (let i = 0; i < groups.length; i++) {
    const html = renderStatement(groups[i], opts.members, opts.orders, printedAt, opts.periodTo ?? "");
    const canvas = await renderHtmlToCanvas(html, { width: 830, scale: 2 });
    const img = canvas.toDataURL("image/jpeg", 0.95);
    const imgW = pageW;
    const imgH = (canvas.height * imgW) / canvas.width;
    if (i > 0) pdf.addPage();
    if (imgH <= pageH) {
      pdf.addImage(img, "JPEG", 0, 0, imgW, imgH);
    } else {
      let y = 0;
      while (y < imgH) {
        pdf.addImage(img, "JPEG", 0, -y, imgW, imgH);
        y += pageH;
        if (y < imgH) pdf.addPage();
      }
    }
  }
  pdf.save(opts.filename ?? `月獎金明細表-${Date.now()}.pdf`);

  return groups.length;
}
