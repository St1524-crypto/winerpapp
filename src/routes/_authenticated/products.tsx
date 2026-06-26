import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Plus, Search, Pencil, Trash2, Eye, Boxes, Package,
  ArrowUpDown, ChevronLeft, ChevronRight, Image as ImageIcon, Flame, FileDown,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useCategories, useProducts } from "@/hooks/use-products";
import { ProductFormDialog } from "@/components/products/ProductFormDialog";
import { InventoryDialog } from "@/components/products/InventoryDialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Product } from "@/types/product";
import { PRODUCT_STATUS } from "@/types/product";
import { exportPdfReport } from "@/lib/pdf-report";
import { useBranding } from "@/hooks/use-branding";

export const Route = createFileRoute("/_authenticated/products")({ component: ProductsPage });

const PAGE_SIZE = 10;

function ProductsPage() {
  const { categories } = useCategories();
  const { logoUrl } = useBranding();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<{ col: keyof Product; dir: "asc" | "desc" }>({ col: "updated_at", dir: "desc" });
  const [editing, setEditing] = useState<Product | null>(null);
  const [open, setOpen] = useState(false);
  const [invProduct, setInvProduct] = useState<Product | null>(null);
  const [delProduct, setDelProduct] = useState<Product | null>(null);

  const filters = useMemo(() => ({
    search: search.trim() || undefined,
    categoryId: category === "all" ? null : category,
    status: status === "all" ? null : status,
    sort, page, pageSize: PAGE_SIZE,
  }), [search, category, status, sort, page]);

  const { data, count, loading, refresh } = useProducts(filters);
  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE));

  function toggleSort(col: keyof Product) {
    setSort((s) => s.col === col ? { col, dir: s.dir === "asc" ? "desc" : "asc" } : { col, dir: "asc" });
  }

  async function confirmDelete() {
    if (!delProduct) return;
    const { error } = await supabase.from("products").delete().eq("id", delProduct.id);
    if (error) toast.error(error.message);
    else { toast.success("已刪除"); refresh(); }
    setDelProduct(null);
  }

  async function savePriority(p: Product, value: number) {
    const next = Math.floor(Number(value) || 0);
    if (next === Number((p as any).display_priority ?? 0)) return;
    const { error } = await supabase.from("products").update({ display_priority: next } as any).eq("id", p.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`已更新「${p.name}」優先順位 = ${next}`);
    refresh();
  }

  async function exportPdf() {
    try {
      await exportPdfReport({
        title: "商品列表報表", subtitle: `總計 ${count} 件商品`, logoUrl,
        meta: { 篩選: category === "all" ? "全部分類" : (categories.find((c) => c.id === category)?.name ?? ""), 狀態: status, 關鍵字: search || "—" },
        columns: [
          { key: "sku", label: "SKU" },
          { key: "name", label: "商品名稱" },
          { key: "category", label: "分類" },
          { key: "price", label: "售價", align: "right", format: (v) => `NT$ ${Number(v).toLocaleString()}` },
          { key: "stock", label: "庫存", align: "right" },
          { key: "status", label: "狀態", align: "right" },
        ],
        rows: data, filename: `products-${Date.now()}.pdf`,
      });
      toast.success("PDF 已產生");
    } catch (e: any) { toast.error(e.message); }
  }

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Package className="h-6 w-6 text-primary" />商品管理</h1>
          <p className="text-sm text-muted-foreground mt-1">管理商品 SKU、分類、價格、庫存與圖片</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={exportPdf}><FileDown className="h-4 w-4 mr-2" />匯出 PDF</Button>
          <Button asChild variant="secondary"><Link to="/categories"><Boxes className="h-4 w-4 mr-2" />分類管理</Link></Button>
          <Button className="bg-gradient-primary" onClick={() => { setEditing(null); setOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" />新增商品
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="relative md:col-span-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="搜尋商品名稱或 SKU…"
                value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
            </div>
            <Select value={category} onValueChange={(v) => { setCategory(v); setPage(1); }}>
              <SelectTrigger><SelectValue placeholder="分類" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部分類</SelectItem>
                {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
              <SelectTrigger><SelectValue placeholder="狀態" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部狀態</SelectItem>
                {PRODUCT_STATUS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-lg border border-border overflow-hidden">
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="w-16">圖片</TableHead>
                  <TableHead className="cursor-pointer" onClick={() => toggleSort("sku")}>SKU <ArrowUpDown className="inline h-3 w-3 ml-1" /></TableHead>
                  <TableHead className="cursor-pointer" onClick={() => toggleSort("name")}>商品名稱 <ArrowUpDown className="inline h-3 w-3 ml-1" /></TableHead>
                  <TableHead>分類</TableHead>
                  <TableHead className="text-right cursor-pointer" onClick={() => toggleSort("price")}>售價</TableHead>
                  <TableHead className="text-right">成本</TableHead>
                  <TableHead className="text-right cursor-pointer" onClick={() => toggleSort("stock")}>庫存</TableHead>
                  <TableHead>狀態</TableHead>
                  <TableHead className="w-24 text-right" title="數字越大越前面顯示">優先順位</TableHead>
                  <TableHead className="cursor-pointer" onClick={() => toggleSort("updated_at" as keyof Product)}>最後編輯 <ArrowUpDown className="inline h-3 w-3 ml-1" /></TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  [...Array(5)].map((_, i) => (
                    <TableRow key={i}>
                      {[...Array(11)].map((_, j) => <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>)}
                    </TableRow>
                  ))
                ) : data.length === 0 ? (
                  <TableRow><TableCell colSpan={11} className="text-center py-12">
                    <Package className="h-10 w-10 mx-auto text-muted-foreground/40" />
                    <p className="text-sm text-muted-foreground mt-3">沒有符合條件的商品</p>
                  </TableCell></TableRow>
                ) : data.map((p) => {
                  const low = p.stock <= p.safe_stock;
                  return (
                    <TableRow key={p.id} className="hover:bg-muted/30">
                      <TableCell>
                        <div className="h-10 w-10 rounded-md bg-muted overflow-hidden flex items-center justify-center">
                          {p.image ? <img src={p.image} alt={p.name} className="h-full w-full object-cover" /> : <ImageIcon className="h-4 w-4 text-muted-foreground" />}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-1.5">
                          {p.featured && <Flame className="h-3.5 w-3.5 text-warning" />}
                          {p.name}
                        </div>
                      </TableCell>
                      <TableCell><Badge variant="outline">{p.category ?? "—"}</Badge></TableCell>
                      <TableCell className="text-right font-medium">NT$ {Number(p.price).toLocaleString()}</TableCell>
                      <TableCell className="text-right text-muted-foreground">NT$ {Number(p.cost_price).toLocaleString()}</TableCell>
                      <TableCell className={`text-right font-medium ${low ? "text-destructive" : ""}`}>{p.stock}</TableCell>
                      <TableCell>
                        <Badge variant={p.status === "active" ? "default" : p.status === "draft" ? "secondary" : "outline"}>
                          {PRODUCT_STATUS.find((s) => s.value === p.status)?.label ?? p.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          defaultValue={Number((p as any).display_priority ?? 0)}
                          onBlur={(e) => savePriority(p, +e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                          className="h-8 w-20 text-right ml-auto"
                          title="數字越大越前面顯示。按 Enter 或離開欄位即儲存。"
                        />
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date((p as any).updated_at ?? p.created_at).toLocaleString()}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button asChild size="icon" variant="ghost" className="h-8 w-8" title="查看">
                            <Link to="/products/$productId" params={{ productId: p.id }}><Eye className="h-4 w-4" /></Link>
                          </Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8" title="庫存異動" onClick={() => setInvProduct(p)}><Boxes className="h-4 w-4" /></Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8" title="編輯" onClick={() => { setEditing(p); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" title="刪除" onClick={() => setDelProduct(p)}><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            </div>
          </div>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <div>共 <span className="font-medium text-foreground">{count}</span> 筆，第 {page} / {totalPages} 頁</div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
              <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <ProductFormDialog open={open} onOpenChange={setOpen} product={editing} categories={categories} onSaved={refresh} />
      <InventoryDialog open={!!invProduct} onOpenChange={(v) => !v && setInvProduct(null)} product={invProduct} onDone={refresh} />

      <AlertDialog open={!!delProduct} onOpenChange={(v) => !v && setDelProduct(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認刪除？</AlertDialogTitle>
            <AlertDialogDescription>商品「{delProduct?.name}」將被永久刪除，此操作無法復原。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground">刪除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
