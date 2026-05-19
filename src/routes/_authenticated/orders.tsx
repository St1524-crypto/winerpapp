import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ShoppingCart, Search, Plus, Loader2, Eye, Truck, CreditCard,
  PackageCheck, XCircle, RotateCw, Receipt, UserSearch, Check,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

export const Route = createFileRoute("/_authenticated/orders")({
  head: () => ({
    meta: [
      { title: "訂單管理 — 源倍力 ERP" },
      { name: "description", content: "訂單流程、出貨狀態與金流追蹤" },
    ],
  }),
  component: OrdersPage,
});

// =================== Status maps ===================
const ORDER_STATUS = {
  pending:    { label: "待處理", tone: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  processing: { label: "處理中", tone: "bg-sky-500/15 text-sky-400 border-sky-500/30" },
  completed:  { label: "已完成", tone: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  cancelled:  { label: "已取消", tone: "bg-rose-500/15 text-rose-400 border-rose-500/30" },
} as const;

const SHIPPING_STATUS = {
  pending:   { label: "待出貨", tone: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  shipped:   { label: "已出貨", tone: "bg-sky-500/15 text-sky-400 border-sky-500/30" },
  delivered: { label: "已送達", tone: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  returned:  { label: "已退貨", tone: "bg-rose-500/15 text-rose-400 border-rose-500/30" },
} as const;

const PAYMENT_STATUS = {
  pending:  { label: "未付款", tone: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  partial:  { label: "部分付款", tone: "bg-sky-500/15 text-sky-400 border-sky-500/30" },
  paid:     { label: "已付款", tone: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  refunded: { label: "已退款", tone: "bg-rose-500/15 text-rose-400 border-rose-500/30" },
} as const;

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  bank_transfer: "銀行轉帳",
  credit_card: "信用卡",
  cash: "現金",
  cod: "貨到付款",
  other: "其他",
};

type OrderRow = {
  id: string;
  order_no: string;
  customer_name: string;
  customer_email: string | null;
  customer_phone: string | null;
  receiver_name: string;
  receiver_phone: string;
  shipping_address: string;
  shipping_method: string;
  subtotal: number;
  shipping_fee: number;
  discount_amount: number;
  total_amount: number;
  order_status: keyof typeof ORDER_STATUS;
  shipping_status: keyof typeof SHIPPING_STATUS;
  payment_status: keyof typeof PAYMENT_STATUS;
  notes: string | null;
  created_at: string;
};

// =================== Helpers ===================
function fmt(n: number | string | null | undefined) {
  return `NT$ ${Number(n ?? 0).toLocaleString()}`;
}
function genOrderNo() {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `SO-${ymd}-${String(Date.now()).slice(-5)}`;
}

// =================== Page ===================
function OrdersPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"all" | keyof typeof ORDER_STATUS>("all");
  const [search, setSearch] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);

  const ordersQ = useQuery({
    queryKey: ["sales-orders", tab, search],
    queryFn: async () => {
      let q = supabase
        .from("sales_orders")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (tab !== "all") q = q.eq("order_status", tab);
      if (search.trim()) {
        const s = search.trim();
        q = q.or(`order_no.ilike.%${s}%,customer_name.ilike.%${s}%,customer_email.ilike.%${s}%`);
      }
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data ?? []) as OrderRow[];
    },
  });

  const kpis = useMemo(() => {
    const list = ordersQ.data ?? [];
    return {
      total: list.length,
      revenue: list.reduce((s, r) => s + Number(r.total_amount), 0),
      pending: list.filter((r) => r.order_status === "pending").length,
      toShip: list.filter((r) => r.shipping_status === "pending" && r.order_status !== "cancelled").length,
      unpaid: list.filter((r) => r.payment_status !== "paid" && r.order_status !== "cancelled").length,
    };
  }, [ordersQ.data]);

  function refresh() {
    qc.invalidateQueries({ queryKey: ["sales-orders"] });
    if (detailId) qc.invalidateQueries({ queryKey: ["sales-order-detail", detailId] });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ShoppingCart className="h-6 w-6 text-primary" />
            訂單管理
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            訂單流程、出貨狀態與金流追蹤
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={refresh} disabled={ordersQ.isFetching}>
            {ordersQ.isFetching
              ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              : <RotateCw className="h-4 w-4 mr-2" />}
            重新整理
          </Button>
          <NewOrderDialog onCreated={refresh} />
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-5">
        <KpiCard label="訂單總數" value={String(kpis.total)} />
        <KpiCard label="營收合計" value={fmt(kpis.revenue)} accent="text-success" />
        <KpiCard label="待處理" value={String(kpis.pending)} accent="text-warning" />
        <KpiCard label="待出貨" value={String(kpis.toShip)} accent="text-sky-400" />
        <KpiCard label="未收齊" value={String(kpis.unpaid)} accent="text-rose-400" />
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
              <TabsList>
                <TabsTrigger value="all">全部</TabsTrigger>
                <TabsTrigger value="pending">待處理</TabsTrigger>
                <TabsTrigger value="processing">處理中</TabsTrigger>
                <TabsTrigger value="completed">已完成</TabsTrigger>
                <TabsTrigger value="cancelled">已取消</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="relative w-full sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="搜尋訂單號 / 客戶 / Email"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">訂單清單 ({ordersQ.data?.length ?? 0})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {ordersQ.isLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">載入中...</div>
          ) : !ordersQ.data?.length ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              尚無訂單。點擊右上「新增訂單」開始建立。
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>訂單號</TableHead>
                    <TableHead>客戶</TableHead>
                    <TableHead>建立日期</TableHead>
                    <TableHead className="text-right">總金額</TableHead>
                    <TableHead>訂單狀態</TableHead>
                    <TableHead>出貨</TableHead>
                    <TableHead>金流</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ordersQ.data.map((o) => (
                    <TableRow key={o.id} className="hover:bg-muted/30">
                      <TableCell className="font-mono text-xs">{o.order_no}</TableCell>
                      <TableCell>
                        <div className="font-medium text-sm">{o.customer_name}</div>
                        <div className="text-xs text-muted-foreground truncate max-w-[180px]">
                          {o.customer_email ?? "—"}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(o.created_at).toLocaleDateString("zh-TW")}
                      </TableCell>
                      <TableCell className="text-right font-semibold">{fmt(o.total_amount)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={ORDER_STATUS[o.order_status]?.tone}>
                          {ORDER_STATUS[o.order_status]?.label ?? o.order_status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={SHIPPING_STATUS[o.shipping_status]?.tone}>
                          {SHIPPING_STATUS[o.shipping_status]?.label ?? o.shipping_status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={PAYMENT_STATUS[o.payment_status]?.tone}>
                          {PAYMENT_STATUS[o.payment_status]?.label ?? o.payment_status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="ghost" onClick={() => setDetailId(o.id)}>
                          <Eye className="h-3.5 w-3.5 mr-1" /> 詳情
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <OrderDetailDialog
        orderId={detailId}
        onClose={() => setDetailId(null)}
        onChanged={refresh}
      />
    </div>
  );
}

function KpiCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className={`text-xl font-bold mt-1 ${accent ?? ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

// =================== New order dialog ===================
function NewOrderDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [customer, setCustomer] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [subtotal, setSubtotal] = useState("");
  const [shippingFee, setShippingFee] = useState("0");
  const [discount, setDiscount] = useState("0");
  const [notes, setNotes] = useState("");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const customersQ = useQuery({
    queryKey: ["customers-picker"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id,name,email,phone,company")
        .order("updated_at", { ascending: false })
        .limit(200);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });


  const total = useMemo(
    () => Math.max(0, Number(subtotal || 0) + Number(shippingFee || 0) - Number(discount || 0)),
    [subtotal, shippingFee, discount],
  );

  const m = useMutation({
    mutationFn: async () => {
      if (!customer || !address || !phone || !subtotal) {
        throw new Error("請填寫必填欄位（客戶、電話、地址、小計）");
      }
      const { error } = await supabase.from("sales_orders").insert({
        order_no: genOrderNo(),
        customer_name: customer,
        customer_email: email || null,
        customer_phone: phone || null,
        receiver_name: customer,
        receiver_phone: phone,
        shipping_address: address,
        shipping_method: "home_delivery",
        subtotal: Number(subtotal),
        shipping_fee: Number(shippingFee || 0),
        discount_amount: Number(discount || 0),
        total_amount: total,
        notes: notes || null,
        order_status: "pending",
        shipping_status: "pending",
        payment_status: "pending",
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("訂單已建立");
      setOpen(false);
      setCustomer(""); setEmail(""); setPhone(""); setAddress("");
      setSubtotal(""); setShippingFee("0"); setDiscount("0"); setNotes("");
      onCreated();
    },
    onError: (e: any) => toast.error(e?.message ?? "建立失敗"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-gradient-primary">
          <Plus className="h-4 w-4 mr-2" /> 新增訂單
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>新增訂單</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>客戶姓名 *</Label><Input value={customer} onChange={(e) => setCustomer(e.target.value)} /></div>
            <div><Label>電話 *</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          </div>
          <div><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div><Label>收件地址 *</Label><Input value={address} onChange={(e) => setAddress(e.target.value)} /></div>
          <div className="grid grid-cols-3 gap-3">
            <div><Label>小計 *</Label><Input type="number" value={subtotal} onChange={(e) => setSubtotal(e.target.value)} /></div>
            <div><Label>運費</Label><Input type="number" value={shippingFee} onChange={(e) => setShippingFee(e.target.value)} /></div>
            <div><Label>折扣</Label><Input type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} /></div>
          </div>
          <div className="text-right text-sm">
            訂單總額：<span className="text-lg font-bold text-primary ml-1">{fmt(total)}</span>
          </div>
          <div><Label>備註</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
          <Button onClick={() => m.mutate()} disabled={m.isPending} className="bg-gradient-primary">
            {m.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} 建立訂單
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =================== Detail dialog ===================
function OrderDetailDialog({
  orderId, onClose, onChanged,
}: {
  orderId: string | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const detailQ = useQuery({
    queryKey: ["sales-order-detail", orderId],
    enabled: !!orderId,
    queryFn: async () => {
      const [orderRes, itemsRes, paymentsRes] = await Promise.all([
        supabase.from("sales_orders").select("*").eq("id", orderId!).maybeSingle(),
        supabase.from("sales_order_items").select("*").eq("sales_order_id", orderId!).order("created_at"),
        supabase.from("payments").select("*").eq("sales_order_id", orderId!).order("created_at", { ascending: false }),
      ]);
      if (orderRes.error) throw new Error(orderRes.error.message);
      return {
        order: orderRes.data as OrderRow | null,
        items: itemsRes.data ?? [],
        payments: paymentsRes.data ?? [],
      };
    },
  });

  const order = detailQ.data?.order;
  const items = detailQ.data?.items ?? [];
  const payments = detailQ.data?.payments ?? [];
  const paidTotal = payments
    .filter((p: any) => p.payment_status === "completed")
    .reduce((s: number, p: any) => s + Number(p.amount), 0);
  const pendingPayments = payments.filter((p: any) => p.payment_status !== "completed");
  const pendingPaymentsTotal = pendingPayments.reduce((s: number, p: any) => s + Number(p.amount ?? 0), 0);
  const unpaid = order ? Math.max(0, Number(order.total_amount) - paidTotal) : 0;

  const updateStatus = useMutation({
    mutationFn: async (patch: Partial<Pick<OrderRow, "order_status" | "shipping_status" | "payment_status">>) => {
      if (!orderId) return;
      const { error } = await supabase.from("sales_orders").update(patch).eq("id", orderId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("狀態已更新");
      qc.invalidateQueries({ queryKey: ["sales-order-detail", orderId] });
      onChanged();
    },
    onError: (e: any) => toast.error(e?.message ?? "更新失敗"),
  });

  return (
    <Dialog open={!!orderId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-primary" />
            訂單詳情 {order && <span className="font-mono text-sm text-muted-foreground">{order.order_no}</span>}
          </DialogTitle>
        </DialogHeader>

        {detailQ.isLoading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">載入中...</div>
        ) : !order ? (
          <div className="py-12 text-center text-sm text-muted-foreground">找不到訂單</div>
        ) : (
          <div className="space-y-4">
            {/* Status section */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">狀態流程</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <StatusSelect
                  label="訂單狀態"
                  icon={<PackageCheck className="h-3.5 w-3.5" />}
                  value={order.order_status}
                  options={ORDER_STATUS}
                  onChange={(v) => updateStatus.mutate({ order_status: v as any })}
                  disabled={updateStatus.isPending}
                />
                <StatusSelect
                  label="出貨狀態"
                  icon={<Truck className="h-3.5 w-3.5" />}
                  value={order.shipping_status}
                  options={SHIPPING_STATUS}
                  onChange={(v) => updateStatus.mutate({ shipping_status: v as any })}
                  disabled={updateStatus.isPending}
                />
                <StatusSelect
                  label="付款狀態"
                  icon={<CreditCard className="h-3.5 w-3.5" />}
                  value={order.payment_status}
                  options={PAYMENT_STATUS}
                  onChange={(v) => updateStatus.mutate({ payment_status: v as any })}
                  disabled={updateStatus.isPending}
                />
              </CardContent>
            </Card>

            {/* Customer & summary */}
            <div className="grid md:grid-cols-2 gap-3">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">客戶資料</CardTitle></CardHeader>
                <CardContent className="text-sm space-y-1">
                  <div><span className="text-muted-foreground">姓名：</span>{order.customer_name}</div>
                  <div><span className="text-muted-foreground">電話：</span>{order.customer_phone ?? order.receiver_phone}</div>
                  <div><span className="text-muted-foreground">Email：</span>{order.customer_email ?? "—"}</div>
                  <div><span className="text-muted-foreground">地址：</span>{order.shipping_address}</div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">金額明細</CardTitle></CardHeader>
                <CardContent className="text-sm space-y-1">
                  <Row k="商品小計" v={fmt(order.subtotal)} />
                  <Row k="運費" v={fmt(order.shipping_fee)} />
                  <Row k="折扣" v={`- ${fmt(order.discount_amount)}`} />
                  <div className="border-t border-border my-1" />
                  <Row k="訂單總額" v={fmt(order.total_amount)} bold />
                  <Row k="已收款" v={fmt(paidTotal)} accent="text-success" />
                  <Row k="未收款" v={fmt(unpaid)} accent={unpaid > 0 ? "text-warning" : "text-success"} />
                  <div className="pt-2 space-y-1">
                    <Progress
                      value={Number(order.total_amount) > 0
                        ? Math.min(100, (paidTotal / Number(order.total_amount)) * 100)
                        : 0}
                      className="h-2"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>收款進度</span>
                      <span>
                        {Number(order.total_amount) > 0
                          ? Math.round((paidTotal / Number(order.total_amount)) * 100)
                          : 0}%
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* 收款摘要：已收 / 應收 / 差額 */}
            {(() => {
              const receivable = Number(order.total_amount);
              const diff = paidTotal - receivable; // 負數表示尚有未收
              const diffNegative = diff < 0;
              const diffColor = diffNegative
                ? "text-destructive"
                : diff > 0 ? "text-warning" : "text-success";
              return (
                <div className="grid grid-cols-3 gap-3">
                  <Card><CardContent className="pt-4">
                    <div className="text-xs uppercase tracking-wider text-muted-foreground">已收</div>
                    <div className="text-xl font-bold mt-1 text-success">{fmt(paidTotal)}</div>
                  </CardContent></Card>
                  <Card><CardContent className="pt-4">
                    <div className="text-xs uppercase tracking-wider text-muted-foreground">應收</div>
                    <div className="text-xl font-bold mt-1">{fmt(receivable)}</div>
                  </CardContent></Card>
                  <Card className={diffNegative ? "border-destructive/40" : undefined}>
                    <CardContent className="pt-4">
                      <div className="text-xs uppercase tracking-wider text-muted-foreground">差額</div>
                      <div className={`text-xl font-bold mt-1 ${diffColor}`}>
                        {diff < 0 ? `- ${fmt(Math.abs(diff))}` : fmt(diff)}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {diffNegative ? "尚有未收款" : diff > 0 ? "已超收" : "已結清"}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              );
            })()}


            {/* Items */}
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">訂單品項 ({items.length})</CardTitle></CardHeader>
              <CardContent className="p-0">
                {items.length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">尚無品項</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>商品</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead className="text-right">單價</TableHead>
                        <TableHead className="text-right">數量</TableHead>
                        <TableHead className="text-right">小計</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((it: any) => (
                        <TableRow key={it.id}>
                          <TableCell className="text-sm">{it.product_name}</TableCell>
                          <TableCell className="font-mono text-xs">{it.sku ?? "—"}</TableCell>
                          <TableCell className="text-right">{fmt(it.unit_price)}</TableCell>
                          <TableCell className="text-right">{it.quantity}</TableCell>
                          <TableCell className="text-right font-medium">{fmt(it.subtotal)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter>
                      <TableRow>
                        <TableCell colSpan={3} className="text-right text-xs text-muted-foreground">
                          品項合計
                        </TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">
                          {items.reduce((s: number, it: any) => s + Number(it.quantity ?? 0), 0)} 件
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {fmt(items.reduce((s: number, it: any) => s + Number(it.subtotal ?? 0), 0))}
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>

                )}
              </CardContent>
            </Card>

            {/* Payments */}
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-sm">金流紀錄 ({payments.length})</CardTitle>
                {unpaid > 0 && order.order_status !== "cancelled" && (
                  <RecordPaymentDialog
                    orderId={order.id}
                    unpaid={unpaid}
                    totalAmount={Number(order.total_amount)}
                    onRecorded={() => {
                      qc.invalidateQueries({ queryKey: ["sales-order-detail", orderId] });
                      onChanged();
                    }}
                  />
                )}
              </CardHeader>
              <CardContent className="p-0">
                {payments.length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">尚無付款紀錄</div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>日期</TableHead>
                        <TableHead>方式</TableHead>
                        <TableHead>交易編號</TableHead>
                        <TableHead>狀態</TableHead>
                        <TableHead className="text-right">金額</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payments.map((p: any) => (
                        <TableRow key={p.id}>
                          <TableCell className="text-xs text-muted-foreground">
                            {new Date(p.paid_at ?? p.created_at).toLocaleString("zh-TW")}
                          </TableCell>
                          <TableCell className="text-sm">{PAYMENT_METHOD_LABEL[p.payment_method] ?? p.payment_method}</TableCell>
                          <TableCell className="font-mono text-xs">{p.transaction_id ?? "—"}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={
                              p.payment_status === "completed"
                                ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                                : "bg-amber-500/15 text-amber-400 border-amber-500/30"
                            }>
                              {p.payment_status === "completed" ? "已完成" : p.payment_status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-medium">{fmt(p.amount)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter>
                      <TableRow>
                        <TableCell colSpan={4} className="text-right text-xs text-muted-foreground">已收款合計</TableCell>
                        <TableCell className="text-right font-semibold text-success">{fmt(paidTotal)}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell colSpan={4} className="text-right text-xs text-muted-foreground">未收款</TableCell>
                        <TableCell className={`text-right font-semibold ${unpaid > 0 ? "text-warning" : "text-success"}`}>
                          {fmt(unpaid)}
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>

                )}
              </CardContent>
            </Card>

            {/* Outstanding (unpaid) breakdown - expandable */}
            {unpaid > 0 && (
              <Card>
                <CardContent className="p-0">
                  <details className="group" open={pendingPayments.length > 0}>
                    <summary className="cursor-pointer list-none p-4 flex items-center justify-between hover:bg-muted/30 transition-colors">
                      <div className="flex items-center gap-2 text-sm">
                        <CreditCard className="h-4 w-4 text-warning" />
                        <span className="font-medium">未收款明細</span>
                        <Badge variant="outline" className="bg-amber-500/15 text-amber-400 border-amber-500/30">
                          應收 {fmt(unpaid)}
                        </Badge>
                        {pendingPayments.length > 0 && (
                          <span className="text-xs text-muted-foreground">
                            其中 {pendingPayments.length} 筆待入帳 ({fmt(pendingPaymentsTotal)})
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground group-open:rotate-180 transition-transform">▾</span>
                    </summary>
                    <div className="border-t border-border">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>項目</TableHead>
                            <TableHead>付款狀態</TableHead>
                            <TableHead>方式</TableHead>
                            <TableHead>建立時間</TableHead>
                            <TableHead className="text-right">應收金額</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {pendingPayments.map((p: any) => (
                            <TableRow key={p.id}>
                              <TableCell className="text-sm">待入帳付款</TableCell>
                              <TableCell>
                                <Badge variant="outline" className="bg-amber-500/15 text-amber-400 border-amber-500/30">
                                  {p.payment_status === "pending" ? "待處理"
                                    : p.payment_status === "failed" ? "失敗"
                                    : p.payment_status}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-sm">
                                {PAYMENT_METHOD_LABEL[p.payment_method] ?? p.payment_method}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {new Date(p.created_at).toLocaleString("zh-TW")}
                              </TableCell>
                              <TableCell className="text-right font-medium text-warning">{fmt(p.amount)}</TableCell>
                            </TableRow>
                          ))}
                          {unpaid - pendingPaymentsTotal > 0 && (
                            <TableRow>
                              <TableCell className="text-sm">尚未記錄的餘額</TableCell>
                              <TableCell>
                                <Badge variant="outline" className="bg-rose-500/15 text-rose-400 border-rose-500/30">
                                  未開立
                                </Badge>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground">—</TableCell>
                              <TableCell className="text-xs text-muted-foreground">—</TableCell>
                              <TableCell className="text-right font-medium text-rose-400">
                                {fmt(Math.max(0, unpaid - pendingPaymentsTotal))}
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                        <TableFooter>
                          <TableRow>
                            <TableCell colSpan={4} className="text-right text-xs text-muted-foreground">應收合計</TableCell>
                            <TableCell className="text-right font-semibold text-warning">{fmt(unpaid)}</TableCell>
                          </TableRow>
                        </TableFooter>
                      </Table>
                    </div>
                  </details>
                </CardContent>
              </Card>
            )}


            {order.order_status !== "cancelled" && (
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-rose-400 border-rose-500/30 hover:bg-rose-500/10"
                  disabled={updateStatus.isPending}
                  onClick={() => updateStatus.mutate({ order_status: "cancelled" })}
                >
                  <XCircle className="h-4 w-4 mr-1" /> 取消訂單
                </Button>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>關閉</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Row({ k, v, bold, accent }: { k: string; v: string; bold?: boolean; accent?: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{k}</span>
      <span className={`${bold ? "font-bold text-base" : ""} ${accent ?? ""}`}>{v}</span>
    </div>
  );
}

function StatusSelect<T extends string>({
  label, icon, value, options, onChange, disabled,
}: {
  label: string;
  icon: React.ReactNode;
  value: T;
  options: Record<string, { label: string; tone: string }>;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs flex items-center gap-1">{icon}{label}</Label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          {Object.entries(options).map(([k, v]) => (
            <SelectItem key={k} value={k}>{v.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// =================== Record payment ===================
function RecordPaymentDialog({
  orderId, unpaid, totalAmount, onRecorded,
}: {
  orderId: string;
  unpaid: number;
  totalAmount: number;
  onRecorded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(unpaid));
  const [method, setMethod] = useState("bank_transfer");
  const [txId, setTxId] = useState("");

  const m = useMutation({
    mutationFn: async () => {
      const n = Number(amount);
      if (!n || n <= 0) throw new Error("請輸入有效金額");
      if (n > unpaid) throw new Error(`金額不可大於未收金額 ${fmt(unpaid)}`);

      const nowIso = new Date().toISOString();
      const { error: payErr } = await supabase.from("payments").insert({
        sales_order_id: orderId,
        payment_method: method,
        payment_status: "completed",
        amount: n,
        transaction_id: txId || null,
        paid_at: nowIso,
      });
      if (payErr) throw new Error(payErr.message);

      // Update order payment_status
      const remaining = unpaid - n;
      const nextStatus = remaining <= 0 ? "paid" : "partial";
      const { error: upErr } = await supabase
        .from("sales_orders")
        .update({ payment_status: nextStatus })
        .eq("id", orderId);
      if (upErr) throw new Error(upErr.message);

      return { nextStatus };
    },
    onSuccess: ({ nextStatus }) => {
      toast.success(`已記錄付款（訂單狀態：${PAYMENT_STATUS[nextStatus as keyof typeof PAYMENT_STATUS]?.label}）`);
      setOpen(false);
      setAmount(String(unpaid));
      setTxId("");
      onRecorded();
    },
    onError: (e: any) => toast.error(e?.message ?? "記錄失敗"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="bg-gradient-primary">
          <CreditCard className="h-3.5 w-3.5 mr-1" /> 記錄付款
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>記錄付款</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div className="text-xs text-muted-foreground">
            訂單總額 {fmt(totalAmount)}，未收金額 <span className="font-semibold text-warning">{fmt(unpaid)}</span>
          </div>
          <div>
            <Label>付款方式</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="bank_transfer">銀行轉帳</SelectItem>
                <SelectItem value="credit_card">信用卡</SelectItem>
                <SelectItem value="cash">現金</SelectItem>
                <SelectItem value="cod">貨到付款</SelectItem>
                <SelectItem value="other">其他</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>付款金額 *</Label>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div>
            <Label>交易編號</Label>
            <Input value={txId} onChange={(e) => setTxId(e.target.value)} placeholder="選填" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
          <Button onClick={() => m.mutate()} disabled={m.isPending} className="bg-gradient-primary">
            {m.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} 確認記錄
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
