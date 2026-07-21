// 月獎金明細表（依範本 PDF 版型）：每位會員 × 每個結算月份一張。
// 資料源為 listMonthlyBonusDetails 回傳的 rows/members/orders/tiers/batches。
// 由 html2canvas + jsPDF 逐張匯出成一份 PDF。
import html2canvas from "html2canvas";
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
  calculation_detail?: any;
};

type Members = Record<string, { name?: string | null; member_no?: string | null }>;
type Orders = Record<string, { order_no?: string | null }>;
type Tiers = Record<string, string>;
type Batches = Record<string, { period?: string | null }>;

// 現行制度 bonus_type → 範本欄位對照
// 範本欄位：重消獎金 / 超額獎金 / 超額對等 / 推薦王獎金 / 重消回饋 / 達成分紅
//         全國分紅 / 全球分紅 / 車馬津貼 / 專員獎金 / 營業分紅 / 小組獎金
const BUCKET_MAP: Record<string, keyof BucketTotals> = {
  referral: "repurchase",           // 日推薦累計 → 重消獎金欄
  repurchase: "repurchase_rebate",  // 復購獎勵 → 重消回饋欄
  monthly_vip: "achievement",       // 月 VIP → 達成分紅
  rank_rebate: "specialist",        // 階級回饋 → 專員獎金
  rank_diff_rebate: "excess",       // 階級差額回饋 → 超額獎金（超額回饋）
  business_bonus: "business",       // 營業分紅
  national_share: "national",       // 全國分紅（同步鏡射至全球分紅欄）
  upgrade_bonus: "business",        // 升級分紅 → 營業分紅欄
};

type BucketTotals = {
  repurchase: number;
  excess: number;
  excess_equal: number;
  referral_king: number;
  repurchase_rebate: number;
  achievement: number;
  national: number;
  global: number;
  travel: number;
  specialist: number;
  business: number;
  team: number;
};

