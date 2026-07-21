// 日獎金明細表（依範本 PDF 版型）：每位會員 × 每個結算日期一張。
// 以 UI 端 payload（listDailyBonusDetails 回傳的 rows/members/orders/tiers）為資料源，
// 由 html2canvas + jsPDF 逐張匯出成一份 PDF。
import jsPDF from "jspdf";
import { renderHtmlToCanvas } from "./pdf-iframe-render";

export type StatementRow = {
  id: string;
  member_id: string;
  bonus_type: string | null;
  status: string | null;
  bonus_points: number | null;
  settlement_date: string | null;
  source_order_id?: string | null;
  source_member_id?: string | null;
  base_amount?: number | null;
  bonus_rate?: number | null;
};

type Members = Record<string, { name?: string | null; member_no?: string | null }>;
type Orders = Record<string, { order_no?: string | null }>;
type Tiers = Record<string, string>;

function n(v: any) { return Number(v ?? 0); }
function fmt(v: any) { return n(v).toLocaleString(); }
function fmtDate(s: string | null | undefined) { return (s ?? "").slice(0, 10).replace(/-/g, "/"); }

// 稅務估算（本國個人）：≥1,000 → 5% 所得稅；≥20,000 → 2.11% 健保費。
function estimateTax(total: number) {
  const tax = total >= 1000 ? Math.round(total * 0.05) : 0;
  const health = total >= 20000 ? Math.round(total * 0.0211) : 0;
  return { tax, health, net: total - tax - health };
}

type Group = {
  key: string;
  memberId: string;
  memberNo: string;
  memberName: string;
  tier: string;
  date: string;
  referral: StatementRow[];   // 推薦獎金明細
  business: StatementRow[];   // 達成分紅獎金明細（repurchase / business_bonus / 其他）
  referralTotal: number;
  businessTotal: number;
  payable: number;
};

function groupRows(rows: StatementRow[], members: Members, tiers: Tiers): Group[] {
  const map = new Map<string, Group>();
  for (const r of rows) {
    if (!r.settlement_date || !r.member_id) continue;
    const key = `${r.member_id}::${r.settlement_date}`;
    const m = members[r.member_id] ?? {};
    let g = map.get(key);
    if (!g) {
      g = {
        key,
        memberId: r.member_id,
        memberNo: m.member_no ?? "—",
        memberName: m.name ?? "—",
        tier: tiers[r.member_id] ?? "—",
        date: r.settlement_date,
        referral: [], business: [],
        referralTotal: 0, businessTotal: 0, payable: 0,
      };
      map.set(key, g);
    }
    const pts = n(r.bonus_points);
    if (r.bonus_type === "referral") {
      g.referral.push(r);
      g.referralTotal += pts;
    } else {
      g.business.push(r);
      g.businessTotal += pts;
    }
    g.payable += pts;
  }
  return Array.from(map.values()).sort((a, b) =>
    a.date === b.date ? a.memberNo.localeCompare(b.memberNo) : a.date.localeCompare(b.date),
  );
}

function esc(s: unknown) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string
  ));
}

