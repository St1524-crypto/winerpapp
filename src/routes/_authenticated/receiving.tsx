import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { PackageCheck, Search } from "lucide-react";
import { useCurrentCompany } from "@/hooks/use-current-company";

const sb: any = supabase;
const PENDING = ["submitted", "confirmed", "partial"];

interface PO { id: string; po_no: string; vendor_name: string; status: string; expected_at: string | null; total_amount: number; }
interface Item { id: string; product_id: string | null; product_name: string; sku: string; quantity: number; received_quantity: number; price: number; }
interface WH { id: string; name: string; warehouse_code: string; }

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

  async function load() {
    setLoading(true);
    const { data, error } = await sb.from("purchase_orders").select("*").in("status", PENDING).order("created_at", { ascending: false });
    if (error) toast.error(error.message); else setList(data ?? []);
    const { data: w } = await sb.from("warehouses").select("id,name,warehouse_code").eq("status", "active");
    setWarehouses(w ?? []);
    if (w?.length) setWarehouseId(w[0].id);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => list.filter((p) =>
    !search || [p.po_no, p.vendor_name].some((x) => x?.toLowerCase().includes(search.toLowerCase()))
  ), [list, search]);

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
    if (toReceive.length === 0) return toast.error("請輸入收貨數量");

    // 1. 建立收貨單
    const { data: rNo } = await sb.rpc("generate_receipt_no");
    const { data: gr, error: e0 } = await sb.from("goods_receiving").insert({
      receipt_no: rNo,
      purchase_order_id: receiving.id,
      warehouse_id: warehouseId,
      received_by: user?.id ?? null,
      notes: notes || null,
    }).select().single();
    if (e0) return toast.error(e0.message);

    // 2. 更新明細已到貨數量；3. 更新商品庫存；4. 寫入庫存異動；5. 更新倉庫庫存
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

        // upsert warehouse_inventory
        const { data: wi } = await sb.from("warehouse_inventory").select("id,stock").eq("warehouse_id", warehouseId).eq("product_id", it.product_id).maybeSingle();
        if (wi) {
          await sb.from("warehouse_inventory").update({ stock: wi.stock + qty }).eq("id", wi.id);
        } else {
          await sb.from("warehouse_inventory").insert({ warehouse_id: warehouseId, product_id: it.product_id, stock: qty });
        }
      }
    }

    // 6. 更新 PO 狀態
    const { data: latest } = await sb.from("purchase_order_items").select("quantity, received_quantity").eq("purchase_order_id", receiving.id);
    const allDone = (latest ?? []).every((r: any) => r.received_quantity >= r.quantity);
    const anyDone = (latest ?? []).some((r: any) => r.received_quantity > 0);
    const newStatus = allDone ? "completed" : (anyDone ? "partial" : receiving.status);
    await sb.from("purchase_orders").update({ status: newStatus }).eq("id", receiving.id);

    toast.success(`收貨完成 ${rNo}`);
    setReceiving(null); load();
  }

  return (
    <div className="max-w-[1600px] mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><PackageCheck className="h-6 w-6 text-primary" />收貨管理</h1>
        <p className="text-sm text-muted-foreground mt-1">確認到貨數量並自動更新庫存</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="relative max-w-md">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="搜尋採購單號、供應商..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent>
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
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-10">無待收貨採購單</TableCell></TableRow>
              ) : filtered.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-xs font-medium">{p.po_no}</TableCell>
                  <TableCell>{p.vendor_name}</TableCell>
                  <TableCell className="text-muted-foreground">{p.expected_at ?? "—"}</TableCell>
                  <TableCell><Badge variant={p.status === "partial" ? "secondary" : "outline"}>{p.status === "partial" ? "部分到貨" : p.status === "confirmed" ? "已確認" : "已送出"}</Badge></TableCell>
                  <TableCell className="text-right font-medium">NT$ {p.total_amount?.toLocaleString()}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" onClick={() => open(p)} className="bg-gradient-primary"><PackageCheck className="h-4 w-4 mr-1" />收貨</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!receiving} onOpenChange={(v) => !v && setReceiving(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><DialogTitle>收貨 — {receiving?.po_no}</DialogTitle></DialogHeader>
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
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead><TableHead>商品</TableHead>
                    <TableHead className="text-right">採購</TableHead>
                    <TableHead className="text-right">已到</TableHead>
                    <TableHead className="text-right">未到</TableHead>
                    <TableHead className="w-[110px]">本次收貨</TableHead>
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
            <div className="space-y-2"><Label>備註</Label><Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReceiving(null)}>取消</Button>
            <Button onClick={confirm} className="bg-gradient-primary"><PackageCheck className="h-4 w-4 mr-1" />確認收貨並入庫</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/receiving")({ component: Page });