const EMPTY_BUCKETS = (): BucketTotals => ({
  repurchase: 0, excess: 0, excess_equal: 0, referral_king: 0,
  repurchase_rebate: 0, achievement: 0, national: 0, global: 0,
  travel: 0, specialist: 0, business: 0, team: 0,
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

function estimateTax(total: number) {
  const tax = total >= 1000 ? Math.round(total * 0.05) : 0;
  const health = total >= 20000 ? Math.round(total * 0.0211) : 0;
  return { tax, health, net: total - tax - health };
}

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
        bucketRows: {
          repurchase: [], excess: [], excess_equal: [], referral_king: [],
          repurchase_rebate: [], achievement: [], national: [], global: [],
          travel: [], specialist: [], business: [], team: [],
        },
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

function detailTable(title: string, rows: MonthlyStatementRow[], total: number, members: Members, orders: Orders) {
  if (!rows.length) return "";
  const body = rows.map((r) => {
    const src = members[r.source_member_id ?? ""] ?? {};
    const ord = orders[r.source_order_id ?? ""] ?? {};
    return `
      <tr>
        <td style="padding:4px 6px;border-bottom:1px solid #e5e7eb">${esc(src.member_no ?? "—")}</td>
        <td style="padding:4px 6px;border-bottom:1px solid #e5e7eb">${esc(src.name ?? "—")}</td>
        <td style="padding:4px 6px;border-bottom:1px solid #e5e7eb;font-family:monospace">${esc(ord.order_no ?? r.source_order_id ?? "—")}</td>
        <td style="padding:4px 6px;border-bottom:1px solid #e5e7eb;text-align:right">${fmt(r.base_amount)}</td>
        <td style="padding:4px 6px;border-bottom:1px solid #e5e7eb;text-align:right">${r.bonus_rate != null ? Number(r.bonus_rate).toFixed(2) : "—"}</td>
        <td style="padding:4px 6px;border-bottom:1px solid #e5e7eb;text-align:right">${fmt(r.bonus_points)}</td>
      </tr>`;
  }).join("");
  return `
    <div style="margin-top:14px">
      <div style="font-size:12px;font-weight:700;margin-bottom:3px">${esc(title)}明細</div>
      <table style="width:100%;border-collapse:collapse;font-size:11px;border:1px solid #e5e7eb">
        <thead style="background:#f1f5f9">
          <tr>
            <th style="padding:4px 6px;text-align:left">會員代號</th>
            <th style="padding:4px 6px;text-align:left">會員名稱</th>
            <th style="padding:4px 6px;text-align:left">訂單</th>
            <th style="padding:4px 6px;text-align:right">PV</th>
            <th style="padding:4px 6px;text-align:right">獎金%</th>
            <th style="padding:4px 6px;text-align:right">獎金</th>
          </tr>
        </thead>
        <tbody>${body}
          <tr><td colspan="5" style="padding:4px 6px;text-align:right;font-weight:700">合計</td>
            <td style="padding:4px 6px;text-align:right;font-weight:700">${fmt(total)}</td></tr>
        </tbody>
      </table>
    </div>`;
}

function renderStatement(g: Group, members: Members, orders: Orders, printedAt: string, periodTo: string) {
  const { tax, health, net } = estimateTax(g.payable);
  const wallet = 0; // 購物錢包扣抵：目前系統未串接扣抵，先呈現 0
  const b = g.buckets;

  const cell = (label: string, val: string | number, op = "") => `
    <div style="text-align:center;min-width:64px">
      ${op ? `<div style="font-weight:700;font-size:13px;color:#111">${op}</div>` : ""}
      <div style="font-size:10px;color:#475569">${label}</div>
      <div style="font-size:14px;font-weight:700;color:#0f172a">${val}</div>
    </div>`;

  return `
    <div style="width:794px;padding:24px 28px;font-family:'Noto Sans TC','PingFang TC','Microsoft JhengHei',sans-serif;color:#0f172a;background:#fff">
      <div style="text-align:center">
        <div style="font-size:15px;font-weight:700">源倍力 ERP</div>
        <div style="font-size:19px;font-weight:800;letter-spacing:5px;margin-top:2px">月 獎 金 明 細 表</div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:10px;font-size:11px;color:#334155">
        <div>期別：<b>${esc(g.period)}</b> ～ <b>${esc(periodTo || g.period)}</b></div>
        <div>列印日期：${esc(printedAt)}</div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px;font-size:11px">
        <div>會員：<b>${esc(g.memberNo)}</b> ${esc(g.memberName)}</div>
        <div>算後位階：${esc(g.tier)}</div>
      </div>

      <div style="margin-top:12px;border:1px solid #cbd5e1;border-radius:6px;padding:10px 12px">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:4px">
          ${cell("應發獎金", fmt(g.payable))}
          <div style="font-weight:700">=</div>
          ${cell("重消獎金", fmt(b.repurchase))}
          <div style="font-weight:700">+</div>
          ${cell("超額獎金", fmt(b.excess))}
          <div style="font-weight:700">+</div>
          ${cell("超額對等", fmt(b.excess_equal))}
          <div style="font-weight:700">+</div>
          ${cell("推薦王獎金", fmt(b.referral_king))}
          <div style="font-weight:700">+</div>
          ${cell("重消回饋", fmt(b.repurchase_rebate))}
          <div style="font-weight:700">+</div>
          ${cell("達成分紅", fmt(b.achievement))}
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:4px;margin-top:6px">
          <div style="min-width:64px"></div>
          <div style="min-width:14px"></div>
          ${cell("全國分紅", fmt(b.national))}
          <div style="font-weight:700">+</div>
          ${cell("全球分紅", fmt(b.global))}
          <div style="font-weight:700">+</div>
          ${cell("車馬津貼", fmt(b.travel))}
          <div style="font-weight:700">+</div>
          ${cell("專員獎金", fmt(b.specialist))}
          <div style="font-weight:700">+</div>
          ${cell("營業分紅", fmt(b.business))}
          <div style="font-weight:700">+</div>
          ${cell("小組獎金", fmt(b.team))}
        </div>
      </div>

      <div style="margin-top:8px;border:1px solid #cbd5e1;border-radius:6px;padding:10px 12px">
        <div style="display:flex;align-items:center;justify-content:space-around;flex-wrap:wrap;gap:4px">
          ${cell("實領獎金", fmt(net))}
          <div style="font-weight:700">=</div>
          ${cell("應發獎金", fmt(g.payable))}
          <div style="font-weight:700">−</div>
          ${cell("購物錢包", fmt(wallet))}
          <div style="font-weight:700">−</div>
          ${cell("所得稅", fmt(tax))}
          <div style="font-weight:700">+</div>
          ${cell("其他應付", 0)}
          <div style="font-weight:700">−</div>
          ${cell("其他扣款", 0)}
          <div style="font-weight:700">−</div>
          ${cell("健保費", fmt(health))}
        </div>
      </div>

      ${detailTable("重消獎金", g.bucketRows.repurchase, b.repurchase, members, orders)}
      ${detailTable("超額獎金", g.bucketRows.excess, b.excess, members, orders)}
      ${detailTable("超額對等", g.bucketRows.excess_equal, b.excess_equal, members, orders)}
      ${detailTable("推薦王獎金", g.bucketRows.referral_king, b.referral_king, members, orders)}
      ${detailTable("重消回饋", g.bucketRows.repurchase_rebate, b.repurchase_rebate, members, orders)}
      ${detailTable("達成分紅", g.bucketRows.achievement, b.achievement, members, orders)}
      ${detailTable("全國分紅", g.bucketRows.national, b.national, members, orders)}
      ${detailTable("車馬津貼", g.bucketRows.travel, b.travel, members, orders)}
      ${detailTable("專員獎金", g.bucketRows.specialist, b.specialist, members, orders)}
      ${detailTable("營業分紅", g.bucketRows.business, b.business, members, orders)}
      ${detailTable("小組獎金", g.bucketRows.team, b.team, members, orders)}

      <div style="margin-top:10px;font-size:10px;color:#94a3b8;text-align:right">
        稅額為報表估算（本國個人：≥1,000 加 5% 所得稅，≥20,000 加 2.11% 健保費），不影響實際發放。
        購物錢包扣抵目前未串接，顯示 0。
      </div>
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

  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-10000px;top:0;z-index:-1";
  document.body.appendChild(host);

  try {
    for (let i = 0; i < groups.length; i++) {
      host.innerHTML = renderStatement(groups[i], opts.members, opts.orders, printedAt, opts.periodTo ?? "");
      const node = host.firstElementChild as HTMLElement;
      const canvas = await html2canvas(node, { scale: 2, backgroundColor: "#ffffff" });
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
  } finally {
    document.body.removeChild(host);
  }

  return groups.length;
}