function renderStatement(g: Group, members: Members, orders: Orders, printedAt: string) {
  const { tax, health, net } = estimateTax(g.payable);
  const referralRows = g.referral.map((r) => {
    const src = members[r.source_member_id ?? ""] ?? {};
    const ord = orders[r.source_order_id ?? ""] ?? {};
    return `
      <tr>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb">${esc(src.member_no ?? "—")}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb">${esc(src.name ?? "—")}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;font-family:monospace">${esc(ord.order_no ?? r.source_order_id ?? "—")}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:right">${fmt(r.base_amount)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:right">${r.bonus_rate != null ? Number(r.bonus_rate).toFixed(2) : "—"}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:right">${fmt(r.bonus_points)}</td>
      </tr>`;
  }).join("");

  const businessRows = g.business.map((r) => `
      <tr>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb">${esc(g.memberNo)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb">${esc(g.memberName)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e7eb;text-align:right">${fmt(r.bonus_points)}</td>
      </tr>`).join("");

  const box = (label: string, val: string | number, op = "") => `
    <div style="text-align:center;min-width:78px">
      ${op ? `<div style="font-weight:700;font-size:14px;color:#111">${op}</div>` : ""}
      <div style="font-size:11px;color:#475569">${label}</div>
      <div style="font-size:16px;font-weight:700;color:#0f172a">${val}</div>
    </div>`;

  return `
    <div style="width:794px;padding:28px 32px;font-family:'Noto Sans TC','PingFang TC','Microsoft JhengHei',sans-serif;color:#0f172a;background:#fff">
      <div style="text-align:center">
        <div style="font-size:16px;font-weight:700">源倍力 ERP</div>
        <div style="font-size:20px;font-weight:800;letter-spacing:6px;margin-top:2px">日 獎 金 明 細 表</div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-top:12px;font-size:12px;color:#334155">
        <div>期別：<b>${esc(fmtDate(g.date))}</b> ～ <b>${esc(fmtDate(g.date))}</b></div>
        <div>列印日期：${esc(printedAt)}</div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:6px;font-size:12px">
        <div>會員：<b>${esc(g.memberNo)}</b> ${esc(g.memberName)}</div>
        <div>當期首購：0</div>
        <div>算後位階：${esc(g.tier)}</div>
      </div>

      <div style="margin-top:14px;border:1px solid #cbd5e1;border-radius:6px;padding:10px 14px">
        <div style="display:flex;align-items:center;justify-content:space-around">
          ${box("應發獎金", fmt(g.payable))}
          <div style="font-size:14px;font-weight:700">=</div>
          ${box("推薦獎金", fmt(g.referralTotal))}
          <div style="font-size:14px;font-weight:700">+</div>
          ${box("輔導獎金", 0)}
          <div style="font-size:14px;font-weight:700">+</div>
          ${box("報件獎金", 0)}
        </div>
      </div>

      <div style="margin-top:10px;border:1px solid #cbd5e1;border-radius:6px;padding:10px 14px">
        <div style="display:flex;align-items:center;justify-content:space-around">
          ${box("實領獎金", fmt(net))}
          <div style="font-size:14px;font-weight:700">=</div>
          ${box("應發獎金", fmt(g.payable))}
          <div style="font-size:14px;font-weight:700">−</div>
          ${box("購物錢包", 0)}
          <div style="font-size:14px;font-weight:700">−</div>
          ${box("健保費", fmt(health))}
          <div style="font-size:14px;font-weight:700">−</div>
          ${box("所得稅", fmt(tax))}
        </div>
      </div>

      ${g.referral.length ? `
      <div style="margin-top:16px">
        <div style="font-size:13px;font-weight:700;margin-bottom:4px">推薦獎金明細</div>
        <table style="width:100%;border-collapse:collapse;font-size:12px;border:1px solid #e5e7eb">
          <thead style="background:#f1f5f9">
            <tr>
              <th style="padding:6px 8px;text-align:left">會員編號</th>
              <th style="padding:6px 8px;text-align:left">會員名稱</th>
              <th style="padding:6px 8px;text-align:left">訂單編號</th>
              <th style="padding:6px 8px;text-align:right">PV</th>
              <th style="padding:6px 8px;text-align:right">%</th>
              <th style="padding:6px 8px;text-align:right">獎金</th>
            </tr>
          </thead>
          <tbody>${referralRows}
            <tr><td colspan="5" style="padding:6px 8px;text-align:right;font-weight:700">合計</td>
              <td style="padding:6px 8px;text-align:right;font-weight:700">${fmt(g.referralTotal)}</td></tr>
          </tbody>
        </table>
      </div>` : ""}

      ${g.business.length ? `
      <div style="margin-top:16px">
        <div style="font-size:13px;font-weight:700;margin-bottom:4px">達成分紅獎金明細</div>
        <table style="width:100%;border-collapse:collapse;font-size:12px;border:1px solid #e5e7eb">
          <thead style="background:#f1f5f9">
            <tr>
              <th style="padding:6px 8px;text-align:left">會員編號</th>
              <th style="padding:6px 8px;text-align:left">會員名稱</th>
              <th style="padding:6px 8px;text-align:right">獎金</th>
            </tr>
          </thead>
          <tbody>${businessRows}
            <tr><td colspan="2" style="padding:6px 8px;text-align:right;font-weight:700">合計</td>
              <td style="padding:6px 8px;text-align:right;font-weight:700">${fmt(g.businessTotal)}</td></tr>
          </tbody>
        </table>
      </div>` : ""}

      <div style="margin-top:12px;font-size:10px;color:#94a3b8;text-align:right">
        稅額為報表估算（本國個人：≥1,000 加 5% 所得稅，≥20,000 加 2.11% 健保費），不影響實際發放。
      </div>
    </div>`;
}

export async function exportDailyBonusStatements(opts: {
  rows: StatementRow[];
  members: Members;
  orders: Orders;
  tiers: Tiers;
  filename?: string;
}) {
  const groups = groupRows(opts.rows, opts.members, opts.tiers);
  if (!groups.length) throw new Error("無資料可產出");

  const printedAt = new Date().toLocaleDateString("zh-TW");
  const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();

  for (let i = 0; i < groups.length; i++) {
    const html = renderStatement(groups[i], opts.members, opts.orders, printedAt);
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
  pdf.save(opts.filename ?? `日獎金明細表-${Date.now()}.pdf`);

  return groups.length;
}

