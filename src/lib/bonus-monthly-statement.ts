// 月獎金明細表（依範本 PDF 版型）：每位會員 × 每個結算月份一張。
// 版型：頂端「應發獎金 = 重消 + 超額 + 達成 + 專員」；下方顯示貢獻點錢包；
// 明細表欄位：會員編號 / 會員名稱 / 訂單編號 / 代數 / PV / 獎金% / 台幣獎金
// 小組獎金明細另用：會員代號 / 會員名稱 / PV / 獎金% / 獎金（無訂單）
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

// bonus_type → 範本欄位
const BUCKET_MAP: Record<string, keyof BucketTotals> = {
  referral: "repurchase",           // 重消獎金
  repurchase: "repurchase",         // 重消獎金
  rank_diff_rebate: "excess",       // 超額獎金
  monthly_vip: "achievement",       // 達成分紅
  rank_rebate: "specialist",        // 專員獎金
  business_bonus: "team",           // 小組獎金
  upgrade_bonus: "team",            // 小組獎金
  national_share: "achievement",    // 併入達成
};

type BucketTotals = {
  repurchase: number;
  excess: number;
  achievement: number;
  specialist: number;
  team: number;
};

const EMPTY_BUCKETS = (): BucketTotals => ({
  repurchase: 0, excess: 0, achievement: 0, specialist: 0, team: 0,
});

type Group = {
  key: string;
  memberId: string;
  memberNo: string;
  memberName: string;
  tier: string;
  period: string;
  buckets: BucketTotals;
  bucketRows: Record<keyof BucketTotals, MonthlyStatementRow[]>;
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
        buckets: EMPTY_BUCKETS(),
        bucketRows: { repurchase: [], excess: [], achievement: [], specialist: [], team: [] },
        payable: 0,
      };
      map.set(key, g);
    }
    const pts = n(r.bonus_points);
    const bucket = BUCKET_MAP[r.bonus_type ?? ""] ?? "achievement";
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
  if (!rows.length) return "";
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
  const body = rows.map((r) => {
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
  }).join("");
  const colspan = variant === "team" ? 4 : 6;
  return `
    <div style="margin-top:14px">
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
    <div style="display:inline-block;text-align:center;min-width:78px">
      <div style="border:1px solid #94a3b8;background:#f8fafc;padding:3px 6px;font-size:11px;font-weight:700">${label}</div>
      <div style="border:1px solid #94a3b8;border-top:0;padding:6px;font-size:14px;font-weight:700;color:#0f172a">${val}</div>
    </div>`;
}

function renderStatement(g: Group, members: Members, orders: Orders, printedAt: string, periodTo: string) {
  const b = g.buckets;
  const wallet = g.payable; // 貢獻點錢包：本期入帳點數即等於應發獎金

  return `
    <div style="width:794px;padding:24px 28px;font-family:'Noto Sans TC','PingFang TC','Microsoft JhengHei',sans-serif;color:#0f172a;background:#fff">
      <div style="text-align:center">
        <div style="font-size:19px;font-weight:800;letter-spacing:5px">月 獎 金 明 細 表</div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:10px;font-size:12px;color:#334155">
        <div>期別：<b>${esc(g.period)}</b> ～ <b>${esc(periodTo || g.period)}</b></div>
        <div>列印日期：${esc(printedAt)}</div>
      </div>
      <div style="margin-top:2px;font-size:12px">
        會員：<b>${esc(g.memberNo)}</b>&nbsp;&nbsp;${esc(g.memberName)}
      </div>

      <div style="margin-top:14px;display:flex;align-items:flex-end;gap:6px;flex-wrap:wrap">
        ${boxCell("應發獎金", fmt(g.payable))}
        <div style="font-weight:800;font-size:18px;padding-bottom:8px">=</div>
        ${boxCell("重消獎金", fmt(b.repurchase))}
        <div style="font-weight:800;font-size:18px;padding-bottom:8px">+</div>
        ${boxCell("超額獎金", fmt(b.excess))}
        <div style="font-weight:800;font-size:18px;padding-bottom:8px">+</div>
        ${boxCell("達成分紅", fmt(b.achievement))}
        <div style="font-weight:800;font-size:18px;padding-bottom:8px">+</div>
        ${boxCell("專員獎金", fmt(b.specialist))}
      </div>

      <div style="margin-top:18px">
        ${boxCell("貢獻點錢包", fmt(wallet))}
      </div>

      ${detailTable("重消獎金", g.bucketRows.repurchase, b.repurchase, members, orders)}
      ${detailTable("超額獎金", g.bucketRows.excess, b.excess, members, orders)}
      ${detailTable("達成分紅", g.bucketRows.achievement, b.achievement, members, orders)}
      ${detailTable("專員獎金", g.bucketRows.specialist, b.specialist, members, orders)}
      ${detailTable("小組獎金", g.bucketRows.team, b.team, members, orders, "team")}
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
