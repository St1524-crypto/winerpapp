import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Plus, Search, PackageX, Eye, Trash2, Send, CheckCircle2, Ban, AlertTriangle } from "lucide-react";
import {
  adminListPurchaseReturns,
  adminGetPurchaseReturnDetail,
  adminListPurchaseOrdersForReturn,
  adminGetPOItemsForReturn,
  adminCreatePurchaseReturn,
  adminUpdatePurchaseReturnStatus,
  adminApplyPurchaseReturnEffects,
} from "@/lib/purchase-returns.functions";

export const Route = createFileRoute("/_authenticated/purchase-returns")({
  head: () => ({
    meta: [{ title: "進貨退回管理 · 源晶ERP" }, { name: "description", content: "後台建立廠商進貨退回單，扣庫存並沖銷應付帳款" }],
  }),
  component: Page,
});

const STATUS = [
  { v: "draft", label: "草稿", variant: "secondary" as const },
  { v: "submitted", label: "已送出", variant: "outline" as const },
  { v: "completed", label: "已完成", variant: "default" as const },
  { v: "cancelled", label: "已取消", variant: "destructive" as const },
];
const sMeta = (s: string) => STATUS.find((x) => x.v === s) ?? STATUS[0];

interface PR {
  id: string; return_no: string; purchase_order_id: string; vendor_name: string;
  status: string; subtotal: number; inventory_status: string; payable_status: string;
  created_at: string; reason?: string | null;
  purchase_order?: { po_no: string } | null;
}
interface POOpt { id: string; po_no: string; vendor_name: string; total_amount: number; status: string; }
interface POItem {
  id: string; product_id: string | null; product_name: string; sku: string | null;
  price: number; quantity: number; received_quantity: number; returned_quantity: number;
}
interface DraftLine {
  purchase_order_item_id: string; product_name: string; sku: string | null;
  price: number; max: number; quantity: number; inventory_action: "deduct_stock" | "no_stock_change";
  reason?: string;
}

