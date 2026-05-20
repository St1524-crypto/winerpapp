import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Boxes, AlertTriangle, Search } from "lucide-react";
import { toast } from "sonner";

const sb: any = supabase;
interface Row { id: string; sku: string; name: string; stock: number; safe_stock: number; }
interface WHRow { warehouse_id: string; product_id: string; stock: number; }
interface WH { id: string; name: string; warehouse_code: string; }

function Page() {
  const [rows, setRows] = useState<Row[]>([]);
  const [whInv, setWhInv] = useState<WHRow[]>([]);
  const [warehouses, setWarehouses] = useState<WH[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      const [{ data: p, error }, { data: wi }, { data: w }] = await Promise.all([
        sb.from("products").select("id,sku,name,stock,safe_stock").order("stock", { ascending: true }),
        sb.from("warehouse_inventory").select("warehouse_id, product_id, stock"),
        sb.from("warehouses").select("id,name,warehouse_code").eq("status", "active"),
      ]);
      if (error) toast.error(error.message);
      setRows(p ?? []); setWhInv(wi ?? []); setWarehouses(w ?? []);
      setLoading(false);
    })();
  }, []);

  const filtered = rows.filter((r) =>
    !search || [r.sku, r.name].some((x) => x.toLowerCase().includes(search.toLowerCase()))
  );
  const low = rows.filter((r) => r.stock <= r.safe_stock);

  const whStock = (productId: string, whId: string) =>
    whInv.find((x) => x.product_id === productId && x.warehouse_id === whId)?.stock ?? 0;

  return (
    <div className="max-w-[1600px] mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Boxes className="h-6 w-6 text-primary" />庫存管理</h1>
        <p className="text-sm text-muted-foreground mt-1">多倉庫即時庫存與低庫存警示</p>
      </div>

      {low.length > 0 && (
        <Card className="border-warning/40 bg-warning/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-warning"><AlertTriangle className="h-5 w-5" />低庫存警示 ({low.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {low.slice(0, 20).map((r) => (
                <Badge key={r.id} variant="outline" className="border-warning/40">
                  <span className="font-mono text-xs mr-1">{r.sku}</span>{r.name} · {r.stock}/{r.safe_stock}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="relative max-w-md">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="搜尋商品..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>SKU</TableHead><TableHead>商品</TableHead>
                <TableHead className="text-right">總庫存</TableHead>
                <TableHead className="text-right">安全庫存</TableHead>
                {warehouses.map((w) => <TableHead key={w.id} className="text-right">{w.warehouse_code}</TableHead>)}
                <TableHead>狀態</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}><TableCell colSpan={5 + warehouses.length}><Skeleton className="h-8 w-full" /></TableCell></TableRow>
              )) : filtered.map((r) => {
                const lowFlag = r.stock <= r.safe_stock;
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">{r.sku}</TableCell>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className={`text-right font-semibold ${lowFlag ? "text-warning" : ""}`}>{r.stock}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{r.safe_stock}</TableCell>
                    {warehouses.map((w) => <TableCell key={w.id} className="text-right font-mono text-sm">{whStock(r.id, w.id)}</TableCell>)}
                    <TableCell>{lowFlag ? <Badge variant="outline" className="border-warning/40 text-warning">不足</Badge> : <Badge variant="secondary">正常</Badge>}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/inventory")({ component: Page });
