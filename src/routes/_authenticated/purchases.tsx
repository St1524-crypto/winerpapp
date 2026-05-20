import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "sonner";
import { Plus, Search, Truck, Eye, Printer, Trash2, FileDown, ArrowRight } from "lucide-react";
import { exportPdfReport } from "@/lib/pdf-report";
import { useBranding } from "@/hooks/use-branding";

const STATUS = [
  { v: "draft", label: "草稿", variant: "secondary" as const },
  { v: "submitted", label: "已送出", variant: "outline" as const },
  { v: "confirmed", label: "已確認", variant: "default" as const },
  { v: "partial", label: "部分到貨", variant: "secondary" as const },
  { v: "completed", label: "全部到貨", variant: "default" as const },
  { v: "cancelled", label: "已取消", variant: "destructive" as const },
];
const statusMeta = (s: string) => STATUS.find((x) => x.v === s) ?? STATUS[0];

// 合法的狀態流轉路徑
const TRANSITIONS: Record<string, string[]> = {
  draft: ["submitted", "cancelled"],
  submitted: ["confirmed", "draft", "cancelled"],
  confirmed: ["partial", "completed", "cancelled"],
  partial: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

interface PO {
  id: string; po_no: string; vendor_id: string | null; vendor_name: string;
  status: string; subtotal: number; tax_amount: number; total_amount: number;
  expected_at: string | null; notes: string | null; created_at: string;
}
interface POItem {
  id?: string; product_id: string | null; product_name: string; sku: string;
  unit: string; quantity: number; received_quantity: number; price: number; subtotal: number;
}
interface Vendor { id: string; name: string; code: string; }
interface Product { id: string; sku: string; name: string; cost_price: number; }

const sb: any = supabase;

function Page() {
  const { user } = useAuth();
  const { logoUrl } = useBranding();
  const [list, setList] = useState<PO[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  const [open, setOpen] = useState(false);
  const [taxRate, setTaxRate] = useState(5);
  const [form, setForm] = useState({ vendor_id: "", vendor_name: "", expected_at: "", notes: "" });
  const [items, setItems] = useState<POItem[]>([]);

  const [viewing, setViewing] = useState<PO | null>(null);
  const [viewItems, setViewItems] = useState<POItem[]>([]);

  async function load() {
    setLoading(true);
    const { data, error } = await sb.from("purchase_orders").select("*").order("created_at", { ascending: false });
    if (error) toast.error(error.message); else setList(data ?? []);
    setLoading(false);
  }
  async function loadRefs() {
    const [{ data: v }, { data: p }] = await Promise.all([
      sb.from("vendors").select("id,name,code").eq("status", "active").order("name"),
      sb.from("products").select("id,sku,name,cost_price").eq("status", "active").order("name"),
    ]);
    setVendors(v ?? []); setProducts(p ?? []);
  }
  useEffect(() => { load(); loadRefs(); }, []);

  const filtered = useMemo(() => list.filter((p) => {
    if (statusFilter !== "all" && p.status !== statusFilter) return false;
    if (search && ![p.po_no, p.vendor_name].some((x) => x?.toLowerCase().includes(search.toLowerCase()))) return false;
    return true;
  }), [list, search, statusFilter]);

  function openNew() {
    setForm({ vendor_id: "", vendor_name: "", expected_at: "", notes: "" });
    setItems([]); setTaxRate(5); setOpen(true);
  }
  function addItem() {
    setItems([...items, { product_id: null, product_name: "", sku: "", unit: "件", quantity: 1, received_quantity: 0, price: 0, subtotal: 0 }]);
  }
  function updateItem(i: number, patch: Partial<POItem>) {
    const arr = [...items];
    arr[i] = { ...arr[i], ...patch };
    arr[i].subtotal = arr[i].quantity * arr[i].price;
    if (patch.product_id) {
      const p = products.find((x) => x.id === patch.product_id);
      if (p) { arr[i].product_name = p.name; arr[i].sku = p.sku; if (!arr[i].price) { arr[i].price = p.cost_price; arr[i].subtotal = arr[i].quantity * p.cost_price; } }
    }
    setItems(arr);
  }
  function removeItem(i: number) { setItems(items.filter((_, idx) => idx !== i)); }

  const subtotal = items.reduce((s, i) => s + i.subtotal, 0);
  const tax = Math.round(subtotal * (taxRate / 100));
  const total = subtotal + tax;

  async function save() {
    if (!form.vendor_id) return toast.error("請選擇供應商");
    if (items.length === 0) return toast.error("請至少新增一個商品");
    if (items.some((i) => !i.product_id || i.quantity <= 0)) return toast.error("請完整填寫商品與數量");

    const { data: poNoData, error: poNoErr } = await sb.rpc("generate_po_no");
    if (poNoErr) return toast.error(poNoErr.message);

    const vendor = vendors.find((v) => v.id === form.vendor_id);
    const { data: po, error } = await sb.from("purchase_orders").insert({
      po_no: poNoData,
      vendor_id: form.vendor_id,
      vendor_name: vendor?.name ?? form.vendor_name,
      status: "draft",
      subtotal, tax_amount: tax, total_amount: total,
      expected_at: form.expected_at || null,
      notes: form.notes || null,
      created_by: user?.id ?? null,
    }).select().single();
    if (error) return toast.error(error.message);

    const payload = items.map((i) => ({
      purchase_order_id: po.id, product_id: i.product_id, product_name: i.product_name,
      sku: i.sku, unit: i.unit, quantity: i.quantity, price: i.price, subtotal: i.subtotal,
    }));
    const { error: e2 } = await sb.from("purchase_order_items").insert(payload);
    if (e2) return toast.error(e2.message);

    toast.success(`採購單 ${poNoData} 已建立`);
    setOpen(false); load();
  }

  async function setStatus(po: PO, status: string) {
    const allowed = TRANSITIONS[po.status] ?? [];
    if (!allowed.includes(status)) {
      toast.error(`無法從「${statusMeta(po.status).label}」變更為「${statusMeta(status).label}」`);
      return;
    }
    const { error } = await sb.from("purchase_orders").update({ status }).eq("id", po.id);
    if (error) {
      toast.error(error.message);
    } else {
      toast.success(`狀態已更新為「${statusMeta(status).label}」`);
      setList((prev) => prev.map((x) => (x.id === po.id ? { ...x, status } : x)));
      if (viewing?.id === po.id) setViewing({ ...viewing, status });
    }
  }
  async function remove(po: PO) {
    if (!confirm(`確定刪除 ${po.po_no}？`)) return;
    const { error } = await sb.from("purchase_orders").delete().eq("id", po.id);
    if (error) toast.error(error.message); else { toast.success("已刪除"); load(); }
  }
  async function view(po: PO) {
    setViewing(po);
    const { data } = await sb.from("purchase_order_items").select("*").eq("purchase_order_id", po.id);
    setViewItems(data ?? []);
  }
  async function printPdf(po: PO) {
    const { data: rows } = await sb.from("purchase_order_items").select("*").eq("purchase_order_id", po.id);
    const sub = (rows ?? []).reduce((s: number, r: any) => s + Number(r.subtotal ?? 0), 0);
    await exportPdfReport({
      title: `採購單 ${po.po_no}`,
      logoUrl,
      subtitle: `供應商：${po.vendor_name}  ·  狀態：${statusMeta(po.status).label}`,
      meta: {
        採購單號: po.po_no,
        狀態: statusMeta(po.status).label,
        建立日期: new Date(po.created_at).toLocaleDateString("zh-TW"),
        預計到貨: po.expected_at ?? "—",
        未稅金額: `NT$ ${(po.subtotal ?? sub).toLocaleString()}`,
        稅額: `NT$ ${(po.tax_amount ?? 0).toLocaleString()}`,
        總金額: `NT$ ${(po.total_amount ?? 0).toLocaleString()}`,
        備註: po.notes ?? "—",
      },
      columns: [
        { key: "sku", label: "SKU" },
        { key: "product_name", label: "商品" },
        { key: "unit", label: "單位" },
        { key: "quantity", label: "數量", align: "right" },
        { key: "received_quantity", label: "已到貨", align: "right" },
        { key: "price", label: "單價", align: "right", format: (r: any) => Number(r.price).toLocaleString() },
        { key: "subtotal", label: "小計", align: "right", format: (r: any) => Number(r.subtotal).toLocaleString() },
      ],
      rows: rows ?? [],
      filename: `${po.po_no}.pdf`,
    });
    toast.success("PDF 已產生");
  }

  async function printBrowser(po: PO) {
    const { data: rows } = await sb.from("purchase_order_items").select("*").eq("purchase_order_id", po.id);
    const items = rows ?? [];
    const sm = statusMeta(po.status);
    const fmt = (n: number) => `NT$ ${Number(n ?? 0).toLocaleString()}`;
    const esc = (s: any) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
    const rowsHtml = items.map((i: any) => `
      <tr>
        <td style="font-family:monospace;font-size:11px">${esc(i.sku)}</td>
        <td>${esc(i.product_name)}</td>
        <td>${esc(i.unit)}</td>
        <td style="text-align:right">${i.quantity}</td>
        <td style="text-align:right">${i.received_quantity ?? 0}</td>
        <td style="text-align:right">${Number(i.price).toLocaleString()}</td>
        <td style="text-align:right">${Number(i.subtotal).toLocaleString()}</td>
      </tr>`).join("");

    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(po.po_no)}</title>
      <style>
        body{font-family:'Noto Sans TC','PingFang TC','Microsoft JhengHei',system-ui,sans-serif;color:#0f172a;padding:32px;max-width:900px;margin:auto}
        .head{display:flex;align-items:center;gap:16px;border-bottom:3px solid #7c3aed;padding-bottom:14px;margin-bottom:18px}
        .head img{width:52px;height:52px;object-fit:contain;border:1px solid #e2e8f0;border-radius:10px}
        h1{font-size:22px;margin:0}
        .sub{font-size:12px;color:#64748b}
        .badge{display:inline-block;padding:3px 10px;border-radius:999px;font-size:11px;background:#ede9fe;color:#6d28d9;font-weight:600;margin-left:6px}
        .meta{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:14px 0;font-size:12px}
        .meta div{background:#f8fafc;padding:8px 10px;border-radius:6px}
        .meta b{display:block;color:#64748b;font-weight:500;font-size:10px;text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px}
        table{width:100%;border-collapse:collapse;font-size:12px;margin-top:10px}
        th{background:#f1f5f9;text-align:left;padding:8px;border-bottom:2px solid #cbd5e1;font-size:11px;color:#475569}
        td{padding:8px;border-bottom:1px solid #e2e8f0}
        .total{margin-top:18px;text-align:right;font-size:14px}
        .total div{margin:2px 0}
        .grand{font-size:20px;font-weight:700;color:#7c3aed;border-top:2px solid #cbd5e1;padding-top:6px;margin-top:6px}
        .footer{margin-top:30px;font-size:10px;color:#94a3b8;text-align:center;border-top:1px solid #e2e8f0;padding-top:8px}
        @media print { body{padding:16px} }
      </style></head><body>
      <div class="head">
        <img src="${logoUrl}" />
        <div style="flex:1">
          <h1>採購單 <span class="badge">${esc(sm.label)}</span></h1>
          <div class="sub">源倍力 ERP · Purchase Order</div>
        </div>
        <div style="text-align:right;font-size:11px;color:#64748b">
          <div>列印時間</div><div style="color:#0f172a">${new Date().toLocaleString("zh-TW", { hour12: false })}</div>
        </div>
      </div>
      <div class="meta">
        <div><b>採購單號</b>${esc(po.po_no)}</div>
        <div><b>供應商</b>${esc(po.vendor_name)}</div>
        <div><b>建立日期</b>${new Date(po.created_at).toLocaleDateString("zh-TW")}</div>
        <div><b>預計到貨</b>${esc(po.expected_at ?? "—")}</div>
      </div>
      <table>
        <thead><tr><th>SKU</th><th>商品</th><th>單位</th><th style="text-align:right">數量</th><th style="text-align:right">已到貨</th><th style="text-align:right">單價</th><th style="text-align:right">小計</th></tr></thead>
        <tbody>${rowsHtml || `<tr><td colspan="7" style="text-align:center;color:#94a3b8;padding:20px">無明細</td></tr>`}</tbody>
      </table>
      <div class="total">
        <div>未稅金額：${fmt(po.subtotal)}</div>
        <div>稅額：${fmt(po.tax_amount)}</div>
        <div class="grand">總金額：${fmt(po.total_amount)}</div>
      </div>
      ${po.notes ? `<div style="margin-top:18px;font-size:12px"><b style="color:#64748b">備註：</b>${esc(po.notes)}</div>` : ""}
      <div class="footer">© 源倍力 ERP 管理系統 · 機密文件</div>
      <script>window.onload=function(){setTimeout(function(){window.print();},300)}</script>
      </body></html>`;

    const w = window.open("", "_blank", "width=900,height=1000");
    if (!w) { toast.error("瀏覽器封鎖了彈出視窗，請允許後再試"); return; }
    w.document.open(); w.document.write(html); w.document.close();
  }

  return (
    <div className="max-w-[1600px] mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Truck className="h-6 w-6 text-primary" />採購管理</h1>
          <p className="text-sm text-muted-foreground mt-1">建立並追蹤採購單流程</p>
        </div>
        <Button onClick={openNew} className="bg-gradient-primary"><Plus className="h-4 w-4 mr-1" />新增採購單</Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="搜尋採購單號、供應商..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部狀態</SelectItem>
                {STATUS.map((s) => <SelectItem key={s.v} value={s.v}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>採購單號</TableHead><TableHead>供應商</TableHead>
                <TableHead>預計到貨</TableHead><TableHead>狀態</TableHead>
                <TableHead className="text-right">總金額</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}><TableCell colSpan={6}><Skeleton className="h-8 w-full" /></TableCell></TableRow>
              )) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-10">尚無採購單</TableCell></TableRow>
              ) : filtered.map((p) => {
                const m = statusMeta(p.status);
                return (
                  <TableRow key={p.id} className="cursor-pointer" onClick={() => view(p)}>
                    <TableCell className="font-mono text-xs font-medium">{p.po_no}</TableCell>
                    <TableCell>{p.vendor_name}</TableCell>
                    <TableCell className="text-muted-foreground">{p.expected_at ?? "—"}</TableCell>
                    <TableCell><Badge variant={m.variant}>{m.label}</Badge></TableCell>
                    <TableCell className="text-right font-medium">NT$ {(p.total_amount ?? 0).toLocaleString()}</TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <Button size="icon" variant="ghost" onClick={() => view(p)} title="檢視"><Eye className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => printBrowser(p)} title="列印"><Printer className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => printPdf(p)} title="匯出 PDF"><FileDown className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => remove(p)} title="刪除"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>

      {/* 建立採購單 */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader><DialogTitle>新增採購單</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2 max-h-[70vh] overflow-y-auto">
            <div className="grid sm:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>供應商 *</Label>
                <Select value={form.vendor_id} onValueChange={(v) => setForm({ ...form, vendor_id: v })}>
                  <SelectTrigger><SelectValue placeholder="選擇供應商" /></SelectTrigger>
                  <SelectContent>
                    {vendors.map((v) => <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>預計到貨日</Label>
                <Input type="date" value={form.expected_at} onChange={(e) => setForm({ ...form, expected_at: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>稅率 (%)</Label>
                <Input type="number" value={taxRate} onChange={(e) => setTaxRate(Number(e.target.value) || 0)} />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>商品明細</Label>
                <Button size="sm" variant="outline" onClick={addItem}><Plus className="h-4 w-4 mr-1" />新增商品</Button>
              </div>
              <div className="border rounded-lg overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[200px]">商品</TableHead>
                      <TableHead>單位</TableHead>
                      <TableHead className="w-[90px]">數量</TableHead>
                      <TableHead className="w-[110px]">單價</TableHead>
                      <TableHead className="text-right">小計</TableHead>
                      <TableHead className="w-[40px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-6">尚未新增商品</TableCell></TableRow>
                    ) : items.map((it, i) => (
                      <TableRow key={i}>
                        <TableCell>
                          <Select value={it.product_id ?? ""} onValueChange={(v) => updateItem(i, { product_id: v })}>
                            <SelectTrigger><SelectValue placeholder="選擇商品" /></SelectTrigger>
                            <SelectContent>
                              {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.sku} · {p.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell><Input value={it.unit} onChange={(e) => updateItem(i, { unit: e.target.value })} className="w-16" /></TableCell>
                        <TableCell><Input type="number" value={it.quantity} onChange={(e) => updateItem(i, { quantity: Number(e.target.value) || 0 })} /></TableCell>
                        <TableCell><Input type="number" value={it.price} onChange={(e) => updateItem(i, { price: Number(e.target.value) || 0 })} /></TableCell>
                        <TableCell className="text-right font-mono">{it.subtotal.toLocaleString()}</TableCell>
                        <TableCell><Button size="icon" variant="ghost" onClick={() => removeItem(i)}><Trash2 className="h-4 w-4 text-destructive" /></Button></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                </div>
              </div>
            </div>

            <div className="flex flex-col items-end gap-1 text-sm">
              <div className="flex gap-8"><span className="text-muted-foreground">未稅金額</span><span className="font-mono w-32 text-right">NT$ {subtotal.toLocaleString()}</span></div>
              <div className="flex gap-8"><span className="text-muted-foreground">稅額 ({taxRate}%)</span><span className="font-mono w-32 text-right">NT$ {tax.toLocaleString()}</span></div>
              <div className="flex gap-8 text-lg font-bold pt-1 border-t mt-1 w-fit"><span>總金額</span><span className="font-mono w-32 text-right text-primary">NT$ {total.toLocaleString()}</span></div>
            </div>

            <div className="space-y-2">
              <Label>備註</Label>
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>取消</Button>
            <Button onClick={save} className="bg-gradient-primary">建立採購單</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 採購單詳情 */}
      <Sheet open={!!viewing} onOpenChange={(v) => !v && setViewing(null)}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          {viewing && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2 font-mono">{viewing.po_no}
                  <Badge variant={statusMeta(viewing.status).variant}>{statusMeta(viewing.status).label}</Badge>
                </SheetTitle>
              </SheetHeader>
              <div className="mt-4 space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div><div className="text-muted-foreground text-xs">供應商</div><div className="font-medium">{viewing.vendor_name}</div></div>
                  <div><div className="text-muted-foreground text-xs">預計到貨</div><div>{viewing.expected_at ?? "—"}</div></div>
                  <div><div className="text-muted-foreground text-xs">未稅</div><div className="font-mono">NT$ {viewing.subtotal?.toLocaleString()}</div></div>
                  <div><div className="text-muted-foreground text-xs">稅額</div><div className="font-mono">NT$ {viewing.tax_amount?.toLocaleString()}</div></div>
                  <div className="col-span-2"><div className="text-muted-foreground text-xs">總金額</div><div className="text-xl font-bold text-primary">NT$ {viewing.total_amount?.toLocaleString()}</div></div>
                </div>
                <Card><CardContent className="p-0">
                  <div className="overflow-x-auto">
                  <Table>
                    <TableHeader><TableRow><TableHead>SKU</TableHead><TableHead>商品</TableHead><TableHead className="text-right">數量</TableHead><TableHead className="text-right">已到貨</TableHead><TableHead className="text-right">單價</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {viewItems.map((i, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="font-mono text-xs">{i.sku}</TableCell>
                          <TableCell>{i.product_name}</TableCell>
                          <TableCell className="text-right">{i.quantity}</TableCell>
                          <TableCell className="text-right">{i.received_quantity}</TableCell>
                          <TableCell className="text-right font-mono">{i.price.toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent></Card>
                <div className="space-y-2">
                  <Label>狀態流轉</Label>
                  {(() => {
                    const allowed = TRANSITIONS[viewing.status] ?? [];
                    const isFinal = allowed.length === 0;
                    return (
                      <>
                        <div className="flex flex-wrap gap-2 items-center">
                          <Badge variant={statusMeta(viewing.status).variant}>{statusMeta(viewing.status).label}</Badge>
                          {!isFinal && <ArrowRight className="h-4 w-4 text-muted-foreground" />}
                          {isFinal ? (
                            <span className="text-xs text-muted-foreground">已為終止狀態，無法再變更</span>
                          ) : (
                            STATUS.filter((s) => allowed.includes(s.v)).map((s) => (
                              <Button key={s.v} size="sm" variant="outline" onClick={() => setStatus(viewing, s.v)}>
                                {s.label}
                              </Button>
                            ))
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">流程：草稿 → 已送出 → 已確認 → 部分到貨 → 全部到貨（任一階段可取消）</p>
                      </>
                    );
                  })()}
                </div>
                <div className="flex gap-2 pt-2">
                  <Button onClick={() => printBrowser(viewing)} variant="outline"><Printer className="h-4 w-4 mr-1" />列印</Button>
                  <Button onClick={() => printPdf(viewing)} variant="outline"><FileDown className="h-4 w-4 mr-1" />匯出 PDF</Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/purchases")({ component: Page });
