import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  adminApplySalesReturnEffects,
  adminCreateSalesReturn,
  adminGetSalesReturnDetail,
  adminListSalesReturns,
  adminUpdateSalesReturnStatus,
} from "@/lib/sales-returns.functions";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { ForbiddenScreen } from "@/components/ForbiddenScreen";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/sales-returns")({
  component: SalesReturnsPage,
});

const ADMIN_ROLES = ["super_admin", "admin", "finance"] as const;

const STATUS_LABEL: Record<string, string> = {
  draft: "草稿",
  submitted: "已送出",
  approved: "已核准",
  completed: "已完成",
  cancelled: "已取消",
};

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  draft: "outline",
  submitted: "secondary",
  approved: "default",
  completed: "default",
  cancelled: "destructive",
};

const TYPE_LABEL: Record<string, string> = {
  partial_return: "部分退貨",
  full_return: "全部退貨",
  exchange: "換貨",
  refund_only: "僅退款",
};

const INVENTORY_ACTION_LABEL: Record<string, string> = {
  restock: "回補庫存",
  scrap: "報廢",
  no_stock_change: "不動庫存",
};

const PROCESS_LABEL: Record<string, string> = {
  pending: "待處理",
  processed: "已處理",
  skipped: "已略過",
  failed: "失敗",
};

function fmtMoney(v: any) {
  const n = Number(v ?? 0);
  return `NT$ ${n.toLocaleString()}`;
}

function fmtDate(v: any) {
  if (!v) return "-";
  try { return new Date(v).toLocaleString(); } catch { return String(v); }
}

function SalesReturnsPage() {
  const { roles } = useAuth();
  const allowed = roles.some((r) => (ADMIN_ROLES as readonly string[]).includes(r));
  if (!allowed) return <ForbiddenScreen requiredRoles={ADMIN_ROLES as unknown as string[]} />;

  const qc = useQueryClient();
  const listFn = useServerFn(adminListSalesReturns);
  const applyFn = useServerFn(adminApplySalesReturnEffects);
  const updateStatusFn = useServerFn(adminUpdateSalesReturnStatus);

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["sales-returns", statusFilter, query],
    queryFn: () =>
      listFn({
        data: {
          status: statusFilter as any,
          query,
          limit: 200,
        },
      }),
  });

  const rows = (data as any[]) ?? [];

  const applyMut = useMutation({
    mutationFn: (id: string) => applyFn({ data: { id } }),
    onSuccess: () => {
      toast.success("已套用退貨效果");
      qc.invalidateQueries({ queryKey: ["sales-returns"] });
      qc.invalidateQueries({ queryKey: ["sales-return-detail"] });
    },
    onError: (e: any) => toast.error(e?.message || "套用失敗"),
  });

  const statusMut = useMutation({
    mutationFn: (v: { id: string; status: string; note?: string }) =>
      updateStatusFn({ data: v as any }),
    onSuccess: () => {
      toast.success("狀態已更新");
      qc.invalidateQueries({ queryKey: ["sales-returns"] });
      qc.invalidateQueries({ queryKey: ["sales-return-detail"] });
    },
    onError: (e: any) => toast.error(e?.message || "更新失敗"),
  });

  return (
    <div className="p-4 md:p-6 space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>退貨單管理</CardTitle>
          <Button onClick={() => setCreateOpen(true)}>建立退貨單</Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <div className="w-40">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger><SelectValue placeholder="狀態" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部狀態</SelectItem>
                  {Object.entries(STATUS_LABEL).map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-64">
              <Input
                placeholder="搜尋退貨單號 / 原因"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="border rounded-lg overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>退貨單號</TableHead>
                  <TableHead>原訂單</TableHead>
                  <TableHead>客戶</TableHead>
                  <TableHead>類型</TableHead>
                  <TableHead>退款金額</TableHead>
                  <TableHead>庫存</TableHead>
                  <TableHead>獎勵點</TableHead>
                  <TableHead>狀態</TableHead>
                  <TableHead>建立時間</TableHead>
                  <TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow><TableCell colSpan={10} className="text-center py-6">載入中…</TableCell></TableRow>
                )}
                {!isLoading && rows.length === 0 && (
                  <TableRow><TableCell colSpan={10} className="text-center py-6 text-muted-foreground">尚無退貨單</TableCell></TableRow>
                )}
                {rows.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">{r.return_no}</TableCell>
                    <TableCell className="text-xs">{r.order?.order_no ?? "-"}</TableCell>
                    <TableCell className="text-xs">{r.order?.customer_name ?? "-"}</TableCell>
                    <TableCell><Badge variant="outline">{TYPE_LABEL[r.return_type] ?? r.return_type}</Badge></TableCell>
                    <TableCell>{fmtMoney(r.refund_amount)}</TableCell>
                    <TableCell className="text-xs">{PROCESS_LABEL[r.inventory_status] ?? r.inventory_status}</TableCell>
                    <TableCell className="text-xs">{PROCESS_LABEL[r.points_reverse_status] ?? r.points_reverse_status}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[r.status] ?? "outline"}>
                        {STATUS_LABEL[r.status] ?? r.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs">{fmtDate(r.created_at)}</TableCell>
                    <TableCell>
                      <Button size="sm" variant="outline" onClick={() => setDetailId(r.id)}>詳情</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {detailId && (
        <DetailDialog
          id={detailId}
          onClose={() => setDetailId(null)}
          onStatusChange={(status, note) =>
            statusMut.mutate({ id: detailId, status, note })
          }
          onApply={() => applyMut.mutate(detailId)}
          statusPending={statusMut.isPending}
          applyPending={applyMut.isPending}
        />
      )}

      {createOpen && (
        <CreateDialog
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            qc.invalidateQueries({ queryKey: ["sales-returns"] });
          }}
        />
      )}
    </div>
  );
}

