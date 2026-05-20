import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { PackageCheck, Search, Pencil, Trash2, Plus } from "lucide-react";
import { useCurrentCompany } from "@/hooks/use-current-company";

const sb: any = supabase;
const PENDING = ["submitted", "confirmed", "partial"];

interface PO { id: string; po_no: string; vendor_name: string; status: string; expected_at: string | null; total_amount: number; }
interface Item { id: string; product_id: string | null; product_name: string; sku: string; quantity: number; received_quantity: number; price: number; }
interface WH { id: string; name: string; warehouse_code: string; }
interface GR { id: string; receipt_no: string; purchase_order_id: string; warehouse_id: string | null; received_date: string; status: string; notes: string | null; po_no?: string; vendor_name?: string; warehouse_name?: string; }

function Page() {
  const { user } = useAuth();
  const { currentCompanyId } = useCurrentCompany();
  const [list, setList] = useState<PO[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [warehouses, setWarehouses] = useState<WH[]>([]);

  const [receiving, setReceiving] = useState<PO | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [receiveQty, setReceiveQty] = useState<Record<string, number>>({});
  const [warehouseId, setWarehouseId] = useState<string>("");
  const [notes, setNotes] = useState("");

  const [grList, setGrList] = useState<GR[]>([]);
  const [grLoading, setGrLoading] = useState(true);
  const [grSearch, setGrSearch] = useState("");
  const [editGr, setEditGr] = useState<GR | null>(null);
  const [editNotes, setEditNotes] = useState("");
  const [editWarehouseId, setEditWarehouseId] = useState<string>("");
  const [delGr, setDelGr] = useState<GR | null>(null);

  async function load() {
    setLoading(true);
    const { data, error } = await sb.from("purchase_orders").select("*").in("status", PENDING).order("created_at", { ascending: false });
    if (error) toast.error(error.message); else setList(data ?? []);
    const { data: w } = await sb.from("warehouses").select("id,name,warehouse_code").eq("status", "active");
    setWarehouses(w ?? []);
    if (w?.length) setWarehouseId(w[0].id);
    setLoading(false);
  }

  async function loadGR() {
    setGrLoading(true);
    const { data, error } = await sb
      .from("goods_receiving")
      .select("id, receipt_no, purchase_order_id, warehouse_id, received_date, status, notes, purchase_orders(po_no, vendor_name), warehouses(name)")
      .order("received_date", { ascending: false })
      .limit(100);
    if (error) toast.error(error.message);
    setGrList((data ?? []).map((r: any) => ({
      ...r,
      po_no: r.purchase_orders?.po_no,
      vendor_name: r.purchase_orders?.vendor_name,
      warehouse_name: r.warehouses?.name,
    })));
    setGrLoading(false);
  }

  useEffect(() => { load(); loadGR(); }, []);

  const filtered = useMemo(() => list.filter((p) =>
    !search || [p.po_no, p.vendor_name].some((x) => x?.toLowerCase().includes(search.toLowerCase()))
  ), [list, search]);

  const grFiltered = useMemo(() => grList.filter((g) =>
    !grSearch || [g.receipt_no, g.po_no, g.vendor_name].some((x) => x?.toLowerCase().includes(grSearch.toLowerCase()))
  ), [grList, grSearch]);

  async function open(po: PO) {
    setReceiving(po);
    setNotes("");
    const { data } = await sb.from("purchase_order_items").select("*").eq("purchase_order_id", po.id);
    setItems(data ?? []);
    const q: Record<string, number> = {};
    (data ?? []).forEach((i: Item) => { q[i.id] = Math.max(0, i.quantity - i.received_quantity); });
    setReceiveQty(q);
  }

  async function confirm() {
    if (!receiving || !warehouseId) return toast.error("請選擇倉庫");
    if (!currentCompanyId) return toast.error("尚未選擇公司");
    const toReceive = items.filter((i) => (receiveQty[i.id] ?? 0) > 0);
    if (toReceive.length === 0) return toast.error("請輸入進貨數量");

    const { data: rNo } = await sb.rpc("generate_receipt_no");
    const { data: gr, error: e0 } = await sb.from("goods_receiving").insert({
      receipt_no: rNo,
      purchase_order_id: receiving.id,
      warehouse_id: warehouseId,
      received_by: user?.id ?? null,
      notes: notes || null,
    }).select().single();
    if (e0) return toast.error(e0.message);

    for (const it of toReceive) {
      const qty = receiveQty[it.id];
      const newReceived = it.received_quantity + qty;
      await sb.from("purchase_order_items").update({ received_quantity: newReceived }).eq("id", it.id);

      if (it.product_id) {
        const { data: prod } = await sb.from("products").select("stock").eq("id", it.product_id).single();
        const before = prod?.stock ?? 0;
        const after = before + qty;
        await sb.from("products").update({ stock: after }).eq("id", it.product_id);

        await sb.from("inventory_transactions").insert({
          product_id: it.product_id,
          warehouse_id: warehouseId,
          type: "purchase_in",
          quantity: qty,
          before_stock: before,
          after_stock: after,
          reference_no: gr.receipt_no,
          reason: `採購入庫 ${receiving.po_no}`,
          operator_id: user?.id ?? null,
          company_id: currentCompanyId,
        });

        const { data: wi } = await sb.from("warehouse_inventory").select("id,stock").eq("warehouse_id", warehouseId).eq("product_id", it.product_id).maybeSingle();
        if (wi) {
          await sb.from("warehouse_inventory").update({ stock: wi.stock + qty }).eq("id", wi.id);
        } else {
          await sb.from("warehouse_inventory").insert({ warehouse_id: warehouseId, product_id: it.product_id, stock: qty });
        }
      }
    }

    const { data: latest } = await sb.from("purchase_order_items").select("quantity, received_quantity").eq("purchase_order_id", receiving.id);
    const allDone = (latest ?? []).every((r: any) => r.received_quantity >= r.quantity);
    const anyDone = (latest ?? []).some((r: any) => r.received_quantity > 0);
    const newStatus = allDone ? "completed" : (anyDone ? "partial" : receiving.status);
    await sb.from("purchase_orders").update({ status: newStatus }).eq("id", receiving.id);

    toast.success(`進貨完成 ${rNo}`);
    setReceiving(null); load(); loadGR();
  }

  function startEdit(g: GR) {
    setEditGr(g);
    setEditNotes(g.notes ?? "");
    setEditWarehouseId(g.warehouse_id ?? "");
  }

  async function saveEdit() {
    if (!editGr) return;
    const { error } = await sb.from("goods_receiving").update({
      notes: editNotes || null,
      warehouse_id: editWarehouseId || null,
    }).eq("id", editGr.id);
    if (error) return toast.error(error.message);
    toast.success("已更新進貨單");
    setEditGr(null); loadGR();
  }

  async function doDelete() {
    if (!delGr) return;
    const { error } = await sb.from("goods_receiving").delete().eq("id", delGr.id);
    if (error) return toast.error(error.message);
    toast.success("已刪除進貨單");
    setDelGr(null); loadGR();
  }

  async function openNewByPicker() {
    // Load all POs (not only pending) so user can pick any
    const { data } = await sb.from("purchase_orders").select("id, po_no, vendor_name, status, expected_at, total_amount").order("created_at", { ascending: false }).limit(200);
    setPickerPOs(data ?? []);
    setPickerOpen(true);
  }

  return (
    <div className="max-w-[1600px] mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><PackageCheck className="h-6 w-6 text-primary" />進貨管理</h1>
          <p className="text-sm text-muted-foreground mt-1">新增進貨單、確認到貨數量並自動更新庫存</p>
        </div>
        <Button onClick={openNewByPicker} className="bg-gradient-primary"><Plus className="h-4 w-4 mr-1" />新增進貨單</Button>
      </div>


      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">待進貨採購單</CardTitle>
          <div className="relative max-w-md mt-2">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="搜尋採購單號、供應商..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
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
              {loading ? Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}><TableCell colSpan={6}><Skeleton className="h-8 w-full" /></TableCell></TableRow>
              )) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-10">無待進貨採購單</TableCell></TableRow>
              ) : filtered.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs font-medium">{p.po_no}</TableCell>
                  <TableCell>{p.vendor_name}</TableCell>
                  <TableCell className="text-muted-foreground">{p.expected_at ?? "—"}</TableCell>
                  <TableCell><Badge variant={p.status === "partial" ? "secondary" : "outline"}>{p.status === "partial" ? "部分到貨" : p.status === "confirmed" ? "已確認" : "已送出"}</Badge></TableCell>
                  <TableCell className="text-right font-medium">NT$ {p.total_amount?.toLocaleString()}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" onClick={() => open(p)} className="bg-gradient-primary"><Plus className="h-4 w-4 mr-1" />新增進貨單</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">進貨單列表</CardTitle>
          <div className="relative max-w-md mt-2">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="搜尋進貨單號、採購單、供應商..." className="pl-9" value={grSearch} onChange={(e) => setGrSearch(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>進貨單號</TableHead><TableHead>採購單</TableHead><TableHead>供應商</TableHead>
                <TableHead>入庫倉庫</TableHead><TableHead>進貨日期</TableHead><TableHead>備註</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {grLoading ? Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}><TableCell colSpan={7}><Skeleton className="h-8 w-full" /></TableCell></TableRow>
              )) : grFiltered.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-10">尚無進貨單</TableCell></TableRow>
              ) : grFiltered.map((g) => (
                <TableRow key={g.id}>
                  <TableCell className="font-mono text-xs font-medium">{g.receipt_no}</TableCell>
                  <TableCell className="font-mono text-xs">{g.po_no ?? "—"}</TableCell>
                  <TableCell>{g.vendor_name ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{g.warehouse_name ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">{new Date(g.received_date).toLocaleDateString("zh-TW")}</TableCell>
                  <TableCell className="max-w-[240px] truncate text-muted-foreground">{g.notes ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" onClick={() => startEdit(g)} title="修改"><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => setDelGr(g)} title="刪除"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!receiving} onOpenChange={(v) => !v && setReceiving(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>新增進貨單 — {receiving?.po_no}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2 max-h-[65vh] overflow-y-auto">
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>入庫倉庫 *</Label>
                <Select value={warehouseId} onValueChange={setWarehouseId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{warehouses.map((w) => <SelectItem key={w.id} value={w.id}>{w.warehouse_code} · {w.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="border rounded-lg">
              <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead><TableHead>商品</TableHead>
                    <TableHead className="text-right">採購</TableHead>
                    <TableHead className="text-right">已到</TableHead>
                    <TableHead className="text-right">未到</TableHead>
                    <TableHead className="w-[110px]">本次進貨</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((it) => {
                    const remain = it.quantity - it.received_quantity;
                    return (
                      <TableRow key={it.id}>
                        <TableCell className="font-mono text-xs">{it.sku}</TableCell>
                        <TableCell>{it.product_name}</TableCell>
                        <TableCell className="text-right">{it.quantity}</TableCell>
                        <TableCell className="text-right">{it.received_quantity}</TableCell>
                        <TableCell className="text-right text-warning">{remain}</TableCell>
                        <TableCell>
                          <Input type="number" max={remain} min={0} value={receiveQty[it.id] ?? 0}
                            onChange={(e) => setReceiveQty({ ...receiveQty, [it.id]: Math.min(remain, Math.max(0, Number(e.target.value) || 0)) })} />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              </div>
            </div>
            <div className="space-y-2"><Label>備註</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReceiving(null)}>取消</Button>
            <Button onClick={confirm} className="bg-gradient-primary"><PackageCheck className="h-4 w-4 mr-1" />確認進貨並入庫</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editGr} onOpenChange={(v) => !v && setEditGr(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>修改進貨單 — {editGr?.receipt_no}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="text-sm text-muted-foreground">
              採購單：<span className="font-mono">{editGr?.po_no ?? "—"}</span> · 供應商：{editGr?.vendor_name ?? "—"}
            </div>
            <div className="space-y-2">
              <Label>入庫倉庫</Label>
              <Select value={editWarehouseId} onValueChange={setEditWarehouseId}>
                <SelectTrigger><SelectValue placeholder="選擇倉庫" /></SelectTrigger>
                <SelectContent>{warehouses.map((w) => <SelectItem key={w.id} value={w.id}>{w.warehouse_code} · {w.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>備註</Label>
              <Textarea rows={3} value={editNotes} onChange={(e) => setEditNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditGr(null)}>取消</Button>
            <Button onClick={saveEdit} className="bg-gradient-primary">儲存變更</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!delGr} onOpenChange={(v) => !v && setDelGr(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確定刪除進貨單 {delGr?.receipt_no}？</AlertDialogTitle>
            <AlertDialogDescription>
              此操作僅刪除進貨單紀錄，已入庫的庫存數量不會自動回沖，如需調整請另行建立庫存異動。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={doDelete} className="bg-destructive text-destructive-foreground">確定刪除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/receiving")({ component: Page });
