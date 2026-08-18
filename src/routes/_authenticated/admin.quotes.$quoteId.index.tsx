import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { getQuote, deleteQuote, getQuoteShareToken } from "@/lib/quotes.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Printer, FileDown, Share2, ArrowRightLeft, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";



export const Route = createFileRoute("/_authenticated/admin/quotes/$quoteId/")({
  component: QuoteDetailPage,
});

type CompanySnap = {
  company_name?: string; company_name_en?: string; tax_id?: string; representative?: string;
  phone?: string; fax?: string; email?: string; address?: string; logo_url?: string;
  website?: string; line_id?: string; header_note?: string; footer_text?: string;
};
type BankSnap = { bank_name?: string; branch_name?: string; bank_code?: string; account_name?: string; account_number?: string };

function QuoteDetailPage() {
  const { quoteId } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fn = useServerFn(getQuote);
  const delFn = useServerFn(deleteQuote);
  const shareFn = useServerFn(getQuoteShareToken);
  const { data, isLoading } = useQuery({ queryKey: ["quote", quoteId], queryFn: () => fn({ data: { id: quoteId } }) });
  const printRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);


  if (isLoading) return <div className="p-6">載入中…</div>;
  if (!data) return <div className="p-6">找不到報價單</div>;

  const q = data.quote as Record<string, unknown> & { quote_no: string; status: string };
  const items = data.items as Array<Record<string, unknown> & { item_name: string; quantity: number; unit_price: number; discount: number; subtotal: number; spec?: string }>;
  const comp = (q.company_snapshot ?? {}) as CompanySnap;
  const bank = (q.bank_snapshot ?? {}) as BankSnap;
  const canEdit = q.status !== "converted";

  async function copyShare() {
    try {
      const r = await shareFn({ data: { id: quoteId } });
      if (!r?.token) { toast.error("此報價單尚無分享連結"); return; }
      await navigator.clipboard.writeText(`${window.location.origin}/quote/${r.token}`);
      toast.success("已複製公開分享連結");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "取得分享連結失敗");
    }
  }


  async function onDelete() {
    if (!confirm(`確定刪除報價單 ${q.quote_no}？此動作無法復原。`)) return;
    try {
      await delFn({ data: { id: quoteId } });
      toast.success("已刪除");
      qc.invalidateQueries({ queryKey: ["quotes"] });
      navigate({ to: "/admin/quotes" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "刪除失敗");
    }
  }

  async function onExportPdf() {
    if (!printRef.current) return;
    setExporting(true);
    let holder: HTMLDivElement | null = null;
    try {
      const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
        import("html2canvas-pro"),
        import("jspdf"),
      ]);

      // 以固定 A4 內容寬度離線複製一份，避免視窗寬度造成內容被裁切
      const CONTENT_W = 794; // 96dpi 下的 A4 寬
      holder = document.createElement("div");
      holder.style.cssText = `position:fixed;left:-10000px;top:0;width:${CONTENT_W}px;background:#ffffff;z-index:-1`;
      const clone = printRef.current.cloneNode(true) as HTMLElement;
      clone.style.width = `${CONTENT_W}px`;
      clone.style.maxWidth = "none";
      clone.style.margin = "0";
      clone.style.boxShadow = "none";
      holder.appendChild(clone);
      document.body.appendChild(holder);
      await new Promise((r) => requestAnimationFrame(() => r(null)));

      const canvas = await html2canvas(clone, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
        width: CONTENT_W,
        windowWidth: CONTENT_W,
        logging: false,
      });

      const imgData = canvas.toDataURL("image/jpeg", 0.95);
      const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const margin = 8; // mm，避免內容貼齊紙張邊緣
      const imgW = pageW - margin * 2;
      const imgH = (canvas.height * imgW) / canvas.width;
      const usableH = pageH - margin * 2;

      let heightLeft = imgH;
      let position = margin;
      pdf.addImage(imgData, "JPEG", margin, position, imgW, imgH);
      heightLeft -= usableH;
      while (heightLeft > 0) {
        position -= usableH;
        pdf.addPage();
        pdf.addImage(imgData, "JPEG", margin, position, imgW, imgH);
        heightLeft -= usableH;
      }
      pdf.save(`${q.quote_no}.pdf`);
      toast.success("PDF 已下載");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "PDF 匯出失敗");
    } finally {
      if (holder) document.body.removeChild(holder);
      setExporting(false);
    }
  }


  return (
    <div className="container mx-auto p-6 space-y-4 max-w-4xl">
      <div className="flex items-center justify-between print:hidden">
        <div>
          <h1 className="text-2xl font-bold">報價單 {q.quote_no}</h1>
          <Badge variant="outline" className="mt-1">{q.status}</Badge>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button asChild variant="outline"><Link to="/admin/quotes">返回</Link></Button>
          {canEdit && (
            <Button asChild variant="outline">
              <Link to="/admin/quotes/$quoteId/edit" params={{ quoteId }}><Pencil className="h-4 w-4 mr-1" />編輯</Link>
            </Button>
          )}
          <Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4 mr-1" />列印</Button>
          <Button variant="outline" onClick={onExportPdf} disabled={exporting}>
            <FileDown className="h-4 w-4 mr-1" />{exporting ? "匯出中…" : "PDF"}
          </Button>
          <Button variant="outline" onClick={copyShare}><Share2 className="h-4 w-4 mr-1" />分享連結</Button>
          <Button variant="outline" disabled title="即將推出"><ArrowRightLeft className="h-4 w-4 mr-1" />轉訂單</Button>
          {canEdit && (
            <Button variant="destructive" onClick={onDelete}><Trash2 className="h-4 w-4 mr-1" />刪除</Button>
          )}
        </div>
      </div>

      <Card ref={printRef} className="quote-doc quote-print-area p-8 space-y-6 bg-white text-black text-[15px] leading-relaxed print:shadow-none print:border-0">

        <div className="flex justify-between items-start border-b pb-4">
          <div className="flex items-center gap-4">
            {comp.logo_url && <img src={comp.logo_url} alt="logo" className="h-16" />}
            <div>
              <h2 className="text-2xl font-bold">{comp.company_name ?? "—"}</h2>
              {comp.company_name_en && <div className="text-sm text-gray-600">{comp.company_name_en}</div>}
              {comp.tax_id && <div className="text-xs text-gray-600">統編：{comp.tax_id}</div>}
            </div>
          </div>
          <div className="text-right text-sm">
            <div className="text-xl font-bold mb-1">報 價 單</div>
            <div>單號：{q.quote_no}</div>
            <div>日期：{String(q.quote_date)}</div>
            {q.valid_until ? <div>有效期：{String(q.valid_until)}</div> : null}
          </div>
        </div>

        {comp.header_note && <div className="text-sm whitespace-pre-line">{comp.header_note}</div>}

        <div className="grid grid-cols-2 gap-6 text-sm">
          <div>
            <div className="font-semibold mb-1">客戶資訊</div>
            <div>{String(q.customer_name ?? "")}</div>
            {q.customer_phone ? <div>電話：{String(q.customer_phone)}</div> : null}
            {q.customer_email ? <div>Email：{String(q.customer_email)}</div> : null}
            {q.customer_address ? <div>地址：{String(q.customer_address)}</div> : null}
          </div>
          <div>
            <div className="font-semibold mb-1">本公司聯絡資訊</div>
            {comp.representative && <div>負責人：{comp.representative}</div>}
            {comp.phone && <div>電話：{comp.phone}</div>}
            {comp.fax && <div>傳真：{comp.fax}</div>}
            {comp.email && <div>Email：{comp.email}</div>}
            {comp.address && <div>地址：{comp.address}</div>}
            {comp.website && <div>網站：{comp.website}</div>}
            {comp.line_id && <div>LINE：{comp.line_id}</div>}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <colgroup>
              <col style={{ width: "34%" }} />
              <col style={{ width: "16%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "12%" }} />
              <col style={{ width: "15%" }} />
            </colgroup>
            <thead>
              <tr>
                <th className="text-left">品名</th>
                <th className="text-left">規格</th>
                <th className="text-right">數量</th>
                <th className="text-right">單價</th>
                <th className="text-right">折扣</th>
                <th className="text-right">小計</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i}>
                  <td className="whitespace-pre-line break-words">{it.item_name}</td>
                  <td className="break-words">{it.spec ?? ""}</td>
                  <td className="text-right tabular-nums">{Number(it.quantity).toLocaleString()}</td>
                  <td className="text-right tabular-nums">${Number(it.unit_price).toLocaleString()}</td>
                  <td className="text-right tabular-nums">${Number(it.discount).toLocaleString()}</td>
                  <td className="text-right tabular-nums">${Number(it.subtotal).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><td colSpan={5} className="text-right">小計</td><td className="text-right tabular-nums">${Number(q.subtotal).toLocaleString()}</td></tr>
              <tr><td colSpan={5} className="text-right">折扣</td><td className="text-right tabular-nums">-${Number(q.discount_amount).toLocaleString()}</td></tr>
              <tr><td colSpan={5} className="text-right">稅額</td><td className="text-right tabular-nums">${Number(q.tax_amount).toLocaleString()}</td></tr>
              <tr className="font-bold text-lg"><td colSpan={5} className="text-right">總計</td><td className="text-right tabular-nums">${Number(q.total_amount).toLocaleString()}</td></tr>
            </tfoot>
          </table>
        </div>

        {(bank.bank_name || q.payment_terms) ? (
          <div className="border-t pt-4 text-sm space-y-2">
            <div className="font-semibold">付款資訊</div>
            {q.payment_terms ? <div className="whitespace-pre-line">{String(q.payment_terms)}</div> : null}
            {bank.bank_name && (
              <div className="bg-gray-50 p-3 rounded">
                <div>銀行：{bank.bank_name} {bank.branch_name ?? ""} {bank.bank_code ? `(${bank.bank_code})` : ""}</div>
                <div>戶名：{bank.account_name}</div>
                <div>帳號：<span className="font-mono">{bank.account_number}</span></div>
              </div>
            )}
          </div>
        ) : null}

        {q.notes ? <div className="text-sm"><span className="font-semibold">備註：</span><span className="whitespace-pre-line">{String(q.notes)}</span></div> : null}
        {comp.footer_text ? <div className="text-xs text-gray-500 text-center border-t pt-3 whitespace-pre-line">{comp.footer_text}</div> : null}
      </Card>
    </div>
  );
}
