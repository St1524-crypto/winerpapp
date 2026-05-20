import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ShoppingCart, Search, Plus, Loader2, Eye, Truck, CreditCard,
  PackageCheck, XCircle, RotateCw, Receipt, UserSearch, Check, UserPlus,
  Package, Trash2, Printer, Pencil,
} from "lucide-react";
import { exportOrderPdf, exportOrdersPdf } from "@/lib/order-pdf";
import { useBranding } from "@/hooks/use-branding";
import { useCurrentCompany } from "@/hooks/use-current-company";
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
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { z } from "zod";

// =================== Quick-add customer schema ===================
const quickAddCustomerSchema = z.object({
  name: z.string().trim().min(1, "請輸入客戶姓名").max(100, "姓名最多 100 字"),
  email: z
    .string()
    .trim()
    .max(255, "Email 最多 255 字")
    .email("Email 格式不正確")
    .optional()
    .or(z.literal("")),
  phone: z
    .string()
    .trim()
    .max(20, "電話最多 20 碼")
    .regex(/^[0-9+\-\s()]{7,20}$/, "電話格式不正確（僅允許數字與 +-() 空白，至少 7 碼）")
    .optional()
    .or(z.literal("")),
  company: z.string().trim().max(100, "公司名稱最多 100 字").optional().or(z.literal("")),
});

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
  company_id: string;
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
  const [printingId, setPrintingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchPrinting, setBatchPrinting] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{
    current: number;
    total: number;
    orderNo: string;
  } | null>(null);
  const [batchFailures, setBatchFailures] = useState<
    Array<{ orderNo: string; error: string }>
  >([]);
  const batchAbortRef = useRef<AbortController | null>(null);
  const { logoUrl } = useBranding();

  function toggleSelect(id: string) {
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }
  function toggleSelectAll(ids: string[], checked: boolean) {
    setSelected((s) => {
      const n = new Set(s);
      if (checked) ids.forEach((id) => n.add(id));
      else ids.forEach((id) => n.delete(id));
      return n;
    });
  }

  function cancelBatchPrint() {
    batchAbortRef.current?.abort();
  }

  async function handleBatchPrint() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    const controller = new AbortController();
    batchAbortRef.current = controller;
    setBatchFailures([]);
    setBatchProgress({ current: 0, total: ids.length, orderNo: "" });
    setBatchPrinting(true);

    try {
      const [ordersRes, itemsRes, paymentsRes] = await Promise.all([
        supabase.from("sales_orders").select("*").in("id", ids),
        supabase.from("sales_order_items").select("*").in("sales_order_id", ids).order("created_at"),
        supabase.from("payments").select("*").in("sales_order_id", ids).order("created_at", { ascending: false }),
      ]);
      if (ordersRes.error) throw new Error(ordersRes.error.message);
      if (controller.signal.aborted) return;

      const orderList = (ordersRes.data ?? []) as any[];
      const itemsByOrder = new Map<string, any[]>();
      (itemsRes.data ?? []).forEach((it: any) => {
        const arr = itemsByOrder.get(it.sales_order_id) ?? [];
        arr.push(it);
        itemsByOrder.set(it.sales_order_id, arr);
      });
      const paymentsByOrder = new Map<string, any[]>();
      (paymentsRes.data ?? []).forEach((p: any) => {
        const arr = paymentsByOrder.get(p.sales_order_id) ?? [];
        arr.push(p);
        paymentsByOrder.set(p.sales_order_id, arr);
      });
      const orderMap = new Map(orderList.map((o) => [o.id, o]));
      const sorted = ids.map((id) => orderMap.get(id)).filter(Boolean);
      const payload = sorted.map((o: any) => ({
        order: o,
        items: itemsByOrder.get(o.id) ?? [],
        payments: paymentsByOrder.get(o.id) ?? [],
      }));

      const res = await exportOrdersPdf(payload, logoUrl, {
        signal: controller.signal,
        onProgress: (current, total, orderNo) =>
          setBatchProgress({ current, total, orderNo }),
      });

      setBatchFailures(res.failures);

      if (res.cancelled) {
        toast.warning(
          `已取消，已輸出 ${res.success} 筆${res.failures.length ? `、失敗 ${res.failures.length} 筆` : ""}`,
        );
      } else if (res.failures.length === 0) {
        toast.success(`已匯出 ${res.success} 筆訂單 PDF`);
      } else {
        toast.error(
          `完成：成功 ${res.success} 筆、失敗 ${res.failures.length} 筆（${res.failures
            .slice(0, 3)
            .map((f) => f.orderNo)
            .join("、")}${res.failures.length > 3 ? "..." : ""}）`,
        );
      }
    } catch (e: any) {
      toast.error(e?.message ?? "批次列印失敗");
    } finally {
      setBatchPrinting(false);
      setBatchProgress(null);
      batchAbortRef.current = null;
    }
  }


  async function handlePrintOrder(orderId: string) {
    try {
      setPrintingId(orderId);
      const [orderRes, itemsRes, paymentsRes] = await Promise.all([
        supabase.from("sales_orders").select("*").eq("id", orderId).maybeSingle(),
        supabase.from("sales_order_items").select("*").eq("sales_order_id", orderId).order("created_at"),
        supabase.from("payments").select("*").eq("sales_order_id", orderId).order("created_at", { ascending: false }),
      ]);
      if (orderRes.error || !orderRes.data) throw new Error(orderRes.error?.message ?? "找不到訂單");
      await exportOrderPdf({
        order: orderRes.data as any,
        items: (itemsRes.data ?? []) as any,
        payments: (paymentsRes.data ?? []) as any,
        logoUrl,
      });
      toast.success("PDF 已產生");
    } catch (e: any) {
      toast.error(e?.message ?? "列印失敗");
    } finally {
      setPrintingId(null);
    }
  }

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
        <CardHeader className="pb-3 flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base">訂單清單 ({ordersQ.data?.length ?? 0})</CardTitle>
          {selected.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">已選 {selected.size} 筆</span>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} disabled={batchPrinting}>
                取消選取
              </Button>
              <Button size="sm" className="bg-gradient-primary" onClick={handleBatchPrint} disabled={batchPrinting}>
                {batchPrinting
                  ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                  : <Printer className="h-3.5 w-3.5 mr-1" />}
                批次匯出 PDF
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {ordersQ.isLoading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">載入中...</div>
          ) : !ordersQ.data?.length ? (
            <div className="p-12 text-center text-sm text-muted-foreground">
              尚無訂單。點擊右上「新增訂單」開始建立。
            </div>
          ) : (
            <>
              {/* Mobile: card list */}
              <div className="md:hidden divide-y divide-border">
                {ordersQ.data.map((o) => (
                  <div key={o.id} className="p-4 space-y-2 active:bg-muted/30">
                    <div className="flex items-start gap-2">
                      <Checkbox
                        checked={selected.has(o.id)}
                        onCheckedChange={() => toggleSelect(o.id)}
                        aria-label={`選取 ${o.order_no}`}
                        className="mt-1"
                      />
                      <button
                        onClick={() => setDetailId(o.id)}
                        className="flex-1 text-left"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-xs text-muted-foreground">{o.order_no}</span>
                          <span className="text-base font-semibold">{fmt(o.total_amount)}</span>
                        </div>
                        <div className="mt-1 font-medium text-sm truncate">{o.customer_name}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {o.customer_email ?? "—"} · {new Date(o.created_at).toLocaleDateString("zh-TW")}
                        </div>
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="outline" className={ORDER_STATUS[o.order_status]?.tone}>
                        {ORDER_STATUS[o.order_status]?.label ?? o.order_status}
                      </Badge>
                      <Badge variant="outline" className={SHIPPING_STATUS[o.shipping_status]?.tone}>
                        {SHIPPING_STATUS[o.shipping_status]?.label ?? o.shipping_status}
                      </Badge>
                      <PaymentStatusCell orderId={o.id} value={o.payment_status} onChanged={refresh} />
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button size="sm" variant="outline" className="flex-1" onClick={() => setDetailId(o.id)}>
                        <Eye className="h-3.5 w-3.5 mr-1" /> 詳情
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handlePrintOrder(o.id)}
                        disabled={printingId === o.id}
                      >
                        {printingId === o.id
                          ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                          : <Printer className="h-3.5 w-3.5 mr-1" />}
                        列印
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop: table */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={
                            ordersQ.data.length > 0 &&
                            ordersQ.data.every((o) => selected.has(o.id))
                          }
                          onCheckedChange={(c) =>
                            toggleSelectAll(ordersQ.data!.map((o) => o.id), !!c)
                          }
                          aria-label="全選"
                        />
                      </TableHead>
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
                      <TableRow key={o.id} className="hover:bg-muted/30" data-state={selected.has(o.id) ? "selected" : undefined}>
                        <TableCell>
                          <Checkbox
                            checked={selected.has(o.id)}
                            onCheckedChange={() => toggleSelect(o.id)}
                            aria-label={`選取 ${o.order_no}`}
                          />
                        </TableCell>
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
                          <PaymentStatusCell
                            orderId={o.id}
                            value={o.payment_status}
                            onChanged={refresh}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="ghost" onClick={() => setDetailId(o.id)}>
                              <Eye className="h-3.5 w-3.5 mr-1" /> 詳情
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handlePrintOrder(o.id)}
                              disabled={printingId === o.id}
                              title="列印 PDF"
                            >
                              {printingId === o.id
                                ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                                : <Printer className="h-3.5 w-3.5 mr-1" />}
                              列印
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <OrderDetailDialog
        orderId={detailId}
        onClose={() => setDetailId(null)}
        onChanged={refresh}
      />

      {/* 批次匯出進度 */}
      <Dialog
        open={batchPrinting}
        onOpenChange={(o) => {
          if (!o && batchPrinting) cancelBatchPrint();
        }}
      >
        <DialogContent className="max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Printer className="h-4 w-4 text-primary" />
              批次匯出 PDF
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Progress
              value={
                batchProgress && batchProgress.total > 0
                  ? (batchProgress.current / batchProgress.total) * 100
                  : 0
              }
              className="h-2"
            />
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">
                {batchProgress
                  ? `處理中 ${batchProgress.current} / ${batchProgress.total}`
                  : "準備中..."}
              </span>
              <span className="font-mono text-xs text-muted-foreground">
                {batchProgress?.orderNo ?? ""}
              </span>
            </div>
            {batchAbortRef.current?.signal.aborted && (
              <p className="text-xs text-warning">已要求取消，正在收尾中...</p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={cancelBatchPrint}
              disabled={!!batchAbortRef.current?.signal.aborted}
            >
              <XCircle className="h-4 w-4 mr-1" />
              {batchAbortRef.current?.signal.aborted ? "取消中..." : "取消"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 失敗清單 */}
      <Dialog
        open={!batchPrinting && batchFailures.length > 0}
        onOpenChange={(o) => !o && setBatchFailures([])}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <XCircle className="h-4 w-4" />
              批次匯出有 {batchFailures.length} 筆失敗
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-72 overflow-y-auto space-y-2 py-2">
            {batchFailures.map((f, i) => (
              <div
                key={`${f.orderNo}-${i}`}
                className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2"
              >
                <div className="font-mono text-xs font-medium">{f.orderNo}</div>
                <div className="text-xs text-muted-foreground mt-0.5 break-words">
                  {f.error}
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBatchFailures([])}>
              關閉
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
  const [items, setItems] = useState<Array<{ product_id: string; name: string; sku: string | null; image: string | null; unit_price: number; quantity: number }>>([]);
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [shippingFee, setShippingFee] = useState("0");
  const [discount, setDiscount] = useState("0");
  const [deposit, setDeposit] = useState("0");
  const [balance, setBalance] = useState("0");
  const [depositMethod, setDepositMethod] = useState("bank_transfer");
  const [taxAdded, setTaxAdded] = useState(false);
  const [notes, setNotes] = useState("");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [qaName, setQaName] = useState("");
  const [qaEmail, setQaEmail] = useState("");
  const [qaPhone, setQaPhone] = useState("");
  const [qaCompany, setQaCompany] = useState("");
  const qc = useQueryClient();
  const { currentCompanyId } = useCurrentCompany();

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

  const productsQ = useQuery({
    queryKey: ["products-picker-orders"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id,name,sku,price,image,stock")
        .eq("status", "active")
        .order("updated_at", { ascending: false })
        .limit(300);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  function addItem(p: { id: string; name: string; sku: string | null; price: number; image: string | null }) {
    setItems((prev) => {
      const idx = prev.findIndex((x) => x.product_id === p.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
        return next;
      }
      return [...prev, { product_id: p.id, name: p.name, sku: p.sku, image: p.image, unit_price: Number(p.price ?? 0), quantity: 1 }];
    });
    setProductPickerOpen(false);
  }
  function updateItem(idx: number, patch: Partial<{ unit_price: number; quantity: number }>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }
  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  // 即時校驗：取得各欄位的錯誤訊息（僅在欄位被觸碰過後顯示）
  const [qaTouched, setQaTouched] = useState<Record<string, boolean>>({});
  const qaValidation = useMemo(() => {
    const result = quickAddCustomerSchema.safeParse({
      name: qaName, email: qaEmail, phone: qaPhone, company: qaCompany,
    });
    if (result.success) return { ok: true as const, errors: {} as Record<string, string> };
    const errors: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const key = issue.path[0] as string;
      if (!errors[key]) errors[key] = issue.message;
    }
    return { ok: false as const, errors };
  }, [qaName, qaEmail, qaPhone, qaCompany]);

  const quickAddMut = useMutation({
    mutationFn: async () => {
      const parsed = quickAddCustomerSchema.safeParse({
        name: qaName, email: qaEmail, phone: qaPhone, company: qaCompany,
      });
      if (!parsed.success) {
        setQaTouched({ name: true, email: true, phone: true, company: true });
        throw new Error(parsed.error.issues[0]?.message ?? "資料格式不正確");
      }
      if (!currentCompanyId) throw new Error("尚未選擇公司");
      const { data, error } = await supabase
        .from("customers")
        .insert({
          name: parsed.data.name,
          email: parsed.data.email?.trim() || null,
          phone: parsed.data.phone?.trim() || null,
          company: parsed.data.company?.trim() || null,
          company_id: currentCompanyId,
        })
        .select("id,name,email,phone,company")
        .single();
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: (created) => {
      toast.success(`已新增客戶：${created.name}`);
      qc.invalidateQueries({ queryKey: ["customers-picker"] });
      pickCustomer(created);
      setQuickAddOpen(false);
      setQaName(""); setQaEmail(""); setQaPhone(""); setQaCompany("");
      setQaTouched({});
    },
    onError: (e: any) => toast.error(e?.message ?? "新增客戶失敗"),
  });




  const subtotalNum = useMemo(
    () => items.reduce((s, it) => s + Number(it.unit_price || 0) * Number(it.quantity || 0), 0),
    [items],
  );
  const taxAmount = useMemo(
    () => (taxAdded ? Math.round(subtotalNum * 0.05) : 0),
    [taxAdded, subtotalNum],
  );
  const total = useMemo(
    () => Math.max(0, subtotalNum + taxAmount + Number(shippingFee || 0) - Number(discount || 0)),
    [subtotalNum, taxAmount, shippingFee, discount],
  );
  const depositNum = Number(deposit || 0);
  const balanceNum = Number(balance || 0);
  const paymentsTotal = depositNum + balanceNum;
  const paymentsDiff = total - paymentsTotal;

  const m = useMutation({
    mutationFn: async () => {
      if (!customer || !address || !phone) {
        throw new Error("請填寫必填欄位（客戶、電話、地址）");
      }
      if (items.length === 0) {
        throw new Error("請至少加入一項商品");
      }
      if (items.some((it) => !it.quantity || it.quantity <= 0 || it.unit_price < 0)) {
        throw new Error("商品數量需大於 0，且單價不可為負");
      }
      if (depositNum < 0 || balanceNum < 0) {
        throw new Error("訂金與尾款不可為負");
      }
      if (depositNum + balanceNum > total) {
        throw new Error("訂金 + 尾款不可超過訂單總額");
      }

      // 若未從客戶名單選取，使用手動輸入資料建立新客戶以保持訂單與客戶資料一致
      let linkedCustomerId = customerId;
      let createdNewCustomer = false;
      if (!linkedCustomerId) {
        const { data: created, error: custErr } = await supabase
          .from("customers")
          .insert({
            name: customer,
            email: email || null,
            phone: phone || null,
            company_id: currentCompanyId!,
          })
          .select("id")
          .single();
        if (custErr) throw new Error(`建立客戶失敗：${custErr.message}`);
        linkedCustomerId = created.id;
        createdNewCustomer = true;
      }

      // 依訂金決定付款狀態
      let paymentStatus: "pending" | "partial" | "paid" = "pending";
      if (depositNum >= total && total > 0) paymentStatus = "paid";
      else if (depositNum > 0) paymentStatus = "partial";

      // 組合付款紀錄（訂金已收、尾款待收）
      const paymentsPayload: Array<{
        amount: number;
        payment_method: string;
        payment_status: string;
        paid_at?: string;
      }> = [];
      if (depositNum > 0) {
        paymentsPayload.push({
          amount: depositNum,
          payment_method: depositMethod,
          payment_status: "paid",
          paid_at: new Date().toISOString(),
        });
      }
      if (balanceNum > 0) {
        paymentsPayload.push({
          amount: balanceNum,
          payment_method: depositMethod,
          payment_status: "pending",
        });
      }

      // 單一交易：訂單 + 商品明細 + 付款 一次寫入，任一失敗整筆回滾
      const { data: orderRow, error } = await supabase.rpc("create_sales_order_with_items", {
        _order: {
          order_no: genOrderNo(),
          customer_id: linkedCustomerId,
          customer_name: customer,
          customer_email: email || null,
          customer_phone: phone || null,
          receiver_name: customer,
          receiver_phone: phone,
          shipping_address: address,
          shipping_method: "home_delivery",
          subtotal: subtotalNum,
          shipping_fee: Number(shippingFee || 0),
          discount_amount: Number(discount || 0),
          total_amount: total,
          notes: notes || null,
          order_status: "pending",
          shipping_status: "pending",
          payment_status: paymentStatus,
        },
        _items: items.map((it) => ({
          product_id: it.product_id,
          product_name: it.name,
          sku: it.sku,
          image: it.image,
          unit_price: it.unit_price,
          quantity: it.quantity,
          subtotal: Number(it.unit_price) * Number(it.quantity),
        })),
        _payments: paymentsPayload,
      });
      if (error) throw new Error(`建立訂單失敗：${error.message}`);

      return { createdNewCustomer, orderRow };

    },

    onSuccess: (res) => {
      toast.success(res?.createdNewCustomer ? "訂單已建立，並同步新增客戶" : "訂單已建立");
      setOpen(false);
      setCustomer(""); setEmail(""); setPhone(""); setAddress("");
      setItems([]); setShippingFee("0"); setDiscount("0"); setNotes("");
      setDeposit("0"); setBalance("0");
      setCustomerId(null);
      onCreated();
    },
    onError: (e: any) => toast.error(e?.message ?? "建立失敗"),
  });

  function pickCustomer(c: { id: string; name: string; email: string | null; phone: string | null }) {
    setCustomerId(c.id);
    setCustomer(c.name);
    setEmail(c.email ?? "");
    setPhone(c.phone ?? "");
    setPickerOpen(false);
    toast.success(`已套用客戶資料：${c.name}`);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-gradient-primary">
          <Plus className="h-4 w-4 mr-2" /> 新增訂單
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl w-full max-h-[100dvh] sm:max-h-[90vh] h-[100dvh] sm:h-auto rounded-none sm:rounded-lg overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>新增訂單</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          {/* Customer lookup */}
          <div className="space-y-1.5">
            <Label className="flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <UserSearch className="h-3.5 w-3.5" /> 從客戶名單帶入
              </span>
              {customerId && (
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground underline"
                  onClick={() => { setCustomerId(null); setCustomer(""); setEmail(""); setPhone(""); }}
                >
                  清除選取
                </button>
              )}
            </Label>
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  className="w-full justify-between font-normal"
                >
                  <span className="truncate">
                    {customerId
                      ? `${customer}${email ? ` · ${email}` : ""}`
                      : "搜尋客戶姓名 / Email / 電話 / 公司"}
                  </span>
                  <Search className="h-4 w-4 text-muted-foreground shrink-0 ml-2" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="p-0 w-[var(--radix-popover-trigger-width)]" align="start">
                {quickAddOpen ? (
                  <div className="p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium flex items-center gap-1.5">
                        <UserPlus className="h-4 w-4 text-primary" /> 快速新增客戶
                      </div>
                      <button
                        type="button"
                        className="text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => setQuickAddOpen(false)}
                      >
                        返回搜尋
                      </button>
                    </div>
                    <div className="grid gap-2">
                      <div>
                        <Label className="text-xs">姓名 *</Label>
                        <Input
                          value={qaName}
                          onChange={(e) => setQaName(e.target.value)}
                          onBlur={() => setQaTouched((t) => ({ ...t, name: true }))}
                          placeholder="例：王小明"
                          maxLength={100}
                          aria-invalid={qaTouched.name && !!qaValidation.errors.name}
                          className={qaTouched.name && qaValidation.errors.name ? "border-destructive focus-visible:ring-destructive" : ""}
                        />
                        {qaTouched.name && qaValidation.errors.name && (
                          <p className="text-xs text-destructive mt-1">{qaValidation.errors.name}</p>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs">電話</Label>
                          <Input
                            value={qaPhone}
                            onChange={(e) => setQaPhone(e.target.value)}
                            onBlur={() => setQaTouched((t) => ({ ...t, phone: true }))}
                            placeholder="0912345678"
                            maxLength={20}
                            inputMode="tel"
                            aria-invalid={qaTouched.phone && !!qaValidation.errors.phone}
                            className={qaTouched.phone && qaValidation.errors.phone ? "border-destructive focus-visible:ring-destructive" : ""}
                          />
                          {qaTouched.phone && qaValidation.errors.phone && (
                            <p className="text-xs text-destructive mt-1">{qaValidation.errors.phone}</p>
                          )}
                        </div>
                        <div>
                          <Label className="text-xs">Email</Label>
                          <Input
                            type="email"
                            value={qaEmail}
                            onChange={(e) => setQaEmail(e.target.value)}
                            onBlur={() => setQaTouched((t) => ({ ...t, email: true }))}
                            placeholder="name@example.com"
                            maxLength={255}
                            aria-invalid={qaTouched.email && !!qaValidation.errors.email}
                            className={qaTouched.email && qaValidation.errors.email ? "border-destructive focus-visible:ring-destructive" : ""}
                          />
                          {qaTouched.email && qaValidation.errors.email && (
                            <p className="text-xs text-destructive mt-1">{qaValidation.errors.email}</p>
                          )}
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs">公司</Label>
                        <Input
                          value={qaCompany}
                          onChange={(e) => setQaCompany(e.target.value)}
                          onBlur={() => setQaTouched((t) => ({ ...t, company: true }))}
                          placeholder="選填"
                          maxLength={100}
                          aria-invalid={qaTouched.company && !!qaValidation.errors.company}
                          className={qaTouched.company && qaValidation.errors.company ? "border-destructive focus-visible:ring-destructive" : ""}
                        />
                        {qaTouched.company && qaValidation.errors.company && (
                          <p className="text-xs text-destructive mt-1">{qaValidation.errors.company}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => setQuickAddOpen(false)}
                      >
                        取消
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        className="flex-1 bg-gradient-primary"
                        disabled={quickAddMut.isPending || !qaValidation.ok}
                        onClick={() => quickAddMut.mutate()}
                      >
                        {quickAddMut.isPending
                          ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                          : <UserPlus className="h-3.5 w-3.5 mr-1" />}
                        新增並套用
                      </Button>
                    </div>

                  </div>
                ) : (
                  <Command>
                    <CommandInput
                      placeholder="輸入關鍵字搜尋..."
                      onValueChange={(v) => setQaName(v)}
                    />
                    <CommandList>
                      {customersQ.isLoading ? (
                        <div className="py-6 text-center text-sm text-muted-foreground">載入中...</div>
                      ) : (
                        <>
                          <CommandEmpty>
                            <div className="py-4 px-3 space-y-2 text-center">
                              <div className="text-sm text-muted-foreground">查無此客戶</div>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="w-full"
                                onClick={() => setQuickAddOpen(true)}
                              >
                                <UserPlus className="h-3.5 w-3.5 mr-1" /> 快速新增客戶
                              </Button>
                            </div>
                          </CommandEmpty>
                          <CommandGroup heading={`客戶 (${customersQ.data?.length ?? 0})`}>
                            {(customersQ.data ?? []).map((c: any) => (
                              <CommandItem
                                key={c.id}
                                value={`${c.name} ${c.email ?? ""} ${c.phone ?? ""} ${c.company ?? ""}`}
                                onSelect={() => pickCustomer(c)}
                              >
                                <Check className={`h-4 w-4 mr-2 ${customerId === c.id ? "opacity-100" : "opacity-0"}`} />
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-medium truncate">
                                    {c.name}
                                    {c.company && <span className="text-xs text-muted-foreground ml-2">{c.company}</span>}
                                  </div>
                                  <div className="text-xs text-muted-foreground truncate">
                                    {[c.email, c.phone].filter(Boolean).join(" · ") || "—"}
                                  </div>
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </>
                      )}
                    </CommandList>
                    <div className="border-t border-border p-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="w-full justify-start text-sm"
                        onClick={() => setQuickAddOpen(true)}
                      >
                        <UserPlus className="h-3.5 w-3.5 mr-2 text-primary" />
                        新增客戶到名單
                      </Button>
                    </div>
                  </Command>
                )}
              </PopoverContent>

            </Popover>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div><Label>客戶姓名 *</Label><Input value={customer} onChange={(e) => { setCustomer(e.target.value); setCustomerId(null); }} /></div>
            <div><Label>電話 *</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          </div>

          <div><Label>Email</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div><Label>收件地址 *</Label><Input value={address} onChange={(e) => setAddress(e.target.value)} /></div>

          {/* ===== 商品明細 ===== */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1.5"><Package className="h-3.5 w-3.5" /> 商品明細 *</Label>
              <Popover open={productPickerOpen} onOpenChange={setProductPickerOpen}>
                <PopoverTrigger asChild>
                  <Button type="button" variant="outline" size="sm">
                    <Plus className="h-3.5 w-3.5 mr-1" /> 加入商品
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-[420px]" align="end">
                  <Command>
                    <CommandInput placeholder="搜尋商品名稱 / SKU..." />
                    <CommandList>
                      {productsQ.isLoading ? (
                        <div className="py-6 text-center text-sm text-muted-foreground">載入中...</div>
                      ) : (
                        <>
                          <CommandEmpty>查無商品</CommandEmpty>
                          <CommandGroup heading={`商品 (${productsQ.data?.length ?? 0})`}>
                            {(productsQ.data ?? []).map((p: any) => (
                              <CommandItem
                                key={p.id}
                                value={`${p.name} ${p.sku ?? ""}`}
                                onSelect={() => addItem(p)}
                              >
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-medium truncate">{p.name}</div>
                                  <div className="text-xs text-muted-foreground truncate">
                                    {p.sku ?? "—"} · 庫存 {p.stock ?? 0}
                                  </div>
                                </div>
                                <div className="text-sm tabular-nums ml-2">{fmt(p.price)}</div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </>
                      )}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {items.length === 0 ? (
              <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                尚未加入商品，請點選右上「加入商品」
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>商品</TableHead>
                      <TableHead className="w-28">單價</TableHead>
                      <TableHead className="w-24">數量</TableHead>
                      <TableHead className="w-28 text-right">小計</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((it, i) => (
                      <TableRow key={it.product_id}>
                        <TableCell>
                          <div className="text-sm font-medium">{it.name}</div>
                          {it.sku && <div className="text-xs text-muted-foreground">{it.sku}</div>}
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={0}
                            value={it.unit_price}
                            onChange={(e) => updateItem(i, { unit_price: Number(e.target.value) })}
                            className="h-8"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min={1}
                            value={it.quantity}
                            onChange={(e) => updateItem(i, { quantity: Math.max(1, Number(e.target.value) || 1) })}
                            className="h-8"
                          />
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium">
                          {fmt(it.unit_price * it.quantity)}
                        </TableCell>
                        <TableCell>
                          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeItem(i)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>商品小計</Label>
              <Input type="number" value={subtotalNum} readOnly className="bg-muted/40" />
            </div>
            <div><Label>運費</Label><Input type="number" value={shippingFee} onChange={(e) => setShippingFee(e.target.value)} /></div>
            <div><Label>折扣</Label><Input type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} /></div>
          </div>

          <div className="flex items-center justify-between rounded-md border p-3 bg-muted/20">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={taxAdded} onCheckedChange={(v) => setTaxAdded(v === true)} />
              <span>稅外加 5%</span>
            </label>
            <div className="text-sm text-muted-foreground">
              稅額：<span className="tabular-nums font-medium text-foreground">{fmt(taxAmount)}</span>
            </div>
          </div>


          {/* ===== 訂金 / 尾款 ===== */}
          <div className="rounded-md border p-3 space-y-2 bg-muted/20">
            <div className="text-sm font-medium flex items-center gap-1.5">
              <CreditCard className="h-3.5 w-3.5" /> 付款設定（訂金 / 尾款）
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">訂金（已收）</Label>
                <Input type="number" min={0} value={deposit} onChange={(e) => setDeposit(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">尾款（待收）</Label>
                <Input type="number" min={0} value={balance} onChange={(e) => setBalance(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs">付款方式</Label>
                <Select value={depositMethod} onValueChange={setDepositMethod}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(PAYMENT_METHOD_LABEL).map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>訂金 + 尾款 = <span className="tabular-nums font-medium text-foreground">{fmt(paymentsTotal)}</span></span>
              <span className={paymentsDiff < 0 ? "text-destructive font-medium" : ""}>
                與訂單總額差額：{fmt(paymentsDiff)}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between border-t pt-3">
            <div className="text-xs text-muted-foreground">
              小計 {fmt(subtotalNum)}{taxAdded ? ` ＋ 稅 ${fmt(taxAmount)}` : ""} ＋ 運費 {fmt(shippingFee)} － 折扣 {fmt(discount)}
            </div>
            <div className="text-sm">
              訂單總額：<span className="text-lg font-bold text-primary ml-1">{fmt(total)}</span>
            </div>
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
  const { logoUrl } = useBranding();
  const [printing, setPrinting] = useState(false);
  const [editing, setEditing] = useState(false);
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
      <DialogContent className="max-w-3xl w-full max-h-[100dvh] sm:max-h-[90vh] h-[100dvh] sm:h-auto rounded-none sm:rounded-lg overflow-y-auto p-4 sm:p-6">

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
                  <div className="overflow-x-auto">
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
                  </div>

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
                    companyId={order.company_id}
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
                  <div className="overflow-x-auto">
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
                            <PaymentRecordStatusCell
                              paymentId={p.id}
                              value={p.payment_status}
                              onChanged={() => {
                                qc.invalidateQueries({ queryKey: ["sales-order-detail", orderId] });
                                onChanged();
                              }}
                            />
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
                  </div>

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
                      <div className="overflow-x-auto">
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
                                <PaymentRecordStatusCell
                                  paymentId={p.id}
                                  value={p.payment_status}
                                  onChanged={() => {
                                    qc.invalidateQueries({ queryKey: ["sales-order-detail", orderId] });
                                    onChanged();
                                  }}
                                />
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
          {order && order.order_status !== "cancelled" && (
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Pencil className="h-4 w-4 mr-1" /> 編輯訂單
            </Button>
          )}
          {order && (
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  setPrinting(true);
                  await exportOrderPdf({
                    order: order as any,
                    items: items as any,
                    payments: payments as any,
                    logoUrl,
                  });
                  toast.success("PDF 已產生");
                } catch (e: any) {
                  toast.error(e?.message ?? "列印失敗");
                } finally {
                  setPrinting(false);
                }
              }}
              disabled={printing}
            >
              {printing
                ? <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                : <Printer className="h-4 w-4 mr-1" />}
              列印 PDF
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>關閉</Button>
        </DialogFooter>
      </DialogContent>
      {order && (
        <EditOrderDialog
          open={editing}
          onClose={() => setEditing(false)}
          order={order}
          items={items as any}
          onSaved={() => {
            setEditing(false);
            qc.invalidateQueries({ queryKey: ["sales-order-detail", orderId] });
            onChanged();
          }}
        />
      )}
    </Dialog>
  );
}

// =================== Edit order dialog ===================
function EditOrderDialog({
  open, onClose, order, items: initialItems, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  order: OrderRow;
  items: Array<{ id: string; product_id: string | null; product_name: string; sku: string | null; image: string | null; unit_price: number; quantity: number }>;
  onSaved: () => void;
}) {
  const [customerName, setCustomerName] = useState(order.customer_name);
  const [email, setEmail] = useState(order.customer_email ?? "");
  const [phone, setPhone] = useState(order.customer_phone ?? "");
  const [receiverName, setReceiverName] = useState(order.receiver_name);
  const [receiverPhone, setReceiverPhone] = useState(order.receiver_phone);
  const [address, setAddress] = useState(order.shipping_address);
  const [shippingFee, setShippingFee] = useState(String(order.shipping_fee ?? 0));
  const [discount, setDiscount] = useState(String(order.discount_amount ?? 0));
  const [notes, setNotes] = useState(order.notes ?? "");
  const [editItems, setEditItems] = useState(
    initialItems.map((it) => ({
      product_id: it.product_id,
      product_name: it.product_name,
      sku: it.sku,
      image: it.image,
      unit_price: Number(it.unit_price),
      quantity: Number(it.quantity),
    })),
  );
  const [pickerOpen, setPickerOpen] = useState(false);

  // 每次重新打開時，重置為當前訂單資料
  const [syncKey, setSyncKey] = useState(order.id);
  if (open && syncKey !== order.id) {
    setSyncKey(order.id);
    setCustomerName(order.customer_name);
    setEmail(order.customer_email ?? "");
    setPhone(order.customer_phone ?? "");
    setReceiverName(order.receiver_name);
    setReceiverPhone(order.receiver_phone);
    setAddress(order.shipping_address);
    setShippingFee(String(order.shipping_fee ?? 0));
    setDiscount(String(order.discount_amount ?? 0));
    setNotes(order.notes ?? "");
    setEditItems(
      initialItems.map((it) => ({
        product_id: it.product_id,
        product_name: it.product_name,
        sku: it.sku,
        image: it.image,
        unit_price: Number(it.unit_price),
        quantity: Number(it.quantity),
      })),
    );
  }

  const productsQ = useQuery({
    queryKey: ["products-picker-edit-orders"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id,name,sku,price,image,stock")
        .eq("status", "active")
        .order("updated_at", { ascending: false })
        .limit(300);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const subtotalNum = useMemo(
    () => editItems.reduce((s, it) => s + Number(it.unit_price || 0) * Number(it.quantity || 0), 0),
    [editItems],
  );
  const total = useMemo(
    () => Math.max(0, subtotalNum + Number(shippingFee || 0) - Number(discount || 0)),
    [subtotalNum, shippingFee, discount],
  );

  function addProduct(p: { id: string; name: string; sku: string | null; price: number; image: string | null }) {
    setEditItems((prev) => {
      const idx = prev.findIndex((x) => x.product_id === p.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
        return next;
      }
      return [...prev, { product_id: p.id, product_name: p.name, sku: p.sku, image: p.image, unit_price: Number(p.price ?? 0), quantity: 1 }];
    });
    setPickerOpen(false);
  }

  const m = useMutation({
    mutationFn: async () => {
      if (!customerName.trim() || !address.trim() || !phone.trim()) {
        throw new Error("請填寫必填欄位（客戶、電話、地址）");
      }
      if (editItems.length === 0) {
        throw new Error("請至少保留一項商品");
      }
      if (editItems.some((it) => !it.quantity || it.quantity <= 0 || it.unit_price < 0)) {
        throw new Error("商品數量需大於 0，且單價不可為負");
      }

      // 1) 更新訂單主檔
      const { error: upErr } = await supabase
        .from("sales_orders")
        .update({
          customer_name: customerName.trim(),
          customer_email: email.trim() || null,
          customer_phone: phone.trim() || null,
          receiver_name: receiverName.trim() || customerName.trim(),
          receiver_phone: receiverPhone.trim() || phone.trim(),
          shipping_address: address.trim(),
          subtotal: subtotalNum,
          shipping_fee: Number(shippingFee || 0),
          discount_amount: Number(discount || 0),
          total_amount: total,
          notes: notes.trim() || null,
        })
        .eq("id", order.id);
      if (upErr) throw new Error(`更新訂單失敗：${upErr.message}`);

      // 2) 重建品項（先刪後新增，較簡單可靠）
      const { error: delErr } = await supabase
        .from("sales_order_items")
        .delete()
        .eq("sales_order_id", order.id);
      if (delErr) throw new Error(`清除舊品項失敗：${delErr.message}`);

      const { error: insErr } = await supabase
        .from("sales_order_items")
        .insert(
          editItems.map((it) => ({
            sales_order_id: order.id,
            product_id: it.product_id,
            product_name: it.product_name,
            sku: it.sku,
            image: it.image,
            unit_price: it.unit_price,
            quantity: it.quantity,
            subtotal: Number(it.unit_price) * Number(it.quantity),
            company_id: order.company_id,
          })),
        );
      if (insErr) throw new Error(`寫入新品項失敗：${insErr.message}`);
    },
    onSuccess: () => {
      toast.success("訂單已更新");
      onSaved();
    },
    onError: (e: any) => toast.error(e?.message ?? "更新失敗"),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl w-full max-h-[100dvh] sm:max-h-[90vh] h-[100dvh] sm:h-auto rounded-none sm:rounded-lg overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-4 w-4 text-primary" />
            編輯訂單 <span className="font-mono text-sm text-muted-foreground">{order.order_no}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div><Label>客戶姓名 *</Label><Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} /></div>
            <div><Label>Email</Label><Input value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div><Label>電話 *</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
            <div><Label>收件人</Label><Input value={receiverName} onChange={(e) => setReceiverName(e.target.value)} /></div>
            <div><Label>收件電話</Label><Input value={receiverPhone} onChange={(e) => setReceiverPhone(e.target.value)} /></div>
            <div className="col-span-2"><Label>寄送地址 *</Label><Input value={address} onChange={(e) => setAddress(e.target.value)} /></div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1.5"><Package className="h-3.5 w-3.5" />訂單品項 ({editItems.length})</Label>
              <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                <PopoverTrigger asChild>
                  <Button type="button" size="sm" variant="outline">
                    <Plus className="h-3.5 w-3.5 mr-1" /> 加入商品
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="p-0 w-[420px]" align="end">
                  <Command>
                    <CommandInput placeholder="搜尋商品名稱 / SKU" />
                    <CommandList>
                      <CommandEmpty>
                        {productsQ.isLoading ? "載入中..." : "找不到商品"}
                      </CommandEmpty>
                      <CommandGroup>
                        {(productsQ.data ?? []).map((p: any) => (
                          <CommandItem
                            key={p.id}
                            value={`${p.name} ${p.sku ?? ""}`}
                            onSelect={() => addProduct(p)}
                          >
                            <div className="flex flex-1 items-center justify-between gap-2">
                              <div className="min-w-0">
                                <div className="text-sm font-medium truncate">{p.name}</div>
                                <div className="text-xs text-muted-foreground">{p.sku ?? "—"} · 庫存 {p.stock ?? 0}</div>
                              </div>
                              <div className="text-sm font-semibold tabular-nums">{fmt(p.price)}</div>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            {editItems.length === 0 ? (
              <div className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                尚未加入商品
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>商品</TableHead>
                      <TableHead className="w-28">單價</TableHead>
                      <TableHead className="w-24">數量</TableHead>
                      <TableHead className="w-28 text-right">小計</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {editItems.map((it, i) => (
                      <TableRow key={`${it.product_id ?? "x"}-${i}`}>
                        <TableCell>
                          <div className="text-sm font-medium">{it.product_name}</div>
                          {it.sku && <div className="text-xs text-muted-foreground">{it.sku}</div>}
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number" min={0} value={it.unit_price}
                            onChange={(e) => setEditItems((prev) => prev.map((x, j) => j === i ? { ...x, unit_price: Number(e.target.value) } : x))}
                            className="h-8"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number" min={1} value={it.quantity}
                            onChange={(e) => setEditItems((prev) => prev.map((x, j) => j === i ? { ...x, quantity: Math.max(1, Number(e.target.value) || 1) } : x))}
                            className="h-8"
                          />
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium">
                          {fmt(it.unit_price * it.quantity)}
                        </TableCell>
                        <TableCell>
                          <Button type="button" variant="ghost" size="icon" className="h-8 w-8"
                            onClick={() => setEditItems((prev) => prev.filter((_, j) => j !== i))}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div><Label>商品小計</Label><Input type="number" value={subtotalNum} readOnly className="bg-muted/40" /></div>
            <div><Label>運費</Label><Input type="number" value={shippingFee} onChange={(e) => setShippingFee(e.target.value)} /></div>
            <div><Label>折扣</Label><Input type="number" value={discount} onChange={(e) => setDiscount(e.target.value)} /></div>
          </div>

          <div className="flex items-center justify-between border-t pt-3">
            <div className="text-xs text-muted-foreground">
              小計 {fmt(subtotalNum)} ＋ 運費 {fmt(shippingFee)} － 折扣 {fmt(discount)}
            </div>
            <div className="text-sm">
              訂單總額：<span className="text-lg font-bold text-primary ml-1">{fmt(total)}</span>
            </div>
          </div>

          <div><Label>備註</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></div>

          <div className="text-xs text-muted-foreground">
            注意：訂單金額變動後，付款 / 收款狀態需於詳情頁另行核對。
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={m.isPending}>取消</Button>
          <Button onClick={() => m.mutate()} disabled={m.isPending} className="bg-gradient-primary">
            {m.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} 儲存變更
          </Button>
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
  orderId, companyId, unpaid, totalAmount, onRecorded,
}: {
  orderId: string;
  companyId: string;
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
        company_id: companyId,
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

// =================== Inline 付款狀態快速修改 ===================
function PaymentStatusCell({
  orderId,
  value,
  onChanged,
}: {
  orderId: string;
  value: keyof typeof PAYMENT_STATUS;
  onChanged: () => void;
}) {
  const [pending, setPending] = useState(false);
  const current = PAYMENT_STATUS[value];

  async function update(next: keyof typeof PAYMENT_STATUS) {
    if (next === value) return;
    setPending(true);
    const { error } = await supabase
      .from("sales_orders")
      .update({ payment_status: next })
      .eq("id", orderId);
    setPending(false);
    if (error) {
      toast.error("更新付款狀態失敗", { description: error.message });
      return;
    }
    toast.success(`付款狀態已更新為「${PAYMENT_STATUS[next].label}」`);
    onChanged();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={pending}
          className="inline-flex items-center gap-1 disabled:opacity-60"
          title="點擊修改付款狀態"
        >
          <Badge variant="outline" className={`${current?.tone ?? ""} cursor-pointer hover:opacity-80`}>
            {pending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
            {current?.label ?? value}
          </Badge>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[140px]">
        {(Object.keys(PAYMENT_STATUS) as Array<keyof typeof PAYMENT_STATUS>).map((k) => (
          <DropdownMenuItem
            key={k}
            onClick={() => update(k)}
            className="flex items-center justify-between gap-2"
          >
            <span>{PAYMENT_STATUS[k].label}</span>
            {k === value && <Check className="h-3.5 w-3.5 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// =================== Inline 付款紀錄狀態快速修改 ===================
const PAYMENT_RECORD_STATUS: Record<string, { label: string; tone: string }> = {
  pending:   { label: "待處理", tone: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  completed: { label: "已完成", tone: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  paid:      { label: "已付款", tone: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  failed:    { label: "失敗",   tone: "bg-rose-500/15 text-rose-400 border-rose-500/30" },
  refunded:  { label: "已退款", tone: "bg-slate-500/15 text-slate-300 border-slate-500/30" },
};

function PaymentRecordStatusCell({
  paymentId,
  value,
  onChanged,
}: {
  paymentId: string;
  value: string;
  onChanged: () => void;
}) {
  const [pending, setPending] = useState(false);
  const current = PAYMENT_RECORD_STATUS[value] ?? { label: value, tone: "bg-muted text-muted-foreground" };
  const options: Array<keyof typeof PAYMENT_RECORD_STATUS> = ["pending", "completed", "failed", "refunded"];

  async function update(next: string) {
    if (next === value) return;
    setPending(true);
    const { error } = await supabase
      .from("payments")
      .update({ payment_status: next, paid_at: next === "completed" ? new Date().toISOString() : null })
      .eq("id", paymentId);
    setPending(false);
    if (error) {
      toast.error("更新付款狀態失敗", { description: error.message });
      return;
    }
    toast.success(`付款狀態已更新為「${PAYMENT_RECORD_STATUS[next]?.label ?? next}」`);
    onChanged();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={pending}
          className="inline-flex items-center gap-1 disabled:opacity-60"
          title="點擊修改付款狀態"
        >
          <Badge variant="outline" className={`${current.tone} cursor-pointer hover:opacity-80`}>
            {pending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
            {current.label}
          </Badge>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[140px]">
        {options.map((k) => (
          <DropdownMenuItem
            key={k}
            onClick={() => update(k)}
            className="flex items-center justify-between gap-2"
          >
            <span>{PAYMENT_RECORD_STATUS[k].label}</span>
            {k === value && <Check className="h-3.5 w-3.5 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
