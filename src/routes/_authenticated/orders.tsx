import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ShoppingCart, Search, Plus, Loader2, Eye, Truck, CreditCard,
  PackageCheck, XCircle, RotateCw, Receipt, UserSearch, Check, UserPlus,
  Package, Trash2, Printer, Pencil, Wallet, Download,
} from "lucide-react";
import { exportOrderPdf, exportOrdersPdf } from "@/lib/order-pdf";
import { useBranding } from "@/hooks/use-branding";
import { useCurrentCompany } from "@/hooks/use-current-company";
import { useAuth } from "@/hooks/use-auth";
import { deleteSalesOrder, adminRerunOrderUpgrades } from "@/lib/orders-admin.functions";
import { processOrderCommission } from "@/lib/referral.functions";
import { processOrderPaymentBonus } from "@/lib/bonus.functions";
import { processOrderAnnualFeeUpgrade } from "@/lib/annual-fee-vip.functions";
import { processOrderVipPackageUpgrade } from "@/lib/vip-tiers.functions";
import { createSalesOrderWithPointPayments } from "@/lib/order-point-payments.functions";
import { computeOrderPaymentTotals } from "@/lib/order-payment-totals";
import { resolveRewardNotice, type RewardTxRow } from "@/lib/checkout-reward-notice";
import { useOrderRewardPreview } from "@/hooks/use-order-reward-preview";
import { OrderRewardSummary } from "@/components/OrderRewardSummary";
import { OrderRewardDetailCard } from "@/components/OrderRewardDetailCard";
import { logOrderRewardPointsAudit } from "@/lib/audit.functions";

/** 訂單轉為 paid 時自動結算 VIP 推薦佣金 + 觸發復購/升級獎金（失敗不擋主流程） */
async function autoSettleCommission(orderId: string, nextStatus: string) {
  if (nextStatus !== "paid") return;
  try {
    const res: any = await processOrderCommission({ data: { orderId } });
    if (res?.skipped) {
      // 業務規則導致跳過（無推薦人 / 已結算 / 非 VIP 等），靜默處理
    } else if (res?.points && res.points > 0) {
      toast.success(`已自動發放推薦獎勵 ${res.points} 點 (${res.rate}%)`);
    }
  } catch (e: any) {
    toast.warning("推薦佣金自動結算失敗", { description: String(e?.message ?? "") });
  }
  // 觸發復購 / 升級訂單獎金 + 月度責任額累計
  try {
    const r: any = await processOrderPaymentBonus({ data: { orderId } });
    if (r?.type === "repurchase" && r?.inserted > 0) {
      toast.success(`復購獎金已產生 ${r.inserted} 筆`);
    } else if (r?.type === "upgrade" && r?.inserted > 0) {
      toast.success(`升級訂單獎金已產生 ${r.inserted} 筆 (差額制)`);
    }
  } catch (e: any) {
    toast.warning("獎金產生失敗", { description: String(e?.message ?? "") });
  }
  // 年費商品 → 自動升級 VIP（冪等，失敗不擋主流程）
  try {
    const a: any = await processOrderAnnualFeeUpgrade({ data: { orderId } });
    if (a?.ok && Array.isArray(a.results)) {
      const applied = a.results.filter((x: any) => x?.applied);
      const skipped = a.results.filter((x: any) => x?.skipped === "already_processed");
      const hasGift = applied.some((x: any) => x?.gift_product_id || x?.gift_quantity);
      if (applied.length > 0) {
        toast.success("已完成 VIP 年費升級，並已發放獎勵點");
        if (hasGift) {
          toast.info("贈品請確認是否加入訂單明細");
        }
      }
      if (skipped.length > 0) {
        toast.info("此訂單已處理過 VIP 年費升級，未重複發放");
      }
    }
  } catch (e: any) {
    toast.warning("VIP 年費升級處理失敗", { description: String(e?.message ?? "") });
  }
  // VIP 升級套組（綁定商品）→ 自動升級 VIP（冪等，失敗不擋主流程）
  try {
    const v: any = await processOrderVipPackageUpgrade({ data: { orderId } });
    if (v?.ok && Array.isArray(v.results)) {
      const applied = v.results.filter((x: any) => x?.applied);
      if (applied.length > 0) {
        const tier = applied.find((x: any) => x.upgraded)?.new_tier;
        const pts = applied.reduce((s: number, x: any) => s + Number(x.granted_bonus_points ?? 0), 0);
        toast.success(`VIP 升級套組已生效${tier ? `（${tier} 級）` : ""}${pts > 0 ? `；已發放贈點 ${pts}` : ""}`);
      }
    }
  } catch (e: any) {
    toast.warning("VIP 升級套組處理失敗", { description: String(e?.message ?? "") });
  }
}
import { supabase } from "@/integrations/supabase/client";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  order_source: string | null;
  salesperson_id: string | null;
  salesperson_name: string | null;
  created_by_id: string | null;
  created_by_name: string | null;
  created_at: string;
  company_id: string;
};

