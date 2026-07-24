import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { listBankAccounts, saveQuote, listProductsLite, listCustomersLite, getQuote } from "@/lib/quotes.functions";
import { SearchSelect } from "@/components/ui/search-select";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/quotes/$quoteId/edit")({
  component: EditQuotePage,
});

type Item = { product_id?: string | null; item_name: string; spec?: string; quantity: number; unit_price: number; discount: number };

function EditQuotePage() {
  const { quoteId } = Route.useParams();
  const navigate = useNavigate();
  const banksFn = useServerFn(listBankAccounts);
  const productsFn = useServerFn(listProductsLite);
  const customersFn = useServerFn(listCustomersLite);
  const getFn = useServerFn(getQuote);
  const saveFn = useServerFn(saveQuote);
  const { data: banks } = useQuery({ queryKey: ["qbanks"], queryFn: () => banksFn() });
  const { data: products } = useQuery({ queryKey: ["qproducts"], queryFn: () => productsFn() });
  const { data: customers } = useQuery({ queryKey: ["qcustomers"], queryFn: () => customersFn() });
  const { data: existing, isLoading } = useQuery({ queryKey: ["quote", quoteId], queryFn: () => getFn({ data: { id: quoteId } }) });

  const [form, setForm] = useState({
    customer_name: "", customer_phone: "", customer_email: "", customer_address: "",
    quote_date: new Date().toISOString().slice(0, 10),
    valid_until: "",
    bank_account_id: "",
    status: "draft",
    notes: "", payment_terms: "",
    discount_amount: 0, tax_amount: 0,
  });
  const [items, setItems] = useState<Item[]>([]);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!existing || loaded) return;
    const q = existing.quote as Record<string, unknown>;
    setForm({
      customer_name: String(q.customer_name ?? ""),
      customer_phone: String(q.customer_phone ?? ""),
      customer_email: String(q.customer_email ?? ""),
      customer_address: String(q.customer_address ?? ""),
      quote_date: String(q.quote_date ?? new Date().toISOString().slice(0, 10)),
      valid_until: q.valid_until ? String(q.valid_until) : "",
      bank_account_id: q.bank_account_id ? String(q.bank_account_id) : "",
      status: String(q.status ?? "draft"),
      notes: String(q.notes ?? ""),
      payment_terms: String(q.payment_terms ?? ""),
      discount_amount: Number(q.discount_amount ?? 0),
      tax_amount: Number(q.tax_amount ?? 0),
    });
    setItems((existing.items ?? []).map((it: Record<string, unknown>) => ({
      product_id: (it.product_id as string) ?? null,
      item_name: String(it.item_name ?? ""),
      spec: (it.spec as string) ?? "",
      quantity: Number(it.quantity ?? 1),
      unit_price: Number(it.unit_price ?? 0),
      discount: Number(it.discount ?? 0),
    })));
    setLoaded(true);
  }, [existing, loaded]);

  const lineTotal = (it: Item) => (Number(it.quantity) || 0) * (Number(it.unit_price) || 0) - (Number(it.discount) || 0);
  const subtotal = items.reduce((s, it) => s + lineTotal(it), 0);
  const total = subtotal - (Number(form.discount_amount) || 0) + (Number(form.tax_amount) || 0);

  function addItem() { setItems([...items, { item_name: "", quantity: 1, unit_price: 0, discount: 0 }]); }
  function rmItem(i: number) { setItems(items.filter((_, idx) => idx !== i)); }
  function updItem(i: number, patch: Partial<Item>) {
    setItems(items.map((it, idx) => idx === i ? { ...it, ...patch } : it));
  }
  function pickProduct(i: number, pid: string) {
    const p = (products ?? []).find((x) => x.id === pid);
    if (!p) return;
    updItem(i, { product_id: p.id, item_name: p.name, unit_price: Number(p.price ?? 0) });
  }

  async function onSave() {
    if (!form.customer_name) return toast.error("請填寫客戶名稱");
    if (items.length === 0) return toast.error("請至少新增一個品項");
    if (items.some((it) => !it.item_name)) return toast.error("請填寫所有品項名稱");
    setSaving(true);
    try {
      await saveFn({ data: {
        id: quoteId,
        ...form,
        bank_account_id: form.bank_account_id || null,
        valid_until: form.valid_until || null,
        items: items.map((it) => ({ ...it, product_id: it.product_id || null })),
      } });
      toast.success("已更新報價單");
      navigate({ to: "/admin/quotes/$quoteId", params: { quoteId } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "儲存失敗");
    } finally { setSaving(false); }
  }

  if (isLoading || !loaded) return <div className="p-6">載入中…</div>;

  return (
    <div className="container mx-auto p-6 space-y-4 max-w-5xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">編輯報價單</h1>
        <Button asChild variant="outline"><Link to="/admin/quotes/$quoteId" params={{ quoteId }}>返回</Link></Button>
      </div>

      <Card className="p-4 space-y-3">
        <h2 className="font-semibold">客戶資訊</h2>
        <div>
          <Label>搜尋既有客戶（覆蓋）</Label>
          <SearchSelect
            options={(customers ?? []).map((c) => ({
              value: c.id,
              label: `${c.name}${c.company ? ` (${c.company})` : ""}`,
              keywords: `${c.name} ${c.customer_no ?? ""} ${c.phone ?? ""} ${c.email ?? ""} ${c.company ?? ""}`,
              hint: [c.customer_no, c.phone, c.email].filter(Boolean).join(" · "),
            }))}
            value={null}
            onChange={(id) => {
              const c = (customers ?? []).find((x) => x.id === id);
              if (!c) return;
              setForm((f) => ({
                ...f,
                customer_name: c.name ?? "",
                customer_phone: c.phone ?? "",
                customer_email: c.email ?? "",
                customer_address: c.shipping_address ?? "",
              }));
              toast.success(`已帶入客戶：${c.name}`);
            }}
            placeholder="搜尋姓名 / 編號 / 電話 / Email / 公司"
            searchPlaceholder="輸入關鍵字..."
            emptyText="查無客戶"
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div><Label>客戶名稱 *</Label><Input value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} /></div>
          <div><Label>電話</Label><Input value={form.customer_phone} onChange={(e) => setForm({ ...form, customer_phone: e.target.value })} /></div>
          <div><Label>Email</Label><Input type="email" value={form.customer_email} onChange={(e) => setForm({ ...form, customer_email: e.target.value })} /></div>
          <div><Label>地址</Label><Input value={form.customer_address} onChange={(e) => setForm({ ...form, customer_address: e.target.value })} /></div>
          <div><Label>報價日期</Label><Input type="date" value={form.quote_date} onChange={(e) => setForm({ ...form, quote_date: e.target.value })} /></div>
          <div><Label>有效日期</Label><Input type="date" value={form.valid_until} onChange={(e) => setForm({ ...form, valid_until: e.target.value })} /></div>
          <div>
            <Label>狀態</Label>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="draft">draft 草稿</SelectItem>
                <SelectItem value="sent">sent 已寄出</SelectItem>
                <SelectItem value="accepted">accepted 已接受</SelectItem>
                <SelectItem value="rejected">rejected 已拒絕</SelectItem>
                <SelectItem value="expired">expired 已過期</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">報價明細</h2>
          <Button size="sm" variant="outline" onClick={addItem}><Plus className="h-4 w-4 mr-1" />新增品項</Button>
        </div>
        <div className="space-y-2">
          {items.map((it, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-end border-b pb-2">
              <div className="col-span-3">
                <Label className="text-xs">搜尋商品（品名 / SKU）</Label>
                <SearchSelect
                  options={(products ?? []).map((p) => ({
                    value: p.id,
                    label: p.name,
                    keywords: `${p.name} ${p.sku ?? ""}`,
                    hint: [p.sku, p.price != null ? `$${Number(p.price).toLocaleString()}` : null].filter(Boolean).join(" · "),
                  }))}
                  value={it.product_id ?? null}
                  onChange={(id) => id && pickProduct(i, id)}
                  placeholder="🔍 點此搜尋商品"
                  searchPlaceholder="輸入品名或 SKU 關鍵字..."
                  emptyText="查無商品"
                />
                <Input className="mt-1" placeholder="或手動輸入品名" value={it.item_name} onChange={(e) => updItem(i, { item_name: e.target.value })} />
              </div>
              <div className="col-span-2"><Label className="text-xs">規格</Label><Input value={it.spec ?? ""} onChange={(e) => updItem(i, { spec: e.target.value })} /></div>
              <div className="col-span-1"><Label className="text-xs">數量</Label><Input type="number" value={it.quantity} onChange={(e) => updItem(i, { quantity: Number(e.target.value) })} /></div>
              <div className="col-span-2"><Label className="text-xs">單價</Label><Input type="number" value={it.unit_price} onChange={(e) => updItem(i, { unit_price: Number(e.target.value) })} /></div>
              <div className="col-span-2"><Label className="text-xs">折扣</Label><Input type="number" value={it.discount} onChange={(e) => updItem(i, { discount: Number(e.target.value) })} /></div>
              <div className="col-span-1 text-right text-sm">${lineTotal(it).toLocaleString()}</div>
              <div className="col-span-1"><Button size="icon" variant="ghost" onClick={() => rmItem(i)}><Trash2 className="h-4 w-4" /></Button></div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
          <div><Label>整單折扣</Label><Input type="number" value={form.discount_amount} onChange={(e) => setForm({ ...form, discount_amount: Number(e.target.value) })} /></div>
          <div><Label>稅額</Label><Input type="number" value={form.tax_amount} onChange={(e) => setForm({ ...form, tax_amount: Number(e.target.value) })} /></div>
          <div className="text-right">
            <div className="text-sm text-muted-foreground">小計 ${subtotal.toLocaleString()}</div>
            <div className="text-xl font-bold">總計 ${total.toLocaleString()}</div>
          </div>
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <h2 className="font-semibold">付款與備註</h2>
        <div>
          <Label>匯款銀行帳號</Label>
          <Select value={form.bank_account_id} onValueChange={(v) => setForm({ ...form, bank_account_id: v })}>
            <SelectTrigger><SelectValue placeholder="選擇銀行帳號" /></SelectTrigger>
            <SelectContent>
              {(banks ?? []).filter((b) => b.is_active).map((b) => (
                <SelectItem key={b.id} value={b.id}>{b.bank_name} {b.branch_name ?? ""} - {b.account_number}{b.is_default ? " (預設)" : ""}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div><Label>付款說明</Label><Textarea value={form.payment_terms} onChange={(e) => setForm({ ...form, payment_terms: e.target.value })} /></div>
        <div><Label>備註</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
      </Card>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => navigate({ to: "/admin/quotes/$quoteId", params: { quoteId } })}>取消</Button>
        <Button onClick={onSave} disabled={saving}>{saving ? "儲存中…" : "儲存變更"}</Button>
      </div>
    </div>
  );
}