function Page() {
  const list = useServerFn(adminListPurchaseReturns);
  const detail = useServerFn(adminGetPurchaseReturnDetail);
  const listPOs = useServerFn(adminListPurchaseOrdersForReturn);
  const getPOItems = useServerFn(adminGetPOItemsForReturn);
  const create = useServerFn(adminCreatePurchaseReturn);
  const updateStatus = useServerFn(adminUpdatePurchaseReturnStatus);
  const apply = useServerFn(adminApplyPurchaseReturnEffects);

  const [rows, setRows] = useState<PR[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

  const [creating, setCreating] = useState(false);
  const [pos, setPos] = useState<POOpt[]>([]);
  const [selectedPO, setSelectedPO] = useState<string>("");
  const [poItems, setPoItems] = useState<POItem[]>([]);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [viewing, setViewing] = useState<PR | null>(null);
  const [viewData, setViewData] = useState<any | null>(null);
  const [applying, setApplying] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await list({ data: { status: statusFilter as any, query: search } });
      setRows(data as PR[]);
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [statusFilter]);

  async function openCreate() {
    setCreating(true); setSelectedPO(""); setPoItems([]); setLines([]); setReason(""); setNotes("");
    try {
      const p = await listPOs();
      setPos(p as POOpt[]);
    } catch (e: any) { toast.error(e.message); }
  }

  async function pickPO(id: string) {
    setSelectedPO(id); setLines([]);
    try {
      const r = await getPOItems({ data: { purchase_order_id: id } }) as { items: POItem[] };
      setPoItems(r.items);
    } catch (e: any) { toast.error(e.message); }
  }

  function toggleLine(item: POItem, checked: boolean) {
    if (checked) {
      const max = Math.max(0, item.received_quantity - item.returned_quantity);
      if (max <= 0) { toast.error(`「${item.product_name}」已無可退數量`); return; }
      setLines((prev) => [...prev, {
        purchase_order_item_id: item.id, product_name: item.product_name, sku: item.sku,
        price: item.price, max, quantity: max, inventory_action: "deduct_stock",
      }]);
    } else {
      setLines((prev) => prev.filter((l) => l.purchase_order_item_id !== item.id));
    }
  }
  function updateLine(id: string, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((l) => l.purchase_order_item_id === id ? { ...l, ...patch } : l));
  }

  const total = useMemo(() => lines.reduce((s, l) => s + l.quantity * l.price, 0), [lines]);

  async function submitCreate() {
    if (!selectedPO) return toast.error("請選擇採購單");
    if (lines.length === 0) return toast.error("請至少選一筆明細");
    if (lines.some((l) => l.quantity <= 0 || l.quantity > l.max)) return toast.error("數量錯誤");
    setSubmitting(true);
    try {
      await create({ data: {
        purchase_order_id: selectedPO,
        reason: reason || undefined,
        notes: notes || undefined,
        items: lines.map((l) => ({
          purchase_order_item_id: l.purchase_order_item_id,
          quantity: l.quantity, inventory_action: l.inventory_action, reason: l.reason,
        })),
      } });
      toast.success("進貨退回單已建立");
      setCreating(false); load();
    } catch (e: any) { toast.error(e.message); }
    finally { setSubmitting(false); }
  }

  async function view(pr: PR) {
    setViewing(pr); setViewData(null);
    try {
      const d = await detail({ data: { id: pr.id } });
      setViewData(d);
    } catch (e: any) { toast.error(e.message); }
  }

  async function doStatus(pr: PR, status: "submitted" | "cancelled" | "draft") {
    try {
      await updateStatus({ data: { id: pr.id, status } });
      toast.success("狀態已更新"); load();
      if (viewing?.id === pr.id) view(pr);
    } catch (e: any) { toast.error(e.message); }
  }

  async function doApply(pr: PR) {
    if (!confirm(`套用效果：扣庫存（允許負值）+ 沖銷應付帳款\n退回單：${pr.return_no}\n金額：NT$ ${Number(pr.subtotal).toLocaleString()}\n確定執行？`)) return;
    setApplying(true);
    try {
      const r = await apply({ data: { id: pr.id } }) as any;
      if (r.skipped === "already_applied") toast.info("此退回單已套用過");
      else toast.success("已套用：庫存與應付已更新");
      load(); if (viewing?.id === pr.id) view(pr);
    } catch (e: any) { toast.error(e.message); }
    finally { setApplying(false); }
  }

  const filtered = useMemo(() => rows.filter((r) => {
    if (!search) return true;
    const kw = search.toLowerCase();
    return [r.return_no, r.vendor_name, r.purchase_order?.po_no].some((x) => (x ?? "").toLowerCase().includes(kw));
  }), [rows, search]);

  return (
    <div className="max-w-[1600px] mx-auto space-y-6 p-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <PackageX className="h-6 w-6 text-primary" />進貨退回管理
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            廠商退貨：扣庫存（允許負值）+ 沖銷應付帳款；不影響會員獎勵點
          </p>
        </div>
        <Button onClick={openCreate} className="bg-gradient-primary">
          <Plus className="h-4 w-4 mr-1" />新增退回單
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="搜尋退回單號 / 採購單 / 廠商..." className="pl-9"
                     value={search} onChange={(e) => setSearch(e.target.value)}
                     onKeyDown={(e) => e.key === "Enter" && load()} />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部狀態</SelectItem>
                {STATUS.map((s) => <SelectItem key={s.v} value={s.v}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={load}>重新整理</Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>退回單號</TableHead>
                  <TableHead>採購單</TableHead>
                  <TableHead>廠商</TableHead>
                  <TableHead>狀態</TableHead>
                  <TableHead>庫存</TableHead>
                  <TableHead>應付</TableHead>
                  <TableHead className="text-right">金額</TableHead>
                  <TableHead>建立時間</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? Array.from({ length: 4 }).map((_, i) => (
                  <TableRow key={i}><TableCell colSpan={9}><Skeleton className="h-8 w-full" /></TableCell></TableRow>
                )) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-10">尚無退回單</TableCell></TableRow>
                ) : filtered.map((r) => {
                  const m = sMeta(r.status);
                  return (
                    <TableRow key={r.id} className="cursor-pointer" onClick={() => view(r)}>
                      <TableCell className="font-mono text-xs font-medium">{r.return_no}</TableCell>
                      <TableCell className="font-mono text-xs">{r.purchase_order?.po_no ?? "—"}</TableCell>
                      <TableCell>{r.vendor_name}</TableCell>
                      <TableCell><Badge variant={m.variant}>{m.label}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.inventory_status}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.payable_status}</TableCell>
                      <TableCell className="text-right font-medium">NT$ {Number(r.subtotal ?? 0).toLocaleString()}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString("zh-TW")}</TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <Button size="icon" variant="ghost" onClick={() => view(r)}><Eye className="h-4 w-4" /></Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Create dialog */}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>新增進貨退回單</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>選擇採購單（已確認 / 部分到貨 / 全部到貨）</Label>
              <Select value={selectedPO} onValueChange={pickPO}>
                <SelectTrigger><SelectValue placeholder="請選擇..." /></SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  {pos.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.po_no} · {p.vendor_name} · NT$ {Number(p.total_amount).toLocaleString()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedPO && (
              <div className="border rounded p-3 space-y-2">
                <div className="text-sm font-medium">明細（勾選要退回的商品）</div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8"></TableHead>
                      <TableHead>商品</TableHead>
                      <TableHead className="text-right">單價</TableHead>
                      <TableHead className="text-right">已到貨</TableHead>
                      <TableHead className="text-right">已退</TableHead>
                      <TableHead className="text-right">可退</TableHead>
                      <TableHead className="w-24">退回數量</TableHead>
                      <TableHead className="w-32">庫存動作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {poItems.map((i) => {
                      const checked = lines.some((l) => l.purchase_order_item_id === i.id);
                      const line = lines.find((l) => l.purchase_order_item_id === i.id);
                      const remain = Math.max(0, i.received_quantity - i.returned_quantity);
                      return (
                        <TableRow key={i.id}>
                          <TableCell>
                            <Checkbox checked={checked} disabled={remain <= 0}
                                      onCheckedChange={(v) => toggleLine(i, Boolean(v))} />
                          </TableCell>
                          <TableCell>
                            <div className="font-medium">{i.product_name}</div>
                            <div className="text-xs text-muted-foreground font-mono">{i.sku}</div>
                          </TableCell>
                          <TableCell className="text-right">{Number(i.price).toLocaleString()}</TableCell>
                          <TableCell className="text-right">{i.received_quantity}</TableCell>
                          <TableCell className="text-right text-muted-foreground">{i.returned_quantity}</TableCell>
                          <TableCell className="text-right font-medium">{remain}</TableCell>
                          <TableCell>
                            {line && (
                              <Input type="number" min={1} max={line.max} value={line.quantity}
                                     onChange={(e) => updateLine(i.id, { quantity: Math.max(1, Math.min(line.max, Number(e.target.value) || 1)) })} />
                            )}
                          </TableCell>
                          <TableCell>
                            {line && (
                              <Select value={line.inventory_action}
                                      onValueChange={(v: any) => updateLine(i.id, { inventory_action: v })}>
                                <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="deduct_stock">扣庫存</SelectItem>
                                  <SelectItem value="no_stock_change">不動庫存</SelectItem>
                                </SelectContent>
                              </Select>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                <div className="text-right text-sm font-medium">退回總額：NT$ {total.toLocaleString()}</div>
              </div>
            )}

            <div className="grid gap-2">
              <Label>退回原因</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="瑕疵、品質不符..." />
            </div>
            <div className="grid gap-2">
              <Label>備註</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
            </div>

            <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 p-2 rounded">
              <AlertTriangle className="h-4 w-4" />
              套用後將扣減庫存（允許負值）並沖銷此採購單對應應付帳款。不影響會員獎勵點。
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreating(false)}>取消</Button>
            <Button onClick={submitCreate} disabled={submitting}>建立草稿</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail sheet */}
      <Sheet open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader><SheetTitle>{viewing?.return_no}</SheetTitle></SheetHeader>
          {viewing && viewData && (
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground">採購單：</span>{viewData.purchaseOrder?.po_no}</div>
                <div><span className="text-muted-foreground">廠商：</span>{viewing.vendor_name}</div>
                <div><span className="text-muted-foreground">狀態：</span><Badge variant={sMeta(viewing.status).variant}>{sMeta(viewing.status).label}</Badge></div>
                <div><span className="text-muted-foreground">金額：</span>NT$ {Number(viewing.subtotal).toLocaleString()}</div>
                <div><span className="text-muted-foreground">庫存：</span>{viewData.purchaseReturn.inventory_status}</div>
                <div><span className="text-muted-foreground">應付：</span>{viewData.purchaseReturn.payable_status}</div>
                {viewing.reason && <div className="col-span-2"><span className="text-muted-foreground">原因：</span>{viewing.reason}</div>}
                {viewData.purchaseReturn.notes && <div className="col-span-2 whitespace-pre-wrap text-xs bg-muted p-2 rounded">{viewData.purchaseReturn.notes}</div>}
              </div>

              <div>
                <div className="text-sm font-medium mb-2">明細</div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>商品</TableHead>
                      <TableHead className="text-right">數量</TableHead>
                      <TableHead className="text-right">單價</TableHead>
                      <TableHead className="text-right">小計</TableHead>
                      <TableHead>庫存動作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {viewData.items.map((i: any) => (
                      <TableRow key={i.id}>
                        <TableCell>
                          <div>{i.product_name}</div>
                          <div className="text-xs text-muted-foreground font-mono">{i.sku}</div>
                        </TableCell>
                        <TableCell className="text-right">{i.quantity}</TableCell>
                        <TableCell className="text-right">{Number(i.unit_price).toLocaleString()}</TableCell>
                        <TableCell className="text-right">{Number(i.subtotal).toLocaleString()}</TableCell>
                        <TableCell className="text-xs">{i.inventory_action === "deduct_stock" ? "扣庫存" : "不動庫存"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <div className="flex gap-2 flex-wrap pt-4 border-t">
                {viewing.status === "draft" && (
                  <>
                    <Button size="sm" onClick={() => doStatus(viewing, "submitted")}><Send className="h-3 w-3 mr-1" />送出</Button>
                    <Button size="sm" variant="destructive" onClick={() => doStatus(viewing, "cancelled")}><Ban className="h-3 w-3 mr-1" />取消</Button>
                  </>
                )}
                {viewing.status === "submitted" && (
                  <>
                    <Button size="sm" onClick={() => doApply(viewing)} disabled={applying} className="bg-gradient-primary">
                      <CheckCircle2 className="h-3 w-3 mr-1" />套用效果（扣庫存 + 沖銷應付）
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => doStatus(viewing, "draft")}>退回草稿</Button>
                    <Button size="sm" variant="destructive" onClick={() => doStatus(viewing, "cancelled")}><Ban className="h-3 w-3 mr-1" />取消</Button>
                  </>
                )}
                {viewing.status === "completed" && (
                  <div className="text-sm text-muted-foreground flex items-center gap-1">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />已完成處理
                  </div>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
