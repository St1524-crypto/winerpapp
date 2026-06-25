import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Plus, Search, Trash2, Sparkles } from "lucide-react";
import {
  adminAddHomepageFeatured,
  adminListHomepageFeatured,
  adminRemoveHomepageFeatured,
  adminReorderHomepageFeatured,
  adminSearchProductsForFeature,
  adminToggleHomepageFeatured,
} from "@/lib/homepage-featured.functions";

export const Route = createFileRoute("/_authenticated/admin/homepage-featured")({
  component: HomepageFeaturedAdmin,
});

function HomepageFeaturedAdmin() {
  const list = useServerFn(adminListHomepageFeatured);
  const search = useServerFn(adminSearchProductsForFeature);
  const addFn = useServerFn(adminAddHomepageFeatured);
  const remove = useServerFn(adminRemoveHomepageFeatured);
  const toggle = useServerFn(adminToggleHomepageFeatured);
  const reorder = useServerFn(adminReorderHomepageFeatured);

  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  async function refresh() {
    setLoading(true);
    const r = await list({});
    if (r.ok) setItems(r.items);
    else toast.error(r.error || "讀取失敗");
    setLoading(false);
  }

  useEffect(() => { refresh(); }, []);

  async function doSearch() {
    setSearching(true);
    const r = await search({ data: { search: query || undefined } });
    if (r.ok) setResults(r.items);
    else toast.error(r.error || "搜尋失敗");
    setSearching(false);
  }

  async function handleAdd(product_id: string) {
    const r = await addFn({ data: { product_id } });
    if (r.ok) { toast.success("已加入精品推薦"); refresh(); }
    else toast.error(r.error || "加入失敗");
  }

  async function handleRemove(id: string) {
    if (!confirm("確定移除？")) return;
    const r = await remove({ data: { id } });
    if (r.ok) { toast.success("已移除"); refresh(); }
    else toast.error(r.error || "移除失敗");
  }

  async function handleToggle(id: string, is_active: boolean) {
    const r = await toggle({ data: { id, is_active } });
    if (r.ok) refresh();
    else toast.error(r.error || "更新失敗");
  }

  async function move(idx: number, dir: -1 | 1) {
    const target = idx + dir;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[idx], next[target]] = [next[target], next[idx]];
    setItems(next);
    const orders = next.map((it, i) => ({ id: it.id, sort_order: i }));
    const r = await reorder({ data: { orders } });
    if (!r.ok) { toast.error(r.error || "排序失敗"); refresh(); }
  }

  const existingIds = new Set(items.map((i) => i.product_id));

  return (
    <div className="container mx-auto p-4 lg:p-6 space-y-6">
      <div className="flex items-center gap-2">
        <Sparkles className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">精品推薦管理</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        從已上架商品中選入「精品推薦」並調整排序。會顯示於 /shop 首頁精選區。
      </p>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">搜尋並加入商品</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="輸入商品名稱或 SKU…"
              onKeyDown={(e) => e.key === "Enter" && doSearch()}
            />
            <Button onClick={doSearch} disabled={searching}>
              <Search className="h-4 w-4 mr-1" /> 搜尋
            </Button>
          </div>
          {results.length > 0 && (
            <div className="border rounded-md divide-y max-h-80 overflow-auto">
              {results.map((p) => (
                <div key={p.id} className="flex items-center gap-3 p-2">
                  <img src={p.image || "/placeholder.svg"} alt={p.name} className="h-10 w-10 rounded object-cover bg-muted" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{p.name}</div>
                    <div className="text-xs text-muted-foreground">{p.sku} · NT$ {p.price}</div>
                  </div>
                  <Button
                    size="sm"
                    variant={existingIds.has(p.id) ? "secondary" : "default"}
                    disabled={existingIds.has(p.id)}
                    onClick={() => handleAdd(p.id)}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    {existingIds.has(p.id) ? "已加入" : "加入"}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">目前精品推薦（{items.length}）</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm text-muted-foreground">載入中…</div>
          ) : items.length === 0 ? (
            <div className="text-sm text-muted-foreground">尚未加入任何商品。</div>
          ) : (
            <div className="divide-y border rounded-md">
              {items.map((it, idx) => (
                <div key={it.id} className="flex items-center gap-3 p-2">
                  <div className="flex flex-col">
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => move(idx, -1)} disabled={idx === 0}>
                      <ArrowUp className="h-3 w-3" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => move(idx, 1)} disabled={idx === items.length - 1}>
                      <ArrowDown className="h-3 w-3" />
                    </Button>
                  </div>
                  <div className="text-xs text-muted-foreground w-6 text-center">{idx + 1}</div>
                  <img
                    src={it.product?.image || "/placeholder.svg"}
                    alt={it.product?.name || ""}
                    className="h-12 w-12 rounded object-cover bg-muted"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">
                      {it.product?.name || <span className="text-destructive">（商品不存在）</span>}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {it.product?.sku} {it.product?.price != null && `· NT$ ${it.product.price}`}
                      {it.product?.status && it.product.status !== "active" && (
                        <Badge variant="destructive" className="ml-2">{it.product.status}</Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">啟用</span>
                    <Switch checked={!!it.is_active} onCheckedChange={(v) => handleToggle(it.id, v)} />
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => handleRemove(it.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
