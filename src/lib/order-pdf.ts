import html2canvas from "html2canvas";
import jsPDF from "jspdf";

export interface OrderPdfData {
  order: {
    order_no: string;
    customer_name: string;
    customer_email?: string | null;
    customer_phone?: string | null;
    receiver_name?: string;
    receiver_phone?: string;
    shipping_address?: string;
    shipping_method?: string;
    subtotal: number | string;
    shipping_fee: number | string;
    discount_amount: number | string;
    total_amount: number | string;
    order_status: string;
    shipping_status: string;
    payment_status: string;
    created_at: string;
    notes?: string | null;
  };
  items: Array<{
    product_name: string;
    sku?: string | null;
    unit_price: number | string;
    quantity: number | string;
    subtotal: number | string;
  }>;
  payments: Array<{
    paid_at?: string | null;
    created_at: string;
    payment_method: string;
    transaction_id?: string | null;
    payment_status: string;
    amount: number | string;
  }>;
  logoUrl: string;
}

const STATUS_LABEL: Record<string, string> = {
  pending: "待處理", processing: "處理中", completed: "已完成", cancelled: "已取消",
  shipped: "已出貨", delivered: "已送達", returned: "已退貨",
  partial: "部分付款", paid: "已付款", refunded: "已退款",
};
const PAY_METHOD: Record<string, string> = {
  bank_transfer: "銀行轉帳", credit_card: "信用卡", cash: "現金", cod: "貨到付款", other: "其他",
};

const fmt = (n: number | string) =>
  `NT$ ${Number(n ?? 0).toLocaleString("zh-TW", { maximumFractionDigits: 0 })}`;
const esc = (s: unknown) =>
  String(s ?? "—").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

async function urlToDataUrl(url: string): Promise<string> {
  try {
    const res = await fetch(url, { mode: "cors" });
    const blob = await res.blob();
    return await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  } catch {
    return url;
  }
}

