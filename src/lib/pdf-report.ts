import html2canvas from "html2canvas-pro";
import jsPDF from "jspdf";

export interface ReportColumn<T> {
  key: keyof T | string;
  label: string;
  align?: "left" | "right" | "center";
  format?: (row: T) => string | number;
}

export interface ReportOptions<T> {
  title: string;
  subtitle?: string;
  columns: ReportColumn<T>[];
  rows: T[];
  logoUrl: string;
  filename?: string;
  meta?: Record<string, string | number>;
}

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

function escape(s: unknown): string {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}

export async function exportPdfReport<T>(opts: ReportOptions<T>) {
  const logoData = await urlToDataUrl(opts.logoUrl);
  const now = new Date().toLocaleString("zh-TW", { hour12: false });

  const metaRows = Object.entries(opts.meta ?? {})
    .map(([k, v]) => `<div><span style="color:#64748b">${escape(k)}：</span><span>${escape(v)}</span></div>`)
    .join("");

  const headHtml = opts.columns
    .map((c) => `<th style="text-align:${c.align ?? "left"};padding:10px 12px;background:#f1f5f9;font-size:12px;color:#475569;font-weight:600;border-bottom:2px solid #cbd5e1">${escape(c.label)}</th>`)
    .join("");

  const bodyHtml = opts.rows
    .map(
      (row, i) =>
        `<tr style="background:${i % 2 ? "#fafafa" : "#fff"}">` +
        opts.columns
          .map((c) => {
            const val = c.format ? c.format(row) : (row as any)[c.key];
            return `<td style="text-align:${c.align ?? "left"};padding:10px 12px;font-size:12px;color:#0f172a;border-bottom:1px solid #e2e8f0">${escape(val)}</td>`;
          })
          .join("") +
        "</tr>",
    )
    .join("");

  const html = `
    <div id="__pdf_report" style="width:794px;background:#fff;padding:36px;font-family:'Noto Sans TC','PingFang TC','Microsoft JhengHei',system-ui,sans-serif;color:#0f172a">
      <div style="display:flex;align-items:center;gap:16px;border-bottom:3px solid #7c3aed;padding-bottom:16px;margin-bottom:20px">
        <div style="width:56px;height:56px;border-radius:12px;background:#fff;border:1px solid #e2e8f0;display:flex;align-items:center;justify-content:center;overflow:hidden">
          <img src="${logoData}" style="width:100%;height:100%;object-fit:contain" crossorigin="anonymous" />
        </div>
        <div style="flex:1">
          <div style="font-size:18px;font-weight:700;letter-spacing:0.02em">源倍力 ERP 管理系統</div>
          <div style="font-size:11px;color:#64748b;letter-spacing:0.18em;text-transform:uppercase;margin-top:2px">Enterprise Resource Platform</div>
        </div>
        <div style="text-align:right;font-size:11px;color:#64748b">
          <div>產生時間</div>
          <div style="color:#0f172a;font-weight:500;margin-top:2px">${escape(now)}</div>
        </div>
      </div>

      <div style="margin-bottom:18px">
        <div style="font-size:22px;font-weight:700">${escape(opts.title)}</div>
        ${opts.subtitle ? `<div style="font-size:13px;color:#64748b;margin-top:4px">${escape(opts.subtitle)}</div>` : ""}
        ${metaRows ? `<div style="display:flex;gap:18px;flex-wrap:wrap;font-size:12px;margin-top:10px">${metaRows}</div>` : ""}
      </div>

      <table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
        <thead><tr>${headHtml}</tr></thead>
        <tbody>${bodyHtml || `<tr><td colspan="${opts.columns.length}" style="padding:24px;text-align:center;color:#94a3b8;font-size:12px">無資料</td></tr>`}</tbody>
      </table>

      <div style="margin-top:24px;padding-top:12px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;font-size:10px;color:#94a3b8">
        <div>共 ${opts.rows.length} 筆記錄</div>
        <div>© 源倍力 ERP · 機密文件</div>
      </div>
    </div>`;

  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-10000px;top:0;z-index:-1";
  host.innerHTML = html;
  document.body.appendChild(host);

  try {
    const node = host.firstElementChild as HTMLElement;
    const canvas = await html2canvas(node, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
    const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const imgW = pageW;
    const imgH = (canvas.height * imgW) / canvas.width;
    const img = canvas.toDataURL("image/jpeg", 0.95);

    if (imgH <= pageH) {
      pdf.addImage(img, "JPEG", 0, 0, imgW, imgH);
    } else {
      // multi-page
      let y = 0;
      while (y < imgH) {
        pdf.addImage(img, "JPEG", 0, -y, imgW, imgH);
        y += pageH;
        if (y < imgH) pdf.addPage();
      }
    }
    pdf.save(opts.filename ?? `${opts.title}-${Date.now()}.pdf`);
  } finally {
    document.body.removeChild(host);
  }
}