function DetailDialog({
  id,
  onClose,
  onStatusChange,
  onApply,
  statusPending,
  applyPending,
}: {
  id: string;
  onClose: () => void;
  onStatusChange: (status: string, note?: string) => void;
  onApply: () => void;
  statusPending: boolean;
  applyPending: boolean;
}) {
  const detailFn = useServerFn(adminGetSalesReturnDetail);
  const [note, setNote] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["sales-return-detail", id],
    queryFn: () => detailFn({ data: { id } }),
  });

  const salesReturn = (data as any)?.salesReturn;
  const items = ((data as any)?.items ?? []) as any[];
  const order = (data as any)?.order;
  const pointReversals = ((data as any)?.pointReversals ?? []) as any[];

  const nextStatuses = useMemo(() => {
    if (!salesReturn) return [] as string[];
    const s = salesReturn.status;
    if (s === "draft") return ["submitted", "cancelled"];
    if (s === "submitted") return ["approved", "cancelled"];
    if (s === "approved") return ["cancelled"];
    return [];
  }, [salesReturn?.status]);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            退貨單詳情 {salesReturn ? `- ${salesReturn.return_no}` : ""}
          </DialogTitle>
        </DialogHeader>

        {isLoading && <div className="py-8 text-center">載入中…</div>}

        {!isLoading && salesReturn && (
          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              <Info label="狀態" value={
                <Badge variant={STATUS_VARIANT[salesReturn.status] ?? "outline"}>
                  {STATUS_LABEL[salesReturn.status] ?? salesReturn.status}
                </Badge>
              } />
              <Info label="類型" value={TYPE_LABEL[salesReturn.return_type] ?? salesReturn.return_type} />
              <Info label="退款金額" value={fmtMoney(salesReturn.refund_amount)} />
              <Info label="庫存處理" value={PROCESS_LABEL[salesReturn.inventory_status] ?? salesReturn.inventory_status} />
              <Info label="獎勵點回收" value={PROCESS_LABEL[salesReturn.points_reverse_status] ?? salesReturn.points_reverse_status} />
              <Info label="建立時間" value={fmtDate(salesReturn.created_at)} />
              <Info label="送出時間" value={fmtDate(salesReturn.submitted_at)} />
              <Info label="核准時間" value={fmtDate(salesReturn.approved_at)} />
              <Info label="完成時間" value={fmtDate(salesReturn.completed_at)} />
            </div>

            <div className="border rounded-md p-3 space-y-1">
              <div className="font-medium">原訂單</div>
              {order ? (
                <div className="text-xs space-y-0.5">
                  <div>單號：{order.order_no}</div>
                  <div>客戶：{order.customer_name} / {order.customer_phone}</div>
                  <div>總額：{fmtMoney(order.total_amount)}</div>
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">找不到原訂單</div>
              )}
            </div>

            {salesReturn.reason && (
              <Info label="退貨原因" value={salesReturn.reason} />
            )}
            {salesReturn.notes && (
              <div>
                <div className="text-muted-foreground text-xs">備註</div>
                <div className="whitespace-pre-wrap text-xs">{salesReturn.notes}</div>
              </div>
            )}

            <div>
              <div className="font-medium mb-2">退貨明細</div>
              <div className="border rounded-lg overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>商品</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>數量</TableHead>
                      <TableHead>單價</TableHead>
                      <TableHead>小計</TableHead>
                      <TableHead>庫存動作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((it) => (
                      <TableRow key={it.id}>
                        <TableCell>{it.product_name}</TableCell>
                        <TableCell className="text-xs">{it.sku ?? "-"}</TableCell>
                        <TableCell>{it.quantity}</TableCell>
                        <TableCell>{fmtMoney(it.unit_price)}</TableCell>
                        <TableCell>{fmtMoney(it.subtotal)}</TableCell>
                        <TableCell className="text-xs">
                          {INVENTORY_ACTION_LABEL[it.inventory_action] ?? it.inventory_action}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            {pointReversals.length > 0 && (
              <div>
                <div className="font-medium mb-2">獎勵點回收紀錄</div>
                <div className="text-xs space-y-1">
                  {pointReversals.map((tx: any) => (
                    <div key={tx.id} className="flex justify-between border-b py-1">
                      <span>{tx.user_id}</span>
                      <span>{tx.amount} 點</span>
                      <span className="text-muted-foreground">{fmtDate(tx.created_at)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {salesReturn.status !== "completed" && salesReturn.status !== "cancelled" && (
              <div className="border-t pt-3 space-y-2">
                <label className="text-sm font-medium">備註（狀態變更 / 套用時附加）</label>
                <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 flex-wrap">
          {salesReturn && nextStatuses.map((s) => (
            <Button
              key={s}
              variant={s === "cancelled" ? "destructive" : "outline"}
              disabled={statusPending}
              onClick={() => onStatusChange(s, note || undefined)}
            >
              {s === "cancelled" ? "取消退貨單" : `轉為${STATUS_LABEL[s]}`}
            </Button>
          ))}
          {salesReturn && salesReturn.status === "approved" && (
            <Button disabled={applyPending} onClick={onApply}>
              套用退貨效果（回補庫存 + 追回獎勵點 + 完成）
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>關閉</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Info({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <div className="text-muted-foreground text-xs">{label}</div>
      <div className="text-sm">{value ?? "-"}</div>
    </div>
  );
}

function CreateDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const createFn = useServerFn(adminCreateSalesReturn);

  const [orderQuery, setOrderQuery] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [returnType, setReturnType] = useState("partial_return");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Record<string, { quantity: number; inventory_action: string; reason?: string }>>({});

  const { data: ordersData, isLoading: ordersLoading } = useQuery({
    queryKey: ["sales-returns-orders", orderQuery],
    queryFn: async () => {
      let q = supabase
        .from("sales_orders")
        .select("id, order_no, customer_name, customer_phone, total_amount, created_at")
        .order("created_at", { ascending: false })
        .limit(30);
      const kw = orderQuery.trim();
      if (kw) {
        const esc = kw.replace(/[%_]/g, "\\$&");
        q = q.or(`order_no.ilike.%${esc}%,customer_name.ilike.%${esc}%,customer_phone.ilike.%${esc}%`);
      }
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const orders = (ordersData ?? []) as any[];

  const { data: orderItemsData } = useQuery({
    queryKey: ["sales-returns-order-items", selectedOrderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_order_items")
        .select("id, sales_order_id, product_id, product_name, sku, unit_price, quantity")
        .eq("sales_order_id", selectedOrderId!)
        .order("created_at");
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    enabled: !!selectedOrderId,
  });

  const orderItems: any[] = (orderItemsData ?? []) as any[];


  useEffect(() => {
    setLines({});
  }, [selectedOrderId]);

  const createMut = useMutation({
    mutationFn: () => {
      const items = Object.entries(lines)
        .filter(([, v]) => v.quantity > 0)
        .map(([sales_order_item_id, v]) => ({
          sales_order_item_id,
          quantity: v.quantity,
          inventory_action: v.inventory_action as any,
          reason: v.reason,
        }));
      if (!selectedOrderId) throw new Error("請先選擇原訂單。");
      if (items.length === 0) throw new Error("請至少填寫一筆退貨明細。");
      return createFn({
        data: {
          sales_order_id: selectedOrderId,
          return_type: returnType as any,
          reason: reason || undefined,
          notes: notes || undefined,
          items,
        },
      });
    },
    onSuccess: () => {
      toast.success("退貨單已建立");
      onCreated();
    },
    onError: (e: any) => toast.error(e?.message || "建立失敗"),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>建立退貨單</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div>
            <label className="text-sm font-medium">搜尋原訂單</label>
            <Input
              className="mt-1"
              placeholder="輸入訂單編號 / 客戶姓名 / 電話"
              value={orderQuery}
              onChange={(e) => setOrderQuery(e.target.value)}
            />
            <div className="mt-2 border rounded-md max-h-48 overflow-y-auto">
              {ordersLoading && <div className="p-3 text-center text-muted-foreground">載入中…</div>}
              {!ordersLoading && orders.length === 0 && (
                <div className="p-3 text-center text-muted-foreground text-xs">查無訂單</div>
              )}
              {orders.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setSelectedOrderId(o.id)}
                  className={`w-full text-left px-3 py-2 border-b text-xs hover:bg-muted ${selectedOrderId === o.id ? "bg-muted" : ""}`}
                >
                  <div className="font-mono">{o.order_no}</div>
                  <div className="text-muted-foreground">
                    {o.customer_name} / {o.customer_phone} / {fmtMoney(o.total_amount)}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {selectedOrderId && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium">退貨類型</label>
                  <Select value={returnType} onValueChange={setReturnType}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(TYPE_LABEL).map(([v, l]) => (
                        <SelectItem key={v} value={v}>{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium">退貨原因</label>
                  <Input className="mt-1" value={reason} onChange={(e) => setReason(e.target.value)} />
                </div>
              </div>

              <div>
                <label className="text-sm font-medium">備註</label>
                <Textarea className="mt-1" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>

              <div>
                <div className="font-medium mb-2">退貨明細</div>
                {orderItems.length === 0 ? (
                  <div className="text-xs text-muted-foreground border rounded-md p-3">
                    此訂單無法取得明細。請手動填入退貨數量後送出，系統將以伺服器端驗證為準。
                  </div>
                ) : (
                  <div className="border rounded-lg overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>商品</TableHead>
                          <TableHead>原數量</TableHead>
                          <TableHead>退貨數量</TableHead>
                          <TableHead>庫存動作</TableHead>
                          <TableHead>備註</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {orderItems.map((it: any) => {
                          const line = lines[it.id] ?? { quantity: 0, inventory_action: "restock" };
                          return (
                            <TableRow key={it.id}>
                              <TableCell>
                                <div>{it.product_name}</div>
                                <div className="text-xs text-muted-foreground">{it.sku ?? ""}</div>
                              </TableCell>
                              <TableCell>{it.quantity}</TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  min={0}
                                  max={it.quantity}
                                  value={line.quantity}
                                  onChange={(e) => {
                                    const q = Math.max(0, Math.min(Number(it.quantity), Number(e.target.value) || 0));
                                    setLines((prev) => ({
                                      ...prev,
                                      [it.id]: { ...(prev[it.id] ?? { inventory_action: "restock" }), quantity: q },
                                    }));
                                  }}
                                  className="w-20"
                                />
                              </TableCell>
                              <TableCell>
                                <Select
                                  value={line.inventory_action}
                                  onValueChange={(v) =>
                                    setLines((prev) => ({
                                      ...prev,
                                      [it.id]: { ...(prev[it.id] ?? { quantity: 0 }), inventory_action: v },
                                    }))
                                  }
                                >
                                  <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {Object.entries(INVENTORY_ACTION_LABEL).map(([v, l]) => (
                                      <SelectItem key={v} value={v}>{l}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </TableCell>
                              <TableCell>
                                <Input
                                  value={line.reason ?? ""}
                                  onChange={(e) =>
                                    setLines((prev) => ({
                                      ...prev,
                                      [it.id]: { ...(prev[it.id] ?? { quantity: 0, inventory_action: "restock" }), reason: e.target.value },
                                    }))
                                  }
                                />
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose}>取消</Button>
          <Button
            onClick={() => createMut.mutate()}
            disabled={!selectedOrderId || createMut.isPending}
          >
            建立退貨單
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