function buildOrderHtml(data: Omit<OrderPdfData, "logoUrl">, logoData: string): string {
  const { order, items, payments } = data;
  const now = new Date().toLocaleString("zh-TW", { hour12: false });
  const created = new Date(order.created_at).toLocaleString("zh-TW", { hour12: false });

  const paidTotal = payments
    .filter((p) => p.payment_status === "completed")
    .reduce((s, p) => s + Number(p.amount ?? 0), 0);
  const unpaid = Math.max(0, Number(order.total_amount) - paidTotal);

  const itemsHtml = items.length
    ? items
        .map(
          (it, i) => `<tr style="background:${i % 2 ? "#fafafa" : "#fff"}">
            <td style="padding:8px 10px;font-size:12px;border-bottom:1px solid #e2e8f0">${esc(it.product_name)}</td>
            <td style="padding:8px 10px;font-size:11px;color:#64748b;border-bottom:1px solid #e2e8f0">${esc(it.sku ?? "—")}</td>
            <td style="padding:8px 10px;font-size:12px;text-align:right;border-bottom:1px solid #e2e8f0">${fmt(it.unit_price)}</td>
            <td style="padding:8px 10px;font-size:12px;text-align:right;border-bottom:1px solid #e2e8f0">${esc(it.quantity)}</td>
            <td style="padding:8px 10px;font-size:12px;text-align:right;font-weight:600;border-bottom:1px solid #e2e8f0">${fmt(it.subtotal)}</td>
          </tr>`,
        )
        .join("")
    : `<tr><td colspan="5" style="padding:18px;text-align:center;color:#94a3b8;font-size:12px">無品項</td></tr>`;

  const paymentsHtml = payments.length
    ? payments
        .map(
          (p, i) => `<tr style="background:${i % 2 ? "#fafafa" : "#fff"}">
            <td style="padding:8px 10px;font-size:11px;color:#64748b;border-bottom:1px solid #e2e8f0">${esc(new Date(p.paid_at ?? p.created_at).toLocaleString("zh-TW"))}</td>
            <td style="padding:8px 10px;font-size:12px;border-bottom:1px solid #e2e8f0">${esc(PAY_METHOD[p.payment_method] ?? p.payment_method)}</td>
            <td style="padding:8px 10px;font-size:11px;color:#64748b;border-bottom:1px solid #e2e8f0">${esc(p.transaction_id ?? "—")}</td>
            <td style="padding:8px 10px;font-size:12px;border-bottom:1px solid #e2e8f0">${esc(STATUS_LABEL[p.payment_status] ?? p.payment_status)}</td>
            <td style="padding:8px 10px;font-size:12px;text-align:right;font-weight:600;border-bottom:1px solid #e2e8f0">${fmt(p.amount)}</td>
          </tr>`,
        )
        .join("")
    : `<tr><td colspan="5" style="padding:18px;text-align:center;color:#94a3b8;font-size:12px">尚無付款紀錄</td></tr>`;

  return `
    <div style="width:794px;background:#fff;padding:36px;font-family:'Noto Sans TC','PingFang TC','Microsoft JhengHei',system-ui,sans-serif;color:#0f172a">
      <div style="display:flex;align-items:center;gap:16px;border-bottom:3px solid #7c3aed;padding-bottom:16px;margin-bottom:20px">
        <div style="width:56px;height:56px;border-radius:12px;background:#fff;border:1px solid #e2e8f0;display:flex;align-items:center;justify-content:center;overflow:hidden">
          <img src="${logoData}" style="width:100%;height:100%;object-fit:contain" crossorigin="anonymous" />
        </div>
        <div style="flex:1">
          <div style="font-size:18px;font-weight:700;letter-spacing:0.02em">源倍力 ERP 管理系統</div>
          <div style="font-size:11px;color:#64748b;letter-spacing:0.18em;text-transform:uppercase;margin-top:2px">Sales Order</div>
        </div>
        <div style="text-align:right;font-size:11px;color:#64748b">
          <div>列印時間</div>
          <div style="color:#0f172a;font-weight:500;margin-top:2px">${esc(now)}</div>
        </div>
      </div>

      <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:18px">
        <div>
          <div style="font-size:22px;font-weight:700">銷售訂單</div>
          <div style="font-size:13px;color:#64748b;margin-top:4px">訂單編號：<span style="font-family:'JetBrains Mono',monospace;color:#0f172a">${esc(order.order_no)}</span></div>
          <div style="font-size:12px;color:#64748b;margin-top:2px">建立時間：${esc(created)}</div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">
          <span style="padding:4px 10px;border:1px solid #cbd5e1;border-radius:9999px;font-size:11px">訂單：${esc(STATUS_LABEL[order.order_status] ?? order.order_status)}</span>
          <span style="padding:4px 10px;border:1px solid #cbd5e1;border-radius:9999px;font-size:11px">出貨：${esc(STATUS_LABEL[order.shipping_status] ?? order.shipping_status)}</span>
          <span style="padding:4px 10px;border:1px solid #cbd5e1;border-radius:9999px;font-size:11px">付款：${esc(STATUS_LABEL[order.payment_status] ?? order.payment_status)}</span>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:18px">
        <div style="border:1px solid #e2e8f0;border-radius:8px;padding:12px 14px">
          <div style="font-size:11px;color:#64748b;letter-spacing:0.14em;text-transform:uppercase;margin-bottom:6px">客戶資料</div>
          <div style="font-size:13px;font-weight:600">${esc(order.customer_name)}</div>
          <div style="font-size:12px;color:#475569;margin-top:2px">電話：${esc(order.customer_phone ?? order.receiver_phone ?? "—")}</div>
          <div style="font-size:12px;color:#475569;margin-top:2px">Email：${esc(order.customer_email ?? "—")}</div>
        </div>
        <div style="border:1px solid #e2e8f0;border-radius:8px;padding:12px 14px">
          <div style="font-size:11px;color:#64748b;letter-spacing:0.14em;text-transform:uppercase;margin-bottom:6px">收件 / 配送</div>
          <div style="font-size:13px;font-weight:600">${esc(order.receiver_name ?? order.customer_name)}</div>
          <div style="font-size:12px;color:#475569;margin-top:2px">電話：${esc(order.receiver_phone ?? "—")}</div>
          <div style="font-size:12px;color:#475569;margin-top:2px;line-height:1.5">地址：${esc(order.shipping_address ?? "—")}</div>
        </div>
      </div>

      <div style="margin-bottom:8px;font-size:12px;color:#475569;font-weight:600">訂單品項</div>
      <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:18px">
        <thead><tr style="background:#f1f5f9">
          <th style="text-align:left;padding:10px;font-size:11px;color:#475569;font-weight:600;border-bottom:2px solid #cbd5e1">商品</th>
          <th style="text-align:left;padding:10px;font-size:11px;color:#475569;font-weight:600;border-bottom:2px solid #cbd5e1">SKU</th>
          <th style="text-align:right;padding:10px;font-size:11px;color:#475569;font-weight:600;border-bottom:2px solid #cbd5e1">單價</th>
          <th style="text-align:right;padding:10px;font-size:11px;color:#475569;font-weight:600;border-bottom:2px solid #cbd5e1">數量</th>
          <th style="text-align:right;padding:10px;font-size:11px;color:#475569;font-weight:600;border-bottom:2px solid #cbd5e1">小計</th>
        </tr></thead>
        <tbody>${itemsHtml}</tbody>
      </table>

      <div style="display:grid;grid-template-columns:1fr 280px;gap:12px;margin-bottom:18px">
        <div style="border:1px solid #e2e8f0;border-radius:8px;padding:12px 14px">
          <div style="font-size:11px;color:#64748b;letter-spacing:0.14em;text-transform:uppercase;margin-bottom:6px">備註</div>
          <div style="font-size:12px;color:#0f172a;line-height:1.6;white-space:pre-wrap">${esc(order.notes ?? "—")}</div>
        </div>
        <div style="border:1px solid #e2e8f0;border-radius:8px;padding:12px 14px;background:#f8fafc">
          <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px"><span style="color:#64748b">商品小計</span><span>${fmt(order.subtotal)}</span></div>
          <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px"><span style="color:#64748b">運費</span><span>${fmt(order.shipping_fee)}</span></div>
          <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:6px"><span style="color:#64748b">折扣</span><span>- ${fmt(order.discount_amount)}</span></div>
          <div style="border-top:1px solid #cbd5e1;padding-top:6px;margin-top:4px;display:flex;justify-content:space-between;font-size:14px;font-weight:700"><span>訂單總額</span><span style="color:#7c3aed">${fmt(order.total_amount)}</span></div>
          <div style="display:flex;justify-content:space-between;font-size:12px;margin-top:6px"><span style="color:#64748b">已收款</span><span style="color:#16a34a">${fmt(paidTotal)}</span></div>
          <div style="display:flex;justify-content:space-between;font-size:12px;margin-top:2px"><span style="color:#64748b">未收款</span><span style="color:${unpaid > 0 ? "#d97706" : "#16a34a"}">${fmt(unpaid)}</span></div>
        </div>
      </div>

      <div style="margin-bottom:8px;font-size:12px;color:#475569;font-weight:600">金流紀錄</div>
      <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
        <thead><tr style="background:#f1f5f9">
          <th style="text-align:left;padding:10px;font-size:11px;color:#475569;font-weight:600;border-bottom:2px solid #cbd5e1">日期</th>
          <th style="text-align:left;padding:10px;font-size:11px;color:#475569;font-weight:600;border-bottom:2px solid #cbd5e1">方式</th>
          <th style="text-align:left;padding:10px;font-size:11px;color:#475569;font-weight:600;border-bottom:2px solid #cbd5e1">交易編號</th>
          <th style="text-align:left;padding:10px;font-size:11px;color:#475569;font-weight:600;border-bottom:2px solid #cbd5e1">狀態</th>
          <th style="text-align:right;padding:10px;font-size:11px;color:#475569;font-weight:600;border-bottom:2px solid #cbd5e1">金額</th>
        </tr></thead>
        <tbody>${paymentsHtml}</tbody>
      </table>

      <div style="margin-top:36px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:24px">
        ${["客戶簽收", "業務簽章", "主管簽章"]
          .map(
            (t) => `<div style="text-align:center">
              <div style="border-bottom:1px solid #94a3b8;height:48px"></div>
              <div style="font-size:11px;color:#64748b;margin-top:6px">${t}</div>
            </div>`,
          )
          .join("")}
      </div>

      <div style="margin-top:24px;padding-top:12px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;font-size:10px;color:#94a3b8">
        <div>訂單編號 ${esc(order.order_no)}</div>
        <div>© 源倍力 ERP · 機密文件</div>
      </div>
    </div>`;
}

