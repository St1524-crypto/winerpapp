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
import { ArrowRightLeft, Plus, Search, ArrowDown, ArrowUp, RefreshCcw } from "lucide-react";
import { useCurrentCompany } from "@/hooks/use-current-company";

const sb: any = supabase;

const TYPE_META: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline"; }> = {
  purchase_in: { label: "採購入庫", variant: "default" },
  manual_in: { label: "手動入庫", variant: "default" },
  manual_out: { label: "手動出庫", variant: "secondary" },
  order_out: { label: "訂單出貨", variant: "secondary" },
  adjust: { label: "庫存調整", variant: "outline" },
  return_in: { label: "退貨入庫", variant: "default" },
};

interface Tx {
  id: string; product_id: string | null; warehouse_id: string | null;
  type: string; quantity: number; before_stock: number; after_stock: number;
  reference_no: string | null; reason: string | null; created_at: string;
}
interface Product { id: string; sku: string; name: string; stock: number; }
interface WH { id: string; warehouse_code: string; name: string; }

function Page() {
  const { user } = useAuth();
  const { currentCompanyId } = useCurrentCompany();
  const [list, setList] = useState<Tx[]>([]);
  const [prodMap, setProdMap] = useState<Record<string, Product>>({});
  const [whMap, setWhMap] = useState<Record<string, WH>>({});
  const [products, setProducts] = useState<Product[]>([]);
  const [warehouses, setWarehouses] = useState<WH[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ product_id: "", warehouse_id: "", type: "manual_in", quantity: 1, reason: "" });

  async function load() {
    setLoading(true);
    const [{ data: tx }, { data: p }, { data: w }] = await Promise.all([
      sb.from("inventory_transactions").select("*").order("created_at", { ascending: false }).limit(200),
      sb.from("products").select("id,sku,name,stock"),
      sb.from("warehouses").select("id,warehouse_code,name"),
    ]);
    setList(tx ?? []);
    const pm: Record<string, Product> = {}; (p ?? []).forEach((x: Product) => pm[x.id] = x); setProdMap(pm); setProducts(p ?? []);
    const wm: Record<string, WH> = {}; (w ?? []).forEach((x: WH) => wm[x.id] = x); setWhMap(wm); setWarehouses(w ?? []);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => list.filter((t) => {
    if (typeFilter !== "all" && t.type !== typeFilter) return false;
    if (search) {
      const p = t.product_id ? prodMap[t.product_id] : null;
      const hay = [t.reference_no, t.reason, p?.sku, p?.name].join(" ").toLowerCase();
      if (!hay.includes(search.toLowerCase())) return false;
    }
    return true;
  }), [list, typeFilter, search, prodMap]);

  async function save() {
    if (!form.product_id || !form.warehouse_id || form.quantity === 0) return toast.error("請完整填寫");
    const prod = prodMap[form.product_id];
    const before = prod?.stock ?? 0;
    const isOut = form.type === "manual_out" || form.type === "order_out";
    const delta = isOut ? -Math.abs(form.quantity) : Math.abs(form.quantity);
    const after = before + delta;
    if (after < 0) return toast.error("庫存不足");

    await sb.from("products").update({ stock: after }).eq("id", form.product_id);
    await sb.from("inventory_transactions").insert({
      product_id: form.product_id,
      warehouse_id: form.warehouse_id,
      type: form.type,
      quantity: Math.abs(form.quantity),
      before_stock: before,
      after_stock: after,
      reason: form.reason || null,
      operator_id: user?.id ?? null,
    });
    const { data: wi } = await sb.from("warehouse_inventory").select("id,stock").eq("warehouse_id", form.warehouse_id).eq("product_id", form.product_id).maybeSingle();
    if (wi) await sb.from("warehouse_inventory").update({ stock: Math.max(0, wi.stock + delta) }).eq("id", wi.id);
    else if (!isOut) await sb.from("warehouse_inventory").insert({ warehouse_id: form.warehouse_id, product_id: form.product_id, stock: Math.abs(form.quantity) });

    toast.success("已寫入");
    setOpen(false); setForm({ product_id: "", warehouse_id: "", type: "manual_in", quantity: 1, reason: "" });
    load();
  }

  return (
    <div className="max-w-[1600px] mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><ArrowRightLeft className="h-6 w-6 text-primary" />庫存異動</h1>
          <p className="text-sm text-muted-foreground mt-1">完整紀錄所有庫存進出</p>
        </div>
        <Button onClick={() => setOpen(true)} className="bg-gradient-primary"><Plus className="h-4 w-4 mr-1" />手動異動</Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="搜尋商品、單據編號、原因..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部類型</SelectItem>
                {Object.entries(TYPE_META).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>時間</TableHead><TableHead>類型</TableHead><TableHead>商品</TableHead>
                <TableHead>倉庫</TableHead><TableHead className="text-right">數量</TableHead>
                <TableHead className="text-right">前→後</TableHead><TableHead>單據</TableHead><TableHead>原因</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}><TableCell colSpan={8}><Skeleton className="h-8 w-full" /></TableCell></TableRow>
              )) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-10">尚無異動紀錄</TableCell></TableRow>
              ) : filtered.map((t) => {
                const m = TYPE_META[t.type] ?? { label: t.type, variant: "outline" as const };
                const p = t.product_id ? prodMap[t.product_id] : null;
                const w = t.warehouse_id ? whMap[t.warehouse_id] : null;
                const isOut = t.type.includes("out");
                const Icon = isOut ? ArrowUp : t.type === "adjust" ? RefreshCcw : ArrowDown;
                return (
                  <TableRow key={t.id}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{new Date(t.created_at).toLocaleString("zh-TW")}</TableCell>
                    <TableCell><Badge variant={m.variant} className="gap-1"><Icon className="h-3 w-3" />{m.label}</Badge></TableCell>
                    <TableCell>{p ? <><span className="font-mono text-xs text-muted-foreground">{p.sku}</span> {p.name}</> : "—"}</TableCell>
                    <TableCell className="text-xs">{w ? `${w.warehouse_code}` : "—"}</TableCell>
                    <TableCell className={`text-right font-medium ${isOut ? "text-destructive" : "text-success"}`}>{isOut ? "-" : "+"}{t.quantity}</TableCell>
                    <TableCell className="text-right font-mono text-xs text-muted-foreground">{t.before_stock} → {t.after_stock}</TableCell>
                    <TableCell className="font-mono text-xs">{t.reference_no ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{t.reason ?? "—"}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>新增庫存異動</DialogTitle></DialogHeader>
          <div className="grid sm:grid-cols-2 gap-4 py-2">
            <div className="space-y-2 sm:col-span-2"><Label>商品</Label>
              <Select value={form.product_id} onValueChange={(v) => setForm({ ...form, product_id: v })}>
                <SelectTrigger><SelectValue placeholder="選擇商品" /></SelectTrigger>
                <SelectContent>{products.map((p) => <SelectItem key={p.id} value={p.id}>{p.sku} · {p.name}（現存 {p.stock}）</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>倉庫</Label>
              <Select value={form.warehouse_id} onValueChange={(v) => setForm({ ...form, warehouse_id: v })}>
                <SelectTrigger><SelectValue placeholder="選擇倉庫" /></SelectTrigger>
                <SelectContent>{warehouses.map((w) => <SelectItem key={w.id} value={w.id}>{w.warehouse_code} · {w.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-2"><Label>類型</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TYPE_META).filter(([k]) => k !== "purchase_in" && k !== "order_out").map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 sm:col-span-2"><Label>數量</Label><Input type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) || 0 })} /></div>
            <div className="space-y-2 sm:col-span-2"><Label>原因</Label><Textarea rows={2} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>取消</Button>
            <Button onClick={save} className="bg-gradient-primary">寫入異動</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/inventory-tx")({ component: Page });