const ORDER_SOURCES = ["蝦皮1", "蝦皮2", "LINE", "其他", "官網", "雅虎1", "雅虎2", "露天1", "露天2"];

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
  const { current: currentCompany, currentCompanyId: activeCompanyId } = useCurrentCompany();
  const pdfLogoUrl = currentCompany?.logo_url || logoUrl;
  const companyHeader = currentCompany
    ? {
        name: currentCompany.company_name,
        tax_id: currentCompany.tax_id,
        phone: currentCompany.phone,
        address: currentCompany.address,
        email: currentCompany.email,
      }
    : null;
  const { roles } = useAuth();
  const isSuperAdmin = roles.includes("super_admin");
  const [deleteTarget, setDeleteTarget] = useState<OrderRow | null>(null);
  const deleteFn = useServerFn(deleteSalesOrder);
  const deleteMut = useMutation({
    mutationFn: (orderId: string) => deleteFn({ data: { orderId } }),
    onSuccess: () => {
      toast.success(`已刪除訂單 ${deleteTarget?.order_no ?? ""}`);
      setDeleteTarget(null);
      setSelected((s) => {
        const n = new Set(s);
        if (deleteTarget) n.delete(deleteTarget.id);
        return n;
      });
      qc.invalidateQueries({ queryKey: ["sales-orders"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "刪除失敗"),
  });

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
        company: companyHeader,
      }));

      const res = await exportOrdersPdf(payload, pdfLogoUrl, {
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
        logoUrl: pdfLogoUrl,
        company: companyHeader,
      });
      toast.success("PDF 已產生");
    } catch (e: any) {
      toast.error(e?.message ?? "列印失敗");
    } finally {
      setPrintingId(null);
    }
  }

  const ordersQ = useQuery({
    queryKey: ["sales-orders", tab, search, activeCompanyId],
    enabled: !!activeCompanyId,
    queryFn: async () => {
      let q = supabase
        .from("sales_orders")
        .select("*")
        .eq("company_id", activeCompanyId!)
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

  const [revenuePeriod, setRevenuePeriod] = useState<"today" | "week" | "month">("month");

  const periodFrom = useMemo(() => {
    const start = new Date();
    if (revenuePeriod === "today") {
      start.setHours(0, 0, 0, 0);
    } else if (revenuePeriod === "week") {
      start.setHours(0, 0, 0, 0);
      const dow = (start.getDay() + 6) % 7;
      start.setDate(start.getDate() - dow);
    } else {
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
    }
    return start.toISOString();
  }, [revenuePeriod]);

  const revenueQ = useQuery({
    enabled: !!activeCompanyId,
    queryKey: ["sales-orders-revenue", activeCompanyId, revenuePeriod, periodFrom],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_orders")
        .select("total_amount, order_status, payment_status, created_at")
        .eq("company_id", activeCompanyId!)
        .gte("created_at", periodFrom);
      if (error) throw new Error(error.message);
      return (data ?? [])
        .filter((o: any) => o.order_status !== "cancelled" && o.payment_status !== "refunded")
        .reduce((s: number, o: any) => s + (Number(o.total_amount) || 0), 0);
    },
  });

  const kpis = useMemo(() => {
    const list = ordersQ.data ?? [];
    return {
      total: list.length,
      revenue: revenueQ.data ?? 0,
      pending: list.filter((r) => r.order_status === "pending").length,
      toShip: list.filter((r) => r.shipping_status === "pending" && r.order_status !== "cancelled").length,
      unpaid: list.filter((r) => r.payment_status !== "paid" && r.order_status !== "cancelled").length,
    };
  }, [ordersQ.data, revenueQ.data]);

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

      {/* Revenue period toggle */}
      <div className="flex items-center justify-end">
        <ToggleGroup
          type="single"
          value={revenuePeriod}
          onValueChange={(v) => v && setRevenuePeriod(v as "today" | "week" | "month")}
          variant="outline"
          size="sm"
        >
          <ToggleGroupItem value="today">今日</ToggleGroupItem>
          <ToggleGroupItem value="week">本週</ToggleGroupItem>
          <ToggleGroupItem value="month">本月</ToggleGroupItem>
        </ToggleGroup>
      </div>

      {/* KPIs */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-5">
        <KpiCard label="訂單總數" value={String(kpis.total)} />
        <KpiCard
          label={revenuePeriod === "today" ? "今日營收" : revenuePeriod === "week" ? "本週營收" : "本月營收"}
          value={fmt(kpis.revenue)}
          accent="text-success"
        />
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
                        <div className="text-xs text-muted-foreground truncate">
                          業務：{o.salesperson_name ?? "—"} · 建檔：{o.created_by_name ?? "—"}
                        </div>
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <OrderStatusCell orderId={o.id} value={o.order_status} onChanged={refresh} />
                      <ShippingStatusCell orderId={o.id} value={o.shipping_status} onChanged={refresh} />
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
                      {isSuperAdmin && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setDeleteTarget(o)}
                          className="text-destructive border-destructive/40 hover:bg-destructive/10"
                          title="刪除訂單"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
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
                      <TableHead>來源</TableHead>
                      <TableHead>業務</TableHead>
                      <TableHead>建檔人員</TableHead>
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
                        <TableCell>
                          {o.order_source
                            ? <Badge variant="outline">{o.order_source}</Badge>
                            : <span className="text-xs text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-xs">
                          {o.salesperson_name ?? <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {o.created_by_name ?? "—"}
                        </TableCell>
                        <TableCell className="text-right font-semibold">{fmt(o.total_amount)}</TableCell>
                        <TableCell>
                          <OrderStatusCell orderId={o.id} value={o.order_status} onChanged={refresh} />
                        </TableCell>
                        <TableCell>
                          <ShippingStatusCell orderId={o.id} value={o.shipping_status} onChanged={refresh} />
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
                            {isSuperAdmin && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setDeleteTarget(o)}
                                title="刪除訂單（僅超級管理員）"
                                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              >
                                <Trash2 className="h-3.5 w-3.5 mr-1" /> 刪除
                              </Button>
                            )}
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

      {/* 刪除訂單確認 */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && !deleteMut.isPending && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-destructive" />
              刪除訂單
            </AlertDialogTitle>
            <AlertDialogDescription>
              即將永久刪除訂單 <span className="font-mono font-semibold">{deleteTarget?.order_no}</span>
              （客戶：{deleteTarget?.customer_name}，金額 {fmt(deleteTarget?.total_amount ?? 0)}），
              同時移除其明細與付款紀錄。此操作無法復原，僅超級管理員可執行。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMut.isPending}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteMut.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (deleteTarget) deleteMut.mutate(deleteTarget.id);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMut.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
              確認刪除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>


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
  const [items, setItems] = useState<Array<{ product_id: string; name: string; sku: string | null; image: string | null; unit_price: number; quantity: number; reward_points: number }>>([]);
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const [shippingFee, setShippingFee] = useState("0");
  const [discount, setDiscount] = useState("0");
  const [discountPoints, setDiscountPoints] = useState("0");
  const [shoppingPoints, setShoppingPoints] = useState("0");
  const [rewardPoints, setRewardPoints] = useState("0");
  const [deposit, setDeposit] = useState("0");
  const [balance, setBalance] = useState("0");
  const [depositMethod, setDepositMethod] = useState("bank_transfer");
  const [taxAdded, setTaxAdded] = useState(false);
  const [notes, setNotes] = useState("");
  const [orderSource, setOrderSource] = useState("");
  const [salespersonId, setSalespersonId] = useState<string>("");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerStatus, setCustomerStatus] = useState<{ is_vip: boolean; is_dealer: boolean; vip_tier: string | null; member_no: string | null; user_id: string | null }>({ is_vip: false, is_dealer: false, vip_tier: null, member_no: null, user_id: null });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [qaName, setQaName] = useState("");
  const [qaEmail, setQaEmail] = useState("");
  const [qaPhone, setQaPhone] = useState("");
  const [qaCompany, setQaCompany] = useState("");
  const qc = useQueryClient();
  const { currentCompanyId } = useCurrentCompany();

  // 統一搜尋字串（CommandInput），debounce 後丟到後端做 ilike 搜尋
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchTerm.trim()), 250);
    return () => clearTimeout(t);
  }, [searchTerm]);

  // 將關鍵字轉為 PostgREST or() 字串中安全的片段（去除 , 與括號）
  const escLike = (s: string) => s.replace(/[(),*]/g, " ").trim();

  const customersQ = useQuery({
    queryKey: ["customers-picker", currentCompanyId, debouncedSearch],
    enabled: open && !!currentCompanyId,
    queryFn: async () => {
      let q = supabase
        .from("customers")
        .select("id,name,email,phone,company")
        .eq("company_id", currentCompanyId!);
      const s = escLike(debouncedSearch);
      if (s) {
        const like = `%${s}%`;
        q = q.or(`name.ilike.${like},email.ilike.${like},phone.ilike.${like},company.ilike.${like}`);
      }
      const { data, error } = await q.order("updated_at", { ascending: false }).limit(s ? 100 : 200);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  // 會員（profiles）— 限本公司；有關鍵字時改後端搜尋（姓名/電話/Email/編號）
  const membersQ = useQuery({
    queryKey: ["members-picker", currentCompanyId, debouncedSearch],
    enabled: open && !!currentCompanyId,
    queryFn: async () => {
      const s = escLike(debouncedSearch);
      let q = supabase
        .from("profiles")
        .select("id,name,email,phone,member_no,is_vip,is_dealer,vip_tier,addr_mail,addr_home,current_company_id");
      if (s) {
        // 有搜尋字 → 跨公司搜尋全部會員（包含 current_company_id 未設定者）
        const like = `%${s}%`;
        q = q.or(`name.ilike.${like},email.ilike.${like},phone.ilike.${like},member_no.ilike.${like}`);
      } else {
        // 預載：僅顯示本公司、且有電話的會員
        q = q.eq("current_company_id", currentCompanyId!).not("phone", "is", null);
      }
      const { data, error } = await q.order("created_at", { ascending: false }).limit(s ? 100 : 300);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  // 經銷商
  const dealersQ = useQuery({
    queryKey: ["dealers-picker", currentCompanyId, debouncedSearch],
    enabled: open && !!currentCompanyId,
    queryFn: async () => {
      let q = supabase
        .from("dealers")
        .select("id,code,name,contact,phone,email,address,status")
        .eq("company_id", currentCompanyId!)
        .eq("status", "active");
      const s = escLike(debouncedSearch);
      if (s) {
        const like = `%${s}%`;
        q = q.or(`name.ilike.${like},contact.ilike.${like},phone.ilike.${like},email.ilike.${like},code.ilike.${like}`);
      }
      const { data, error } = await q.order("updated_at", { ascending: false }).limit(s ? 100 : 200);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  // 廠商
  const vendorsQ = useQuery({
    queryKey: ["vendors-picker", currentCompanyId, debouncedSearch],
    enabled: open && !!currentCompanyId,
    queryFn: async () => {
      let q = supabase
        .from("vendors")
        .select("id,code,name,contact,phone,email,address,status")
        .eq("company_id", currentCompanyId!)
        .eq("status", "active");
      const s = escLike(debouncedSearch);
      if (s) {
        const like = `%${s}%`;
        q = q.or(`name.ilike.${like},contact.ilike.${like},phone.ilike.${like},email.ilike.${like},code.ilike.${like}`);
      }
      const { data, error } = await q.order("updated_at", { ascending: false }).limit(s ? 100 : 200);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const productsQ = useQuery({
    queryKey: ["products-picker-orders", currentCompanyId],
    enabled: open && !!currentCompanyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id,name,sku,price,image,stock,status,reward_points")
        .eq("company_id", currentCompanyId!)
        .order("updated_at", { ascending: false })
        .limit(500);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  // 載入 VIP 升級套組（依綁定的 anchor product_id 對應 bonus_points，付款後僅發一次）
  const packagesQ = useQuery({
    queryKey: ["vip-packages-bonus", currentCompanyId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vip_upgrade_packages")
        .select("product_id,bonus_points,name")
        .eq("status", "active");
      if (error) throw new Error(error.message);
      const map: Record<string, { bonus_points: number; name: string }> = {};
      for (const r of (data ?? []) as any[]) {
        if (r.product_id) map[r.product_id] = { bonus_points: Number(r.bonus_points || 0), name: r.name };
      }
      return map;
    },
  });

  // 載入目前訂單商品對應的批發 / 階梯獎勵點
  const itemIds = items.map((it) => it.product_id);
  const itemIdsKey = itemIds.slice().sort().join(",");
  const tiersQ = useQuery({
    queryKey: ["order-item-tiers", itemIdsKey],
    enabled: itemIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_wholesale_tiers")
        .select("product_id,min_qty,max_qty,unit_price,unit_reward_points,visibility")
        .in("product_id", itemIds)
        .order("min_qty", { ascending: true });
      if (error) throw new Error(error.message);
      const map: Record<string, any[]> = {};
      for (const t of (data ?? []) as any[]) {
        (map[t.product_id] = map[t.product_id] ?? []).push(t);
      }
      return map;
    },
  });

  const staffQ = useQuery({
    queryKey: ["company-staff-picker", currentCompanyId],
    enabled: open && !!currentCompanyId,
    queryFn: async () => {
      const { data: members, error } = await supabase
        .from("company_members")
        .select("user_id, role")
        .eq("company_id", currentCompanyId!);
      if (error) throw new Error(error.message);
      const ids = (members ?? []).map((m) => m.user_id);
      if (ids.length === 0) return [] as Array<{ id: string; name: string }>;
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, name, email")
        .in("id", ids);
      return (profs ?? [])
        .map((p) => ({ id: p.id as string, name: (p.name as string | null) ?? (p.email as string | null) ?? "(未命名)" }))
        .sort((a, b) => a.name.localeCompare(b.name, "zh-Hant"));
    },
  });

  const memberWalletQ = useQuery({
    queryKey: ["order-member-points-wallet", customerStatus.user_id],
    enabled: open && !!customerStatus.user_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("member_points_wallet")
        .select("discount_points,shopping_points,reward_points")
        .eq("user_id", customerStatus.user_id!)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return {
        discount_points: Number((data as any)?.discount_points ?? 0),
        shopping_points: Number((data as any)?.shopping_points ?? 0),
        reward_points: Number((data as any)?.reward_points ?? 0),
      };
    },
  });

  function addItem(p: { id: string; name: string; sku: string | null; price: number; image: string | null; reward_points?: number | null }) {
    setItems((prev) => {
      const idx = prev.findIndex((x) => x.product_id === p.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
        return next;
      }
      return [...prev, { product_id: p.id, name: p.name, sku: p.sku, image: p.image, unit_price: Number(p.price ?? 0), quantity: 1, reward_points: Number(p.reward_points ?? 0) }];
    });
    setProductPickerOpen(false);
  }
  function updateItem(idx: number, patch: Partial<{ unit_price: number; quantity: number }>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }
  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }
  function clearMemberPointPaymentSelection() {
    setCustomerStatus({ is_vip: false, is_dealer: false, vip_tier: null, member_no: null, user_id: null });
    setDiscountPoints("0");
    setShoppingPoints("0");
    setRewardPoints("0");
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
  // 取得當前可套用的最佳階梯（依會員身分過濾、數量符合、單價最低）
  function getBestTier(productId: string, quantity: number): any | null {
    const tiers = (tiersQ.data?.[productId] ?? []).filter((t: any) => {
      const v = t.visibility ?? "all";
      if (v === "all") return true;
      if (v === "vip") return customerStatus.is_vip;
      if (v === "dealer") return customerStatus.is_dealer;
      return false;
    });
    if (tiers.length === 0) return null;
    const matches = tiers.filter((t: any) => quantity >= Number(t.min_qty) && (t.max_qty == null || quantity <= Number(t.max_qty)));
    if (matches.length > 0) {
      return matches.reduce((b: any, c: any) => (Number(c.unit_price) < Number(b.unit_price) ? c : b));
    }
    // VIP / 經銷會員即使未達最小門檻，仍套用其身分可見的最低門檻批發價
    if (customerStatus.is_vip || customerStatus.is_dealer) {
      const memberTiers = tiers.filter((t: any) => (t.visibility ?? "all") !== "all");
      const pool = memberTiers.length > 0 ? memberTiers : tiers;
      const minMin = Math.min(...pool.map((t: any) => Number(t.min_qty)));
      const entry = pool.filter((t: any) => Number(t.min_qty) === minMin);
      return entry.reduce((b: any, c: any) => (Number(c.unit_price) < Number(b.unit_price) ? c : b));
    }
    return null;
  }
  // 套用：VIP 升級套組 → 套組 bonus_points；其他 → 階梯獎勵點（依會員身分過濾可見階梯）
  function getEffectiveReward(it: { product_id: string; quantity: number; reward_points: number }): number {
    const pkg = packagesQ.data?.[it.product_id];
    if (pkg) return pkg.bonus_points;
    const best = getBestTier(it.product_id, it.quantity);
    if (best) return Number(best.unit_reward_points || 0);
    return Number(it.reward_points || 0);
  }
  // 自動依會員身分 / 數量 套用階梯單價（VIP 升級套組不覆寫）
  useEffect(() => {
    setItems((prev) => {
      let changed = false;
      const next = prev.map((it) => {
        if (packagesQ.data?.[it.product_id]) return it;
        const best = getBestTier(it.product_id, it.quantity);
        if (!best) return it;
        const tierPrice = Number(best.unit_price);
        if (Number.isFinite(tierPrice) && tierPrice !== Number(it.unit_price)) {
          changed = true;
          return { ...it, unit_price: tierPrice };
        }
        return it;
      });
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tiersQ.data, packagesQ.data, customerStatus.is_vip, customerStatus.is_dealer, items.map((i) => `${i.product_id}:${i.quantity}`).join("|")]);

  const totalRewardPoints = useMemo(
    () => items.reduce((s, it) => s + getEffectiveReward(it) * Number(it.quantity || 0), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, packagesQ.data, tiersQ.data, customerStatus.is_vip, customerStatus.is_dealer],
  );
  const taxAmount = useMemo(
    () => (taxAdded ? Math.round(subtotalNum * 0.05) : 0),
    [taxAdded, subtotalNum],
  );
  const total = useMemo(
    () => Math.max(0, subtotalNum + taxAmount + Number(shippingFee || 0) - Number(discount || 0)),
    [subtotalNum, taxAmount, shippingFee, discount],
  );
  const walletBalances = memberWalletQ.data ?? { discount_points: 0, shopping_points: 0, reward_points: 0 };
  const discountPointNum = Number(discountPoints || 0);
  const shoppingPointNum = Number(shoppingPoints || 0);
  const rewardPointNum = Number(rewardPoints || 0);
  const pointOffsetTotal = discountPointNum + shoppingPointNum + rewardPointNum;
  const cashDue = Math.max(0, total - pointOffsetTotal);
  const depositNum = Number(deposit || 0);
  const balanceNum = Number(balance || 0);
  const paymentsTotal = depositNum + balanceNum;
  const paymentsDiff = cashDue - paymentsTotal;

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
      if (discountPointNum < 0 || shoppingPointNum < 0 || rewardPointNum < 0) {
        throw new Error("點數付款不可為負");
      }
      if (![discountPointNum, shoppingPointNum, rewardPointNum].every(Number.isInteger)) {
        throw new Error("點數付款必須為整數");
      }
      if (pointOffsetTotal > 0 && !customerStatus.user_id) {
        throw new Error("點數付款需先選擇可對應會員帳號的客戶");
      }
      if (discountPointNum > walletBalances.discount_points) {
        throw new Error("折扣點餘額不足");
      }
      if (shoppingPointNum > walletBalances.shopping_points) {
        throw new Error("購物點餘額不足");
      }
      if (rewardPointNum > walletBalances.reward_points) {
        throw new Error("貢獻點餘額不足");
      }
      if (pointOffsetTotal > total) {
        throw new Error("點數付款不可超過訂單總額");
      }
      if (depositNum + balanceNum > cashDue) {
        throw new Error("訂金 + 尾款不可超過扣除點數後的現金應付");
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
      if (cashDue === 0 || (depositNum >= cashDue && cashDue > 0)) paymentStatus = "paid";
      else if (depositNum > 0 || pointOffsetTotal > 0) paymentStatus = "partial";

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

      const pointPayments: Array<{
        point_type: "discount" | "shopping" | "reward";
        points_used: number;
        amount_offset: number;
        note: string;
      }> = [];
      if (discountPointNum > 0) {
        pointPayments.push({
          point_type: "discount",
          points_used: discountPointNum,
          amount_offset: discountPointNum,
          note: "Admin order discount point payment",
        });
      }
      if (shoppingPointNum > 0) {
        pointPayments.push({
          point_type: "shopping",
          points_used: shoppingPointNum,
          amount_offset: shoppingPointNum,
          note: "Admin order shopping point payment",
        });
      }
      if (rewardPointNum > 0) {
        pointPayments.push({
          point_type: "reward",
          points_used: rewardPointNum,
          amount_offset: rewardPointNum,
          note: "Admin order reward point payment",
        });
      }

      // 單一交易：訂單 + 商品明細 + 付款 + 點數付款一次寫入，任一失敗整筆回滾
      const orderRow = await createSalesOrderWithPointPayments({
        data: {
          order: {
          order_no: genOrderNo(),
          company_id: currentCompanyId,
          user_id: customerStatus.user_id,
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
          items: items.map((it) => ({
            product_id: it.product_id,
            product_name: it.name,
            sku: it.sku,
            image: it.image,
            unit_price: it.unit_price,
            quantity: it.quantity,
            subtotal: Number(it.unit_price) * Number(it.quantity),
          })),
          payments: paymentsPayload,
          pointPayments,
          taxAmount,
        },

      });

      // 寫入訂單來源 / 業務人員 / 會員關聯（RPC 不包含這些欄位，建立後補上；建檔人員由 DB trigger 自動寫入）
      const patch: { order_source?: string; salesperson_id?: string; user_id?: string } = {};
      if (orderSource.trim()) patch.order_source = orderSource.trim();
      if (salespersonId) patch.salesperson_id = salespersonId;
      if (customerStatus.user_id) patch.user_id = customerStatus.user_id;
      if (Object.keys(patch).length > 0 && (orderRow as any)?.id) {
        await supabase.from("sales_orders").update(patch).eq("id", (orderRow as any).id);
      }

      // 若訂單建立時即標記為已付款 → 自動觸發後續結算（佣金 / 復購 / VIP 升級 / 套組）
      if (paymentStatus === "paid" && (orderRow as any)?.id) {
        autoSettleCommission((orderRow as any).id, "paid").catch(() => {});
      }

      return { createdNewCustomer, orderRow };

    },

    onSuccess: (res) => {
      toast.success(res?.createdNewCustomer ? "訂單已建立，並同步新增客戶" : "訂單已建立");
      setOpen(false);
      setCustomer(""); setEmail(""); setPhone(""); setAddress("");
      setItems([]); setShippingFee("0"); setDiscount("0"); setNotes(""); setOrderSource("");
      setDiscountPoints("0"); setShoppingPoints("0"); setRewardPoints("0");
      setDeposit("0"); setBalance("0");
      setCustomerId(null); setSalespersonId("");
      onCreated();
    },
    onError: (e: any) => toast.error(e?.message ?? "建立失敗"),
  });

  async function fetchDefaultShippingAddress(userId: string): Promise<string | null> {
    try {
      const { data } = await supabase
        .from("customer_addresses")
        .select("address,is_default,created_at")
        .eq("user_id", userId)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data as any)?.address ?? null;
    } catch { return null; }
  }

  async function pickCustomer(c: { id: string; name: string; email: string | null; phone: string | null; address?: string | null }) {
    setCustomerId(c.id);
    setCustomer(c.name);
    setEmail(c.email ?? "");
    setPhone(c.phone ?? "");
    if (c.address) setAddress(c.address);
    setDiscountPoints("0"); setShoppingPoints("0"); setRewardPoints("0");
    setCustomerStatus({ is_vip: false, is_dealer: false, vip_tier: null, member_no: null, user_id: null });
    setPickerOpen(false);
    toast.success(`已套用客戶資料：${c.name}`);
    // 嘗試以電話 / Email 對應到會員 profile，自動帶入 VIP 階層與通訊地址
    try {
      const filters: string[] = [];
      if (c.phone) filters.push(`phone.eq.${c.phone}`);
      if (c.email) filters.push(`email.eq.${c.email}`);
      if (filters.length === 0) return;
      const { data } = await supabase
        .from("profiles")
        .select("id,member_no,is_vip,is_dealer,vip_tier,addr_mail,addr_home")
        .or(filters.join(","))
        .limit(1)
        .maybeSingle();
      if (data) {
        const uid = ((data as any).id as string | null) ?? null;
        setCustomerStatus({
          is_vip: !!(data as any).is_vip,
          is_dealer: !!(data as any).is_dealer,
          vip_tier: ((data as any).vip_tier as string | null) ?? null,
          member_no: ((data as any).member_no as string | null) ?? null,
          user_id: uid,
        });
        if (!c.address) {
          const memberAddr = (data as any).addr_mail ?? (data as any).addr_home ?? null;
          const fallback = memberAddr ?? (uid ? await fetchDefaultShippingAddress(uid) : null);
          if (fallback) setAddress(fallback);
        }
      }
    } catch { /* ignore */ }
  }

  // 從會員/經銷/廠商帶入：不綁定 customer_id（送出時會自動建立或對應客戶）
  async function pickEntity(e: { name: string; email: string | null; phone: string | null; address?: string | null; label: string; is_vip?: boolean; is_dealer?: boolean; vip_tier?: string | null; member_no?: string | null; user_id?: string | null }) {
    setCustomerId(null);
    setCustomer(e.name);
    setEmail(e.email ?? "");
    setPhone(e.phone ?? "");
    let addr = e.address ?? null;
    if (!addr && e.user_id) {
      addr = await fetchDefaultShippingAddress(e.user_id);
    }
    if (addr) setAddress(addr);
    setDiscountPoints("0"); setShoppingPoints("0"); setRewardPoints("0");
    setCustomerStatus({ is_vip: !!e.is_vip, is_dealer: !!e.is_dealer, vip_tier: e.vip_tier ?? null, member_no: e.member_no ?? null, user_id: e.user_id ?? null });
    setPickerOpen(false);
    toast.success(`已帶入${e.label}：${e.name}`);
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
                  onClick={() => { setCustomerId(null); setCustomer(""); setEmail(""); setPhone(""); clearMemberPointPaymentSelection(); }}
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
                      : "搜尋客戶 / 會員 / 經銷商 / 廠商（姓名・電話・Email）"}
                  </span>
                  <Search className="h-4 w-4 text-muted-foreground shrink-0 ml-2" />
                </Button>
              </PopoverTrigger>
              {(customer || phone || email) && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  {customerStatus.is_vip ? (
                    <Badge className="bg-amber-500/15 text-amber-500 border border-amber-500/40 hover:bg-amber-500/20">
                      VIP{customerStatus.vip_tier ? ` · ${customerStatus.vip_tier}` : ""}
                    </Badge>
                  ) : customerStatus.is_dealer ? (
                    <Badge className="bg-blue-500/15 text-blue-500 border border-blue-500/40 hover:bg-blue-500/20">經銷商</Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">免費會員 / 一般客戶</Badge>
                  )}
                  {customerStatus.member_no && (
                    <span className="text-xs text-muted-foreground">{customerStatus.member_no}</span>
                  )}
                </div>
              )}
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
                      placeholder="輸入姓名／電話／Email／編號搜尋..."
                      value={searchTerm}
                      onValueChange={(v) => { setSearchTerm(v); setQaName(v); }}
                    />
                    <CommandList>
                      {customersQ.isLoading && membersQ.isLoading && dealersQ.isLoading && vendorsQ.isLoading ? (
                        <div className="py-6 text-center text-sm text-muted-foreground">載入中...</div>
                      ) : (
                        <>
                          <CommandEmpty>
                            <div className="py-4 px-3 space-y-2 text-center">
                              <div className="text-sm text-muted-foreground">查無相符的客戶／會員／經銷商／廠商</div>
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
                                key={`cust-${c.id}`}
                                value={`客戶 ${c.name} ${c.email ?? ""} ${c.phone ?? ""} ${c.company ?? ""}`}
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
                          <CommandGroup heading={`會員 (${membersQ.data?.length ?? 0})`}>
                            {(membersQ.data ?? []).map((m: any) => (
                              <CommandItem
                                key={`mem-${m.id}`}
                                value={`會員 ${m.name ?? ""} ${m.email ?? ""} ${m.phone ?? ""} ${m.member_no ?? ""}`}
                                onSelect={() => pickEntity({
                                  name: m.name ?? m.member_no ?? "會員",
                                  email: m.email ?? null,
                                  phone: m.phone ?? null,
                                  address: m.addr_mail ?? m.addr_home ?? null,
                                  label: m.is_vip ? `VIP 會員${m.vip_tier ? ` ${m.vip_tier}` : ""}` : "會員",
                                  is_vip: !!m.is_vip,
                                  is_dealer: !!m.is_dealer,
                                  vip_tier: (m.vip_tier as string | null) ?? null,
                                  member_no: (m.member_no as string | null) ?? null,
                                  user_id: (m.id as string | null) ?? null,
                                })}
                              >
                                <div className="flex-1 min-w-0 ml-6">
                                  <div className="text-sm font-medium truncate">
                                    {m.name ?? "(未命名)"}
                                    {m.member_no && <span className="text-xs text-muted-foreground ml-2">{m.member_no}</span>}
                                    {m.is_vip && <span className="text-xs text-primary ml-2">VIP</span>}
                                    {m.is_dealer && <span className="text-xs text-primary ml-2">經銷</span>}
                                  </div>
                                  <div className="text-xs text-muted-foreground truncate">
                                    {[m.email, m.phone].filter(Boolean).join(" · ") || "—"}
                                  </div>
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                          <CommandGroup heading={`經銷商 (${dealersQ.data?.length ?? 0})`}>
                            {(dealersQ.data ?? []).map((d: any) => (
                              <CommandItem
                                key={`dlr-${d.id}`}
                                value={`經銷商 ${d.name ?? ""} ${d.contact ?? ""} ${d.phone ?? ""} ${d.email ?? ""} ${d.code ?? ""}`}
                                onSelect={() => pickEntity({
                                  name: d.contact ? `${d.name}（${d.contact}）` : d.name,
                                  email: d.email ?? null,
                                  phone: d.phone ?? null,
                                  address: d.address ?? null,
                                  label: "經銷商",
                                  is_dealer: true,
                                })}
                              >
                                <div className="flex-1 min-w-0 ml-6">
                                  <div className="text-sm font-medium truncate">
                                    {d.name}
                                    {d.code && <span className="text-xs text-muted-foreground ml-2">{d.code}</span>}
                                  </div>
                                  <div className="text-xs text-muted-foreground truncate">
                                    {[d.contact, d.phone, d.email].filter(Boolean).join(" · ") || "—"}
                                  </div>
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                          <CommandGroup heading={`廠商 (${vendorsQ.data?.length ?? 0})`}>
                            {(vendorsQ.data ?? []).map((v: any) => (
                              <CommandItem
                                key={`ven-${v.id}`}
                                value={`廠商 ${v.name ?? ""} ${v.contact ?? ""} ${v.phone ?? ""} ${v.email ?? ""} ${v.code ?? ""}`}
                                onSelect={() => pickEntity({
                                  name: v.contact ? `${v.name}（${v.contact}）` : v.name,
                                  email: v.email ?? null,
                                  phone: v.phone ?? null,
                                  address: v.address ?? null,
                                  label: "廠商",
                                })}
                              >
                                <div className="flex-1 min-w-0 ml-6">
                                  <div className="text-sm font-medium truncate">
                                    {v.name}
                                    {v.code && <span className="text-xs text-muted-foreground ml-2">{v.code}</span>}
                                  </div>
                                  <div className="text-xs text-muted-foreground truncate">
                                    {[v.contact, v.phone, v.email].filter(Boolean).join(" · ") || "—"}
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
            <div><Label>客戶姓名 *</Label><Input value={customer} onChange={(e) => { setCustomer(e.target.value); setCustomerId(null); clearMemberPointPaymentSelection(); }} /></div>
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
                                  <div className="text-sm font-medium truncate flex items-center gap-1.5">
                                    <span className="truncate">{p.name}</span>
                                    <Badge variant="outline" className={p.status === "active" ? "border-emerald-500/40 text-emerald-700" : "border-muted-foreground/40 text-muted-foreground"}>
                                      {p.status === "active" ? "上架中" : "已下架"}
                                    </Badge>
                                  </div>
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
                      <TableHead className="w-24 text-right">獎勵點/件</TableHead>
                      <TableHead className="w-24 text-right">小計獎勵點</TableHead>
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
                        <TableCell className="text-right tabular-nums text-amber-600">
                          {getEffectiveReward(it).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium text-amber-600">
                          {(getEffectiveReward(it) * Number(it.quantity ?? 0)).toLocaleString()}
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

          <div className="flex items-center justify-between rounded-md border border-amber-300/50 p-3 bg-amber-50/40">
            <span className="text-sm text-muted-foreground">本訂單獎勵點（付款完成後發放）</span>
            <span className="text-base font-semibold tabular-nums text-amber-600">
              {totalRewardPoints.toLocaleString()} 點
            </span>
          </div>


          {/* ===== 訂金 / 尾款 ===== */}
          <div className="rounded-md border p-3 space-y-2 bg-muted/20">
            <div className="text-sm font-medium flex items-center gap-1.5">
              <Wallet className="h-3.5 w-3.5" /> 點數付款（折扣點 / 購物點 / 貢獻點）
            </div>
            {!customerStatus.user_id ? (
              <div className="text-xs text-muted-foreground">
                請先從客戶 / 會員搜尋選擇可對應會員帳號的客戶，才能使用點數付款。
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">折扣點</Label>
                  <Input
                    type="number"
                    min={0}
                    max={walletBalances.discount_points}
                    value={discountPoints}
                    onChange={(e) => setDiscountPoints(String(Math.max(0, Math.min(walletBalances.discount_points, Math.floor(Number(e.target.value || 0))))))}
                  />
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    可用 {walletBalances.discount_points.toLocaleString()} 點
                  </div>
                </div>
                <div>
                  <Label className="text-xs">購物點</Label>
                  <Input
                    type="number"
                    min={0}
                    max={walletBalances.shopping_points}
                    value={shoppingPoints}
                    onChange={(e) => setShoppingPoints(String(Math.max(0, Math.min(walletBalances.shopping_points, Math.floor(Number(e.target.value || 0))))))}
                  />
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    可用 {walletBalances.shopping_points.toLocaleString()} 點
                  </div>
                </div>
                <div>
                  <Label className="text-xs">貢獻點</Label>
                  <Input
                    type="number"
                    min={0}
                    max={walletBalances.reward_points}
                    value={rewardPoints}
                    onChange={(e) => setRewardPoints(String(Math.max(0, Math.min(walletBalances.reward_points, Math.floor(Number(e.target.value || 0))))))}
                  />
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    可用 {walletBalances.reward_points.toLocaleString()} 點
                  </div>
                </div>
              </div>
            )}
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>點數折抵合計：<span className="tabular-nums font-medium text-foreground">{fmt(pointOffsetTotal)}</span></span>
              <span className={pointOffsetTotal > total ? "text-destructive font-medium" : ""}>
                扣點後現金應付：{fmt(cashDue)}
              </span>
            </div>
          </div>

          <div className="rounded-md border p-3 space-y-2 bg-muted/20">
            <div className="text-sm font-medium flex items-center gap-1.5">
              <CreditCard className="h-3.5 w-3.5" /> 付款設定（現金訂金 / 尾款）
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
                與現金應付差額：{fmt(paymentsDiff)}
              </span>
            </div>
          </div>

          <div className="flex items-center justify-between border-t pt-3">
            <div className="text-xs text-muted-foreground">
              小計 {fmt(subtotalNum)}{taxAdded ? ` ＋ 稅 ${fmt(taxAmount)}` : ""} ＋ 運費 {fmt(shippingFee)} － 折扣 {fmt(discount)} － 點數 {fmt(pointOffsetTotal)}
            </div>
            <div className="text-sm">
              現金應付：<span className="text-lg font-bold text-primary ml-1">{fmt(cashDue)}</span>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>訂單來源</Label>
              <Input
                list="order-source-options"
                value={orderSource}
                onChange={(e) => setOrderSource(e.target.value)}
                placeholder="例如：官網、電話、LINE..."
              />
              <datalist id="order-source-options">
                {ORDER_SOURCES.map((s) => <option key={s} value={s} />)}
              </datalist>
            </div>
            <div>
              <Label>業務人員</Label>
              <Select value={salespersonId || "none"} onValueChange={(v) => setSalespersonId(v === "none" ? "" : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="請選擇" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">未指定</SelectItem>
                  {(staffQ.data ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2"><Label>備註</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          </div>
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
  const { current: currentCompany } = useCurrentCompany();
  const pdfLogoUrl = currentCompany?.logo_url || logoUrl;
  const companyHeader = currentCompany
    ? {
        name: currentCompany.company_name,
        tax_id: currentCompany.tax_id,
        phone: currentCompany.phone,
        address: currentCompany.address,
        email: currentCompany.email,
      }
    : null;
  const [printing, setPrinting] = useState(false);
  const [editing, setEditing] = useState(false);
  const detailQ = useQuery({
    queryKey: ["sales-order-detail", orderId],
    enabled: !!orderId,
    queryFn: async () => {
      const [orderRes, itemsRes, paymentsRes, pointPaymentsRes, rewardEarnRes] = await Promise.all([
        supabase.from("sales_orders").select("*").eq("id", orderId!).maybeSingle(),
        supabase.from("sales_order_items").select("*").eq("sales_order_id", orderId!).order("created_at"),
        supabase.from("payments").select("*").eq("sales_order_id", orderId!).order("created_at", { ascending: false }),
        supabase.from("order_point_payments").select("*").eq("sales_order_id", orderId!).order("created_at", { ascending: false }),
        supabase
          .from("point_transactions")
          .select("id, amount, point_type, source, created_at, note")
          .eq("reference_id", orderId!)
          .in("source", ["order_earn", "order_earn_referrer"])
          .eq("point_type", "reward"),
      ]);
      if (orderRes.error) throw new Error(orderRes.error.message);
      return {
        order: orderRes.data as OrderRow | null,
        items: itemsRes.data ?? [],
        payments: paymentsRes.data ?? [],
        pointPayments: pointPaymentsRes.data ?? [],
        rewardEarn: rewardEarnRes.data ?? [],
      };
    },
  });

  const order = detailQ.data?.order;
  const items = detailQ.data?.items ?? [];
  const payments = detailQ.data?.payments ?? [];
  const pointPayments = (detailQ.data?.pointPayments ?? []) as any[];
  const rewardEarnRows = (detailQ.data?.rewardEarn ?? []) as any[];
  const rewardPointsIssued = rewardEarnRows.reduce(
    (s: number, r: any) => s + Number(r.amount ?? 0),
    0,
  );

  // 點數付款分錄篩選 / 排序
  const [ppFrom, setPpFrom] = useState<string>("");
  const [ppTo, setPpTo] = useState<string>("");
  const [ppType, setPpType] = useState<string>("all");
  const [ppStatus, setPpStatus] = useState<string>("all");
  const [ppSort, setPpSort] = useState<string>("created_desc");

  const filteredPointPayments = useMemo(() => {
    const fromTs = ppFrom ? new Date(ppFrom + "T00:00:00").getTime() : -Infinity;
    const toTs = ppTo ? new Date(ppTo + "T23:59:59.999").getTime() : Infinity;
    const list = pointPayments.filter((p) => {
      const t = new Date(p.created_at).getTime();
      if (t < fromTs || t > toTs) return false;
      if (ppType !== "all" && p.point_type !== ppType) return false;
      if (ppStatus !== "all" && (p.status ?? "") !== ppStatus) return false;
      return true;
    });
    const sorted = [...list];
    sorted.sort((a, b) => {
      switch (ppSort) {
        case "created_asc":
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case "points_desc":
          return Number(b.points_used ?? 0) - Number(a.points_used ?? 0);
        case "points_asc":
          return Number(a.points_used ?? 0) - Number(b.points_used ?? 0);
        case "amount_desc":
          return Number(b.amount_offset ?? 0) - Number(a.amount_offset ?? 0);
        case "amount_asc":
          return Number(a.amount_offset ?? 0) - Number(b.amount_offset ?? 0);
        case "created_desc":
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });
    return sorted;
  }, [pointPayments, ppFrom, ppTo, ppType, ppStatus, ppSort]);

  const ppStatusOptions = useMemo(() => {
    const s = new Set<string>();
    for (const p of pointPayments) if (p.status) s.add(p.status);
    return Array.from(s);
  }, [pointPayments]);

  // 分頁
  const [ppPageSize, setPpPageSize] = useState<number>(10);
  const [ppPage, setPpPage] = useState<number>(1);
  const ppTotalPages = Math.max(1, Math.ceil(filteredPointPayments.length / ppPageSize));
  useEffect(() => {
    if (ppPage > ppTotalPages) setPpPage(1);
  }, [ppPage, ppTotalPages]);
  useEffect(() => { setPpPage(1); }, [ppFrom, ppTo, ppType, ppStatus, ppSort, ppPageSize]);
  const pagedPointPayments = useMemo(
    () => filteredPointPayments.slice((ppPage - 1) * ppPageSize, ppPage * ppPageSize),
    [filteredPointPayments, ppPage, ppPageSize],
  );




  // 載入 VIP 升級套組贈品（依訂單品項中 anchor product_id 對應）
  const itemProductIds = (items as any[]).map((i) => i.product_id).filter(Boolean);
  const itemPidKey = itemProductIds.slice().sort().join(",");
  const giftsQ = useQuery({
    queryKey: ["order-vip-gifts", orderId, itemPidKey],
    enabled: !!orderId && itemProductIds.length > 0,
    queryFn: async () => {
      // 1. 找出對應的套組（僅依訂單中的「套組主商品 package_product_id」比對，
      //    避免舊資料 product_id（贈品）誤觸發把非升級訂單顯示為 VIP 升級套組）
      const { data: pkgs } = await supabase
        .from("vip_upgrade_packages")
        .select("id, name, tier_code, bonus_points, package_product_id, product_id")
        .in("package_product_id", itemProductIds);

      if (!pkgs || pkgs.length === 0) return [] as any[];
      const pkgIds = pkgs.map((p: any) => p.id);
      // 2. 取得套組綁定贈品（多商品）
      const { data: binds } = await supabase
        .from("vip_upgrade_package_products")
        .select("package_id, product_id, quantity")
        .in("package_id", pkgIds);
      const productIds = Array.from(new Set((binds ?? []).map((b: any) => b.product_id).filter(Boolean)));
      // 含舊欄位 product_id（向下相容）
      for (const p of pkgs as any[]) {
        if (p.product_id && p.product_id !== p.package_product_id && !productIds.includes(p.product_id)) {
          productIds.push(p.product_id);
        }
      }
      if (productIds.length === 0) return pkgs.map((p: any) => ({ ...p, gifts: [] }));
      const { data: prods } = await supabase
        .from("products")
        .select("id, name, sku, image")
        .in("id", productIds);
      const prodMap = new Map((prods ?? []).map((p: any) => [p.id, p]));
      return (pkgs as any[]).map((p) => {
        const gifts = (binds ?? [])
          .filter((b: any) => b.package_id === p.id && b.product_id !== p.package_product_id)
          .map((b: any) => ({ ...prodMap.get(b.product_id), quantity: Number(b.quantity ?? 1) }))
          .filter((g: any) => g.id);
        // 向下相容：舊資料若僅有 pkg.product_id 且未在 binds 中，視為單一贈品
        if (gifts.length === 0 && p.product_id && p.product_id !== p.package_product_id) {
          const g = prodMap.get(p.product_id);
          if (g) gifts.push({ ...g, quantity: 1 });
        }
        return { ...p, gifts };
      });
    },
  });
  const vipPackages = (giftsQ.data ?? []) as any[];

  // 載入品項對應的商品獎勵點（tier_reward_points 為空時 fallback 用）
  const itemProductIdsForRewards = (items as any[]).map((i) => i.product_id).filter(Boolean);
  const itemRewardsKey = itemProductIdsForRewards.slice().sort().join(",");
  const productRewardsQ = useQuery({
    queryKey: ["order-item-product-rewards", orderId, itemRewardsKey],
    enabled: !!orderId && itemProductIdsForRewards.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("id, reward_points")
        .in("id", itemProductIdsForRewards);
      const map: Record<string, number> = {};
      for (const p of (data ?? []) as any[]) map[p.id] = Number(p.reward_points ?? 0);
      return map;
    },
  });
  const productRewardsMap = productRewardsQ.data ?? {};
  const getItemUnitReward = (it: any): number => {
    const t = it.tier_reward_points;
    if (t !== null && t !== undefined) return Number(t) || 0;
    return Number(productRewardsMap[it.product_id] ?? 0);
  };
  const getItemLineReward = (it: any): number =>
    getItemUnitReward(it) * Number(it.quantity ?? 0);
  const itemsRewardTotal = (items as any[]).reduce((s, it) => s + getItemLineReward(it), 0);

  // 依 VIP 獎金參數（買家 VIP 狀態 / 復購位階分潤）重算「本單產生獎勵點」
  const rewardPreview = useOrderRewardPreview({
    buyerId: (order as any)?.user_id ?? (order as any)?.customer_id ?? null,
    items: (items as any[]).map((it) => ({
      product_id: it.product_id,
      quantity: Number(it.quantity ?? 0),
      tier_reward_points: it.tier_reward_points,
    })),
    productRewardsMap,
    enabled: !!order && itemsRewardTotal > 0,
  });
  const rewardIssuedBuyer = rewardEarnRows
    .filter((r: any) => r.source === "order_earn")
    .reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0);
  const hasReferrerIssuance = rewardEarnRows.some((r: any) => r.source === "order_earn_referrer");

  const totalAmountNum = order ? Number(order.total_amount) : 0;
  const totals = computeOrderPaymentTotals({
    totalAmount: totalAmountNum,
    payments,
    pointPayments,
  });
  const paidTotal = totals.cashPaid;
  const pendingPayments = payments.filter((p: any) => p.payment_status !== "completed");
  const pendingPaymentsTotal = pendingPayments.reduce((s: number, p: any) => s + Number(p.amount ?? 0), 0);
  const pointOffsetApplied = totals.pointOffsetApplied;
  const totalReceived = totals.totalReceived;
  const unpaid = order ? totals.unpaid : 0;
  const overpaid = order ? totals.overpaid : 0;
  const paymentProgress = totalAmountNum > 0 ? Math.min(100, (totalReceived / totalAmountNum) * 100) : 0;
  // 前後端一致性斷言：totalReceived + unpaid 必等於 totalAmount（除非超收）
  if (order && Math.abs(totalReceived + unpaid - overpaid - totalAmountNum) > 0.5) {
    // eslint-disable-next-line no-console
    console.warn("[order-totals-mismatch]", {
      orderId: order.id,
      totalAmount: totalAmountNum,
      totalReceived,
      unpaid,
      overpaid,
    });
  }


  const updateStatus = useMutation({
    mutationFn: async (patch: Partial<Pick<OrderRow, "order_status" | "shipping_status" | "payment_status">>) => {
      if (!orderId) return patch;
      const { error } = await supabase.from("sales_orders").update(patch).eq("id", orderId);
      if (error) throw new Error(error.message);
      return patch;
    },
    onSuccess: async (patch) => {
      toast.success("狀態已更新");
      if (orderId && patch?.payment_status) {
        await autoSettleCommission(orderId, String(patch.payment_status));
      }
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
              {order.payment_status === "paid" && (
                <div className="px-6 pb-4">
                  <RerunUpgradeHookButton orderId={order.id} />
                </div>
              )}
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
                  {pointOffsetApplied > 0 && (
                    <Row
                      k="點數折抵"
                      v={`- ${fmt(pointOffsetApplied)}`}
                      accent="text-primary"
                    />
                  )}
                  <Row k="已收款" v={fmt(totalReceived)} accent="text-success" />
                  <Row k="未收款" v={fmt(unpaid)} accent={unpaid > 0 ? "text-warning" : "text-success"} />
                  {rewardPointsIssued > 0 && (
                    <Row
                      k="本次發放獎勵點"
                      v={`+ ${Number(rewardPointsIssued).toLocaleString()} 點`}
                      accent="text-amber-500"
                    />
                  )}
                  {rewardEarnRows.some((r: any) => r.source === "order_earn_referrer") && (
                    <div className="text-[11px] text-muted-foreground pt-1">
                      {rewardEarnRows.find((r: any) => r.source === "order_earn_referrer")?.note}
                    </div>
                  )}
                  <div className="pt-2 space-y-1">
                    <Progress value={paymentProgress} className="h-2" />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>收款進度</span>
                      <span>{Math.round(paymentProgress)}%</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* 收款摘要：已收 / 應收 / 差額 */}
            {(() => {
              const receivable = Number(order.total_amount);
              const diff = totalReceived - receivable; // 負數表示尚有未收
              const diffNegative = diff < 0;
              const diffColor = diffNegative
                ? "text-destructive"
                : diff > 0 ? "text-warning" : "text-success";
              return (
                <div className="grid grid-cols-3 gap-3">
                  <Card><CardContent className="pt-4">
                    <div className="text-xs uppercase tracking-wider text-muted-foreground">已收</div>
                    <div className="text-xl font-bold mt-1 text-success">{fmt(totalReceived)}</div>
                    {pointOffsetApplied > 0 && (
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        現金 {fmt(paidTotal)} + 點數 {fmt(pointOffsetApplied)}
                      </div>
                    )}
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
                        <TableHead className="text-right whitespace-nowrap">增加獎勵點</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((it: any) => {
                        const unitR = getItemUnitReward(it);
                        const lineR = getItemLineReward(it);
                        return (
                        <TableRow key={it.id}>
                          <TableCell className="text-sm">{it.product_name}</TableCell>
                          <TableCell className="font-mono text-xs">{it.sku ?? "—"}</TableCell>
                          <TableCell className="text-right">{fmt(it.unit_price)}</TableCell>
                          <TableCell className="text-right">{it.quantity}</TableCell>
                          <TableCell className="text-right font-medium">{fmt(it.subtotal)}</TableCell>
                          <TableCell className="text-right text-amber-600 whitespace-nowrap">
                            {lineR > 0 ? `+${lineR.toLocaleString()}` : "—"}
                            {unitR > 0 && Number(it.quantity ?? 0) > 1 && (
                              <span className="block text-[10px] text-muted-foreground">
                                {unitR.toLocaleString()} × {it.quantity}
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                        );
                      })}
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
                        <TableCell className="text-right font-semibold text-amber-600 whitespace-nowrap">
                          {itemsRewardTotal > 0 ? `+${itemsRewardTotal.toLocaleString()}` : "—"}
                        </TableCell>
                      </TableRow>
                      {(itemsRewardTotal > 0 || rewardPointsIssued > 0) && (
                        <TableRow>
                          <TableCell colSpan={6} className="p-2">
                            <OrderRewardSummary
                              breakdown={rewardPreview.breakdown}
                              issuedToBuyer={rewardIssuedBuyer}
                              hasReferrerIssuance={hasReferrerIssuance}
                            />
                          </TableCell>
                        </TableRow>
                      )}
                    </TableFooter>
                  </Table>
                  </div>

                )}
              </CardContent>
            </Card>

            {/* 獎勵點明細（發獎金用；非買家貢獻點錢包） */}
            <OrderRewardDetailCard
              breakdown={rewardPreview.breakdown}
              issuedToBuyer={rewardIssuedBuyer}
              hasReferrerIssuance={hasReferrerIssuance}
              rewardEarnRows={rewardEarnRows}
            />


            {/* VIP 升級套組贈品 */}
            {vipPackages.length > 0 && (
              <Card className="border-primary/40 bg-primary/[0.04]">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <PackageCheck className="h-4 w-4 text-primary" />
                    VIP 升級套組贈品
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {vipPackages.map((pkg) => (
                    <div key={pkg.id} className="rounded-md border border-border/60 bg-background/60 p-3">
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-sm font-medium">
                          {pkg.name}
                          <span className="ml-2 text-xs text-muted-foreground">{pkg.tier_code} 級</span>
                        </div>
                        {Number(pkg.bonus_points) > 0 && (
                          <Badge variant="secondary" className="text-xs">贈點 {pkg.bonus_points}</Badge>
                        )}
                      </div>
                      {pkg.gifts.length === 0 ? (
                        <div className="text-xs text-muted-foreground">此套組未設定贈品商品</div>
                      ) : (
                        <div className="space-y-1.5">
                          {pkg.gifts.map((g: any) => (
                            <div key={g.id} className="flex items-center gap-2 text-sm">
                              {g.image && <img src={g.image} alt={g.name} className="h-8 w-8 rounded object-cover" />}
                              <div className="flex-1 min-w-0">
                                <div className="truncate">{g.name}</div>
                                <div className="text-xs text-muted-foreground font-mono">{g.sku ?? "—"}</div>
                              </div>
                              <div className="text-xs text-muted-foreground">x{g.quantity}</div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  <p className="text-[11px] text-muted-foreground">
                    付款完成後系統會自動發放贈品（扣庫存）並升級會員 VIP 階層 / 加點。
                  </p>
                </CardContent>
              </Card>
            )}


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
                        <TableCell colSpan={4} className="text-right text-xs text-muted-foreground">現金已收</TableCell>
                        <TableCell className="text-right font-medium">{fmt(paidTotal)}</TableCell>
                      </TableRow>
                      {pointOffsetApplied > 0 && (
                        <TableRow>
                          <TableCell colSpan={4} className="text-right text-xs text-muted-foreground">點數折抵</TableCell>
                          <TableCell className="text-right font-medium text-primary">{fmt(pointOffsetApplied)}</TableCell>
                        </TableRow>
                      )}
                      <TableRow>
                        <TableCell colSpan={4} className="text-right text-xs text-muted-foreground">已收款合計</TableCell>
                        <TableCell className="text-right font-semibold text-success">{fmt(totalReceived)}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell colSpan={4} className="text-right text-xs text-muted-foreground">未收款</TableCell>
                        <TableCell className={`text-right font-semibold ${unpaid > 0 ? "text-warning" : "text-success"}`}>
                          {fmt(unpaid)}
                        </TableCell>
                      </TableRow>
                      {overpaid > 0 && (
                        <TableRow>
                          <TableCell colSpan={4} className="text-right text-xs text-muted-foreground">超收金額</TableCell>
                          <TableCell className="text-right font-semibold text-warning">{fmt(overpaid)}</TableCell>
                        </TableRow>
                      )}
                    </TableFooter>

                  </Table>
                  </div>

                )}
              </CardContent>
            </Card>

            {/* 點數付款分錄 (order_point_payments) */}
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-primary" />
                  點數付款分錄 ({filteredPointPayments.length}/{pointPayments.length})
                </CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7"
                  disabled={filteredPointPayments.length === 0}
                  onClick={() => {
                    const typeLabelOf = (t: string) =>
                      t === "discount" ? "折扣點" : t === "shopping" ? "購物點" : t === "reward" ? "貢獻點" : t ?? "";
                    const esc = (v: any) => {
                      const s = v == null ? "" : String(v);
                      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
                    };
                    const headers = [
                      "建立時間", "點數類型", "使用點數", "折抵金額", "狀態",
                      "備註", "Dedupe Key", "會員 ID", "點數交易 ID", "分錄 ID",
                    ];
                    const rows = filteredPointPayments.map((p: any) => [
                      new Date(p.created_at).toISOString(),
                      typeLabelOf(p.point_type),
                      p.points_used ?? 0,
                      p.amount_offset ?? 0,
                      p.status ?? "",
                      p.note ?? "",
                      p.dedupe_key ?? "",
                      p.member_id ?? "",
                      p.point_transaction_id ?? "",
                      p.id,
                    ]);
                    const csv = [headers, ...rows].map((r) => r.map(esc).join(",")).join("\n");
                    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    const ts = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
                    a.href = url;
                    a.download = `point_payments_${order?.order_no ?? orderId}_${ts}.csv`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    toast.success(`已匯出 ${filteredPointPayments.length} 筆`);
                  }}
                >
                  <Download className="h-3.5 w-3.5 mr-1" /> 匯出 CSV
                </Button>
              </CardHeader>

              <CardContent className="space-y-3">
                {/* 篩選 / 排序控制 */}
                <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
                  <div className="col-span-1">
                    <Label className="text-xs text-muted-foreground">起始日期</Label>
                    <Input type="date" value={ppFrom} onChange={(e) => setPpFrom(e.target.value)} className="h-8" />
                  </div>
                  <div className="col-span-1">
                    <Label className="text-xs text-muted-foreground">結束日期</Label>
                    <Input type="date" value={ppTo} onChange={(e) => setPpTo(e.target.value)} className="h-8" />
                  </div>
                  <div className="col-span-1">
                    <Label className="text-xs text-muted-foreground">類型</Label>
                    <Select value={ppType} onValueChange={setPpType}>
                      <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">全部</SelectItem>
                        <SelectItem value="discount">折扣點</SelectItem>
                        <SelectItem value="shopping">購物點</SelectItem>
                        <SelectItem value="reward">貢獻點</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-1">
                    <Label className="text-xs text-muted-foreground">狀態</Label>
                    <Select value={ppStatus} onValueChange={setPpStatus}>
                      <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">全部</SelectItem>
                        {ppStatusOptions.map((s) => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs text-muted-foreground">排序</Label>
                    <Select value={ppSort} onValueChange={setPpSort}>
                      <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="created_desc">日期（新→舊）</SelectItem>
                        <SelectItem value="created_asc">日期（舊→新）</SelectItem>
                        <SelectItem value="points_desc">使用點數（多→少）</SelectItem>
                        <SelectItem value="points_asc">使用點數（少→多）</SelectItem>
                        <SelectItem value="amount_desc">折抵金額（大→小）</SelectItem>
                        <SelectItem value="amount_asc">折抵金額（小→大）</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {(ppFrom || ppTo || ppType !== "all" || ppStatus !== "all" || ppSort !== "created_desc") && (
                  <div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => {
                        setPpFrom(""); setPpTo(""); setPpType("all"); setPpStatus("all"); setPpSort("created_desc");
                      }}
                    >
                      清除篩選
                    </Button>
                  </div>
                )}

                {pointPayments.length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">尚無點數付款紀錄</div>
                ) : filteredPointPayments.length === 0 ? (
                  <div className="p-6 text-center text-sm text-muted-foreground">此篩選條件下沒有符合的紀錄</div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>日期</TableHead>
                          <TableHead>點數類型</TableHead>
                          <TableHead className="text-right">使用點數</TableHead>
                          <TableHead className="text-right">折抵金額</TableHead>
                          <TableHead>狀態</TableHead>
                          <TableHead>備註 / Dedupe</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pagedPointPayments.map((pp: any) => {
                          const typeLabel =
                            pp.point_type === "discount"
                              ? "折扣點"
                              : pp.point_type === "shopping"
                              ? "購物點"
                              : pp.point_type === "reward"
                              ? "貢獻點"
                              : pp.point_type;
                          const typeClass =
                            pp.point_type === "discount"
                              ? "bg-blue-500/15 text-blue-400 border-blue-500/30"
                              : pp.point_type === "shopping"
                              ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                              : "bg-amber-500/15 text-amber-400 border-amber-500/30";
                          return (
                            <TableRow key={pp.id}>
                              <TableCell className="text-xs text-muted-foreground">
                                {new Date(pp.created_at).toLocaleString("zh-TW")}
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline" className={typeClass}>{typeLabel}</Badge>
                              </TableCell>
                              <TableCell className="text-right font-medium">{Number(pp.points_used).toLocaleString()}</TableCell>
                              <TableCell className="text-right font-medium">{fmt(pp.amount_offset)}</TableCell>
                              <TableCell>
                                <Badge variant="outline" className={pp.status === "completed" ? "bg-success/15 text-success border-success/30" : "bg-muted"}>
                                  {pp.status ?? "—"}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground max-w-[220px]">
                                <div className="truncate">{pp.note ?? "—"}</div>
                                <div className="truncate font-mono text-[10px] opacity-70">{pp.dedupe_key ?? ""}</div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                      <TableFooter>
                        <TableRow>
                          <TableCell colSpan={2} className="text-right text-xs text-muted-foreground">合計</TableCell>
                          <TableCell className="text-right font-semibold">
                            {filteredPointPayments.reduce((s: number, p: any) => s + Number(p.points_used ?? 0), 0).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right font-semibold text-success">
                            {fmt(filteredPointPayments.reduce((s: number, p: any) => s + Number(p.amount_offset ?? 0), 0))}
                          </TableCell>
                          <TableCell colSpan={2} />
                        </TableRow>
                      </TableFooter>
                    </Table>
                  </div>
                )}

                {/* 分頁控制 */}
                {filteredPointPayments.length > 0 && (
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>每頁</span>
                      <Select value={String(ppPageSize)} onValueChange={(v) => setPpPageSize(Number(v))}>
                        <SelectTrigger className="h-7 w-20"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {[5, 10, 20, 50, 100].map((n) => (
                            <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <span>
                        顯示 {(ppPage - 1) * ppPageSize + 1}–
                        {Math.min(ppPage * ppPageSize, filteredPointPayments.length)} / {filteredPointPayments.length}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="outline" size="sm" className="h-7 px-2" disabled={ppPage <= 1} onClick={() => setPpPage(1)}>«</Button>
                      <Button variant="outline" size="sm" className="h-7 px-2" disabled={ppPage <= 1} onClick={() => setPpPage((p) => Math.max(1, p - 1))}>‹</Button>
                      <span className="text-xs px-2">{ppPage} / {ppTotalPages}</span>
                      <Button variant="outline" size="sm" className="h-7 px-2" disabled={ppPage >= ppTotalPages} onClick={() => setPpPage((p) => Math.min(ppTotalPages, p + 1))}>›</Button>
                      <Button variant="outline" size="sm" className="h-7 px-2" disabled={ppPage >= ppTotalPages} onClick={() => setPpPage(ppTotalPages)}>»</Button>
                    </div>
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
                    logoUrl: pdfLogoUrl,
                    company: companyHeader,
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
  const [orderSource, setOrderSource] = useState(order.order_source ?? "");
  const [salespersonId, setSalespersonId] = useState<string>(order.salesperson_id ?? "");
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
    setOrderSource(order.order_source ?? "");
    setSalespersonId(order.salesperson_id ?? "");
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
    queryKey: ["products-picker-edit-orders", order.company_id],
    enabled: open && !!order.company_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id,name,sku,price,image,stock,status")
        .eq("company_id", order.company_id!)
        .order("updated_at", { ascending: false })
        .limit(500);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const rewardTxQ = useQuery({
    queryKey: ["order-edit-reward-tx", order.id],
    enabled: open && !!order.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("point_transactions")
        .select("amount, source, note")
        .eq("reference_id", order.id)
        .in("source", ["order_earn", "order_earn_referrer"])
        .eq("point_type", "reward");
      if (error) throw new Error(error.message);
      return (data ?? []) as RewardTxRow[];
    },
  });
  const rewardNotice = resolveRewardNotice(rewardTxQ.data ?? []);

  const staffQ = useQuery({
    queryKey: ["company-staff-picker-edit", order.company_id],
    enabled: open && !!order.company_id,
    queryFn: async () => {
      const { data: members, error } = await supabase
        .from("company_members")
        .select("user_id")
        .eq("company_id", order.company_id!);
      if (error) throw new Error(error.message);
      const ids = (members ?? []).map((m) => m.user_id);
      if (ids.length === 0) return [] as Array<{ id: string; name: string }>;
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, name, email")
        .in("id", ids);
      return (profs ?? [])
        .map((p) => ({ id: p.id as string, name: (p.name as string | null) ?? (p.email as string | null) ?? "(未命名)" }))
        .sort((a, b) => a.name.localeCompare(b.name, "zh-Hant"));
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

  const logRewardAudit = useServerFn(logOrderRewardPointsAudit);

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

      // Snapshot 編輯前的「本次發放獎勵點」狀態
      const beforeNotice = resolveRewardNotice(rewardTxQ.data ?? []);

      // 記錄要進審計的欄位變更（金額 / 品項會影響獎勵點）
      const changedFields: string[] = [];
      if (Number(order.subtotal ?? 0) !== subtotalNum) changedFields.push("subtotal");
      if (Number(order.shipping_fee ?? 0) !== Number(shippingFee || 0)) changedFields.push("shipping_fee");
      if (Number(order.discount_amount ?? 0) !== Number(discount || 0)) changedFields.push("discount_amount");
      if (Number(order.total_amount ?? 0) !== total) changedFields.push("total_amount");

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
          order_source: orderSource.trim() || null,
          salesperson_id: salespersonId || null,
          salesperson_name: null,
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

      // 3) 重新讀取獎勵點交易，寫入審計紀錄
      const { data: afterRows } = await supabase
        .from("point_transactions")
        .select("amount, source, note")
        .eq("reference_id", order.id)
        .in("source", ["order_earn", "order_earn_referrer"])
        .eq("point_type", "reward");
      const afterNotice = resolveRewardNotice((afterRows ?? []) as RewardTxRow[]);
      const toPayload = (n: ReturnType<typeof resolveRewardNotice>) =>
        n === null
          ? { kind: "none" as const, points: 0, note: null }
          : n.kind === "earn"
            ? { kind: "earn" as const, points: n.points, note: null }
            : { kind: "referrer" as const, points: 0, note: n.note };
      try {
        await logRewardAudit({
          data: {
            orderId: order.id,
            orderNo: order.order_no,
            before: toPayload(beforeNotice),
            after: toPayload(afterNotice),
            changedFields,
          },
        });
      } catch (e) {
        // 審計失敗不阻擋主流程
        console.warn("[edit-order] reward-points audit failed:", e);
      }
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
                                <div className="text-sm font-medium truncate flex items-center gap-1.5">
                                  <span className="truncate">{p.name}</span>
                                  <Badge variant="outline" className={p.status === "active" ? "border-emerald-500/40 text-emerald-700" : "border-muted-foreground/40 text-muted-foreground"}>
                                    {p.status === "active" ? "上架中" : "已下架"}
                                  </Badge>
                                </div>
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

          {rewardNotice && (
            rewardNotice.kind === "earn" ? (
              <div className="flex items-center justify-between rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-600">
                <span>本次發放獎勵點</span>
                <span className="tabular-nums font-semibold">+ {rewardNotice.points.toLocaleString()} 點</span>
              </div>
            ) : (
              <div className="rounded-md bg-muted/40 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
                已轉推薦人獎勵點錢包：{rewardNotice.note}
              </div>
            )
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>訂單來源</Label>
              <Input
                list="order-source-options-edit"
                value={orderSource}
                onChange={(e) => setOrderSource(e.target.value)}
                placeholder="例如：官網、電話、LINE..."
              />
              <datalist id="order-source-options-edit">
                {ORDER_SOURCES.map((s) => <option key={s} value={s} />)}
              </datalist>
            </div>
            <div>
              <Label>業務人員</Label>
              <Select value={salespersonId || "none"} onValueChange={(v) => setSalespersonId(v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="請選擇" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">未指定</SelectItem>
                  {(staffQ.data ?? []).map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2"><Label>備註</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
            <div className="sm:col-span-2 text-xs text-muted-foreground">
              建檔人員：{order.created_by_name ?? "—"}（依登入帳號自動產生，無法修改）
            </div>
          </div>

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
    onSuccess: async ({ nextStatus }) => {
      toast.success(`已記錄付款（訂單狀態：${PAYMENT_STATUS[nextStatus as keyof typeof PAYMENT_STATUS]?.label}）`);
      await autoSettleCommission(orderId, nextStatus);
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
    await autoSettleCommission(orderId, String(next));
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

// =================== Inline 訂單狀態 / 出貨狀態快速修改 ===================
function OrderStatusCell({
  orderId,
  value,
  onChanged,
}: {
  orderId: string;
  value: keyof typeof ORDER_STATUS;
  onChanged: () => void;
}) {
  const [pending, setPending] = useState(false);
  const current = ORDER_STATUS[value];

  async function update(next: keyof typeof ORDER_STATUS) {
    if (next === value) return;
    setPending(true);
    const { error } = await supabase
      .from("sales_orders")
      .update({ order_status: next })
      .eq("id", orderId);
    setPending(false);
    if (error) {
      toast.error("更新訂單狀態失敗", { description: error.message });
      return;
    }
    toast.success(`訂單狀態已更新為「${ORDER_STATUS[next].label}」`);
    onChanged();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={pending}
          className="inline-flex items-center gap-1 disabled:opacity-60"
          title="點擊修改訂單狀態"
          onClick={(e) => e.stopPropagation()}
        >
          <Badge variant="outline" className={`${current?.tone ?? ""} cursor-pointer hover:opacity-80`}>
            {pending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
            {current?.label ?? value}
          </Badge>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[140px]">
        {(Object.keys(ORDER_STATUS) as Array<keyof typeof ORDER_STATUS>).map((k) => (
          <DropdownMenuItem
            key={k}
            onClick={() => update(k)}
            className="flex items-center justify-between gap-2"
          >
            <span>{ORDER_STATUS[k].label}</span>
            {k === value && <Check className="h-3.5 w-3.5 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ShippingStatusCell({
  orderId,
  value,
  onChanged,
}: {
  orderId: string;
  value: keyof typeof SHIPPING_STATUS;
  onChanged: () => void;
}) {
  const [pending, setPending] = useState(false);
  const current = SHIPPING_STATUS[value];

  async function update(next: keyof typeof SHIPPING_STATUS) {
    if (next === value) return;
    setPending(true);
    const { error } = await supabase
      .from("sales_orders")
      .update({ shipping_status: next })
      .eq("id", orderId);
    setPending(false);
    if (error) {
      toast.error("更新出貨狀態失敗", { description: error.message });
      return;
    }
    toast.success(`出貨狀態已更新為「${SHIPPING_STATUS[next].label}」`);
    onChanged();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={pending}
          className="inline-flex items-center gap-1 disabled:opacity-60"
          title="點擊修改出貨狀態"
          onClick={(e) => e.stopPropagation()}
        >
          <Badge variant="outline" className={`${current?.tone ?? ""} cursor-pointer hover:opacity-80`}>
            {pending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
            {current?.label ?? value}
          </Badge>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[140px]">
        {(Object.keys(SHIPPING_STATUS) as Array<keyof typeof SHIPPING_STATUS>).map((k) => (
          <DropdownMenuItem
            key={k}
            onClick={() => update(k)}
            className="flex items-center justify-between gap-2"
          >
            <span>{SHIPPING_STATUS[k].label}</span>
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

// =================== 補跑 VIP 升級 hook（管理員用） ===================
function RerunUpgradeHookButton({ orderId }: { orderId: string }) {
  const rerunFn = useServerFn(adminRerunOrderUpgrades);
  const [pending, setPending] = useState(false);
  async function run() {
    setPending(true);
    try {
      const r: any = await rerunFn({ data: { orderId } });
      if (!r?.ok) {
        toast.warning("補跑未執行", { description: r?.reason ?? "未知原因" });
        return;
      }
      const pkgC = Number(r.vip_package_created ?? 0);
      const pkgS = Number(r.vip_package_skipped ?? 0);
      const afC  = Number(r.annual_fee_created  ?? 0);
      const afS  = Number(r.annual_fee_skipped  ?? 0);
      if (pkgC + afC === 0) {
        toast.info("無新增升級紀錄（已全部處理過）", {
          description: `VIP套組已處理 ${pkgS} 筆、年費規則已處理 ${afS} 筆`,
        });
      } else {
        toast.success(
          `補跑完成：VIP套組 +${pkgC}、年費 +${afC}${
            pkgS + afS > 0 ? `（另跳過 ${pkgS + afS} 筆已處理）` : ""
          }`,
        );
      }
    } catch (e: any) {
      toast.error("補跑失敗", { description: e?.message ?? String(e) });
    } finally {
      setPending(false);
    }
  }
  return (
    <Button size="sm" variant="outline" onClick={run} disabled={pending}>
      {pending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <RotateCw className="h-3.5 w-3.5 mr-1" />}
      補跑 VIP 升級 hook
    </Button>
  );
}