async function renderHtmlIntoPdf(pdf: jsPDF, html: string, addPageFirst: boolean) {
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-10000px;top:0;z-index:-1";
  host.innerHTML = html;
  document.body.appendChild(host);
  try {
    const node = host.firstElementChild as HTMLElement;
    const canvas = await html2canvas(node, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const imgW = pageW;
    const imgH = (canvas.height * imgW) / canvas.width;
    const img = canvas.toDataURL("image/jpeg", 0.95);

    if (addPageFirst) pdf.addPage();
    if (imgH <= pageH) {
      pdf.addImage(img, "JPEG", 0, 0, imgW, imgH);
    } else {
      let y = 0;
      let first = true;
      while (y < imgH) {
        if (!first) pdf.addPage();
        pdf.addImage(img, "JPEG", 0, -y, imgW, imgH);
        y += pageH;
        first = false;
      }
    }
  } finally {
    document.body.removeChild(host);
  }
}

export async function exportOrderPdf(data: OrderPdfData) {
  const logoData = await urlToDataUrl(data.logoUrl);
  const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
  await renderHtmlIntoPdf(pdf, buildOrderHtml(data, logoData), false);
  pdf.save(`訂單-${data.order.order_no}.pdf`);
}

export type BatchExportFailure = { orderNo: string; error: string };
export type BatchExportResult = {
  success: number;
  failures: BatchExportFailure[];
  cancelled: boolean;
};

export async function exportOrdersPdf(
  orders: Array<Omit<OrderPdfData, "logoUrl">>,
  logoUrl: string,
  options?: {
    filename?: string;
    signal?: AbortSignal;
    onProgress?: (current: number, total: number, orderNo: string) => void;
  },
): Promise<BatchExportResult> {
  const result: BatchExportResult = { success: 0, failures: [], cancelled: false };
  if (orders.length === 0) return result;
  const logoData = await urlToDataUrl(logoUrl);
  const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
  let rendered = 0;

  for (let i = 0; i < orders.length; i++) {
    if (options?.signal?.aborted) {
      result.cancelled = true;
      break;
    }
    const o = orders[i];
    options?.onProgress?.(i + 1, orders.length, o.order.order_no);
    try {
      await renderHtmlIntoPdf(pdf, buildOrderHtml(o, logoData), rendered > 0);
      rendered++;
      result.success++;
    } catch (e: any) {
      result.failures.push({
        orderNo: o.order.order_no,
        error: e?.message ?? String(e),
      });
    }
    // 讓出主執行緒，使取消按鈕可即時反應
    await new Promise((r) => setTimeout(r, 0));
  }

  if (rendered > 0) {
    const name =
      options?.filename ??
      `訂單批次-${rendered}筆${result.cancelled ? "-已取消" : ""}-${Date.now()}.pdf`;
    pdf.save(name);
  }
  return result;
}


