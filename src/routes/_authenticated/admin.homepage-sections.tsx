import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Loader2, PackagePlus, RefreshCw, Save, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ForbiddenScreen } from "@/components/ForbiddenScreen";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth, type AppRole } from "@/hooks/use-auth";
import {
  adminListHomepageSections,
  removeHomepageSectionProduct,
  reorderHomepageSectionProducts,
  reorderHomepageSections,
  searchActiveProductsForHomepage,
  upsertHomepageSection,
  upsertHomepageSectionProduct,
} from "@/lib/homepage-sections.functions";

const ALLOWED_ROLES: AppRole[] = ["super_admin", "admin"];

const SECTION_LABELS: Record<string, string> = {
  limited_offer: "限時特惠區",
  bundle: "優惠套組區",
  featured: "主力產品區",
  best_seller: "熱賣產品區",
  new_arrival: "新上架區",
};

type HomepageSection = {
  id: string;
  section_type: string;
  title: string;
  subtitle: string | null;
  is_active: boolean;
  sort_order: number;
  display_limit: number;
  config_json?: Record<string, unknown> | null;
  products?: SectionProduct[];
};

type SectionProduct = {
  id: string;
  section_id: string;
  product_id: string;
  sort_order: number;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  config_json?: Record<string, unknown> | null;
  product?: ProductSummary | null;
};

type ProductSummary = {
  id: string;
  sku?: string | null;
  name?: string | null;
  price?: number | null;
  stock?: number | null;
  image?: string | null;
  status?: string | null;
};

export const Route = createFileRoute("/_authenticated/admin/homepage-sections")({
  component: Guard,
});

function Guard() {
  const { roles, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!roles.some((role) => ALLOWED_ROLES.includes(role))) {
    return <ForbiddenScreen requiredRoles={ALLOWED_ROLES} pageName="首頁展示區塊" />;
  }

  return <HomepageSectionsPage />;
}

function HomepageSectionsPage() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [sections, setSections] = useState<HomepageSection[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [searching, setSearching] = useState(false);
  const [products, setProducts] = useState<ProductSummary[]>([]);

  const selectedSection = useMemo(
    () => sections.find((section) => section.id === selectedId) ?? sections[0],
    [sections, selectedId],
  );

  async function loadData() {
    setLoading(true);
    try {
      const result = await adminListHomepageSections();
      const rows = (result.sections ?? []) as HomepageSection[];
      setSections(rows);
      setSelectedId((current) => current || rows[0]?.id || "");
    } catch (error: any) {
      toast.error(error?.message ?? "讀取首頁展示區塊失敗");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function saveSection(section: HomepageSection) {
    setBusy(true);
    try {
      await upsertHomepageSection({
        data: {
          id: section.id,
          section_type: section.section_type as any,
          title: section.title,
          subtitle: section.subtitle ?? "",
          is_active: section.is_active,
          sort_order: Number(section.sort_order) || 0,
          display_limit: Number(section.display_limit) || 8,
          config_json: section.config_json ?? {},
        },
      });
      toast.success("首頁區塊已儲存");
      await loadData();
    } catch (error: any) {
      toast.error(error?.message ?? "儲存首頁區塊失敗");
    } finally {
      setBusy(false);
    }
  }

  async function saveAllSectionOrder() {
    setBusy(true);
    try {
      await reorderHomepageSections({
        data: {
          items: sections.map((section) => ({
            id: section.id,
            sort_order: Number(section.sort_order) || 0,
          })),
        },
      });
      toast.success("區塊排序已更新");
      await loadData();
    } catch (error: any) {
      toast.error(error?.message ?? "更新區塊排序失敗");
    } finally {
      setBusy(false);
    }
  }

  async function searchProducts() {
    setSearching(true);
    try {
      const result = await searchActiveProductsForHomepage({
        data: { query: searchTerm, limit: 20 },
      });
      setProducts((result.products ?? []) as ProductSummary[]);
    } catch (error: any) {
      toast.error(error?.message ?? "搜尋商品失敗");
    } finally {
      setSearching(false);
    }
  }

  async function addProduct(productId: string) {
    if (!selectedSection) return;
    const nextSort = Math.max(0, ...((selectedSection.products ?? []).map((item) => Number(item.sort_order) || 0))) + 10;
    setBusy(true);
    try {
      await upsertHomepageSectionProduct({
        data: {
          section_id: selectedSection.id,
          product_id: productId,
          sort_order: nextSort,
          is_active: true,
          config_json: {},
        },
      });
      toast.success("商品已加入區塊");
      await loadData();
    } catch (error: any) {
      toast.error(error?.message ?? "加入商品失敗");
    } finally {
      setBusy(false);
    }
  }

  async function saveSectionProduct(item: SectionProduct) {
    setBusy(true);
    try {
      await upsertHomepageSectionProduct({
        data: {
          id: item.id,
          section_id: item.section_id,
          product_id: item.product_id,
          sort_order: Number(item.sort_order) || 0,
          is_active: item.is_active,
          starts_at: item.starts_at || undefined,
          ends_at: item.ends_at || undefined,
          config_json: item.config_json ?? {},
        },
      });
      toast.success("區塊商品已儲存");
      await loadData();
    } catch (error: any) {
      toast.error(error?.message ?? "儲存區塊商品失敗");
    } finally {
      setBusy(false);
    }
  }

  async function saveProductOrder() {
    if (!selectedSection) return;
    setBusy(true);
    try {
      await reorderHomepageSectionProducts({
        data: {
          sectionId: selectedSection.id,
          items: (selectedSection.products ?? []).map((item) => ({
            id: item.id,
            sort_order: Number(item.sort_order) || 0,
          })),
        },
      });
      toast.success("商品排序已更新");
      await loadData();
    } catch (error: any) {
      toast.error(error?.message ?? "更新商品排序失敗");
    } finally {
      setBusy(false);
    }
  }

  async function removeProduct(itemId: string) {
    setBusy(true);
    try {
      await removeHomepageSectionProduct({ data: { id: itemId } });
      toast.success("商品已移除");
      await loadData();
    } catch (error: any) {
      toast.error(error?.message ?? "移除商品失敗");
    } finally {
      setBusy(false);
    }
  }

  function patchSection(id: string, patch: Partial<HomepageSection>) {
    setSections((current) =>
      current.map((section) => (section.id === id ? { ...section, ...patch } : section)),
    );
  }

  function patchSectionProduct(id: string, patch: Partial<SectionProduct>) {
    setSections((current) =>
      current.map((section) => ({
        ...section,
        products: (section.products ?? []).map((item) => (item.id === id ? { ...item, ...patch } : item)),
      })),
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">首頁展示區塊</h1>
          <p className="text-muted-foreground">管理商城首頁的區塊順序、顯示數量與區塊商品。</p>
        </div>
        <Button variant="outline" onClick={loadData} disabled={busy}>
          <RefreshCw className="mr-2 h-4 w-4" />
          重新整理
        </Button>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card>
          <CardHeader>
            <CardTitle>區塊清單</CardTitle>
            <CardDescription>調整區塊名稱、啟用狀態、排序與顯示筆數。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>區塊</TableHead>
                    <TableHead>標題</TableHead>
                    <TableHead>副標</TableHead>
                    <TableHead className="w-28">排序</TableHead>
                    <TableHead className="w-28">顯示數</TableHead>
                    <TableHead className="w-24">啟用</TableHead>
                    <TableHead className="w-32">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sections.map((section) => (
                    <TableRow key={section.id} className={selectedSection?.id === section.id ? "bg-muted/50" : undefined}>
                      <TableCell>
                        <button
                          type="button"
                          className="text-left font-medium hover:text-primary"
                          onClick={() => setSelectedId(section.id)}
                        >
                          {SECTION_LABELS[section.section_type] ?? section.section_type}
                        </button>
                        <div className="mt-1">
                          <Badge variant="outline">{section.section_type}</Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Input
                          value={section.title}
                          onChange={(event) => patchSection(section.id, { title: event.target.value })}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          value={section.subtitle ?? ""}
                          onChange={(event) => patchSection(section.id, { subtitle: event.target.value })}
                          placeholder="可留空"
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={section.sort_order}
                          onChange={(event) => patchSection(section.id, { sort_order: Number(event.target.value) })}
                        />
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min={1}
                          max={48}
                          value={section.display_limit}
                          onChange={(event) => patchSection(section.id, { display_limit: Number(event.target.value) })}
                        />
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={section.is_active}
                          onCheckedChange={(checked) => patchSection(section.id, { is_active: checked })}
                        />
                      </TableCell>
                      <TableCell>
                        <Button size="sm" onClick={() => saveSection(section)} disabled={busy}>
                          <Save className="mr-2 h-4 w-4" />
                          儲存
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <Button variant="secondary" onClick={saveAllSectionOrder} disabled={busy}>
              儲存全部區塊排序
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>商品搜尋</CardTitle>
            <CardDescription>搜尋已上架商品，加入目前選取的首頁區塊。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label>目前區塊</Label>
              <select
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={selectedSection?.id ?? ""}
                onChange={(event) => setSelectedId(event.target.value)}
              >
                {sections.map((section) => (
                  <option key={section.id} value={section.id}>
                    {SECTION_LABELS[section.section_type] ?? section.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <Input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") searchProducts();
                }}
                placeholder="搜尋商品名稱或 SKU"
              />
              <Button onClick={searchProducts} disabled={searching}>
                {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              </Button>
            </div>
            <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
              {products.map((product) => (
                <div key={product.id} className="flex items-center gap-3 rounded-md border p-2">
                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded bg-muted">
                    {product.image ? (
                      <img src={product.image} alt={product.name ?? ""} className="h-full w-full object-cover" />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{product.name}</div>
                    <div className="text-xs text-muted-foreground">{product.sku || "無 SKU"}</div>
                    <div className="text-xs">NT$ {Number(product.price ?? 0).toLocaleString()}</div>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => addProduct(product.id)} disabled={!selectedSection || busy}>
                    <PackagePlus className="mr-2 h-4 w-4" />
                    加入
                  </Button>
                </div>
              ))}
              {!products.length && (
                <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                  輸入關鍵字後搜尋商品。
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {selectedSection && (
        <Card>
          <CardHeader>
            <CardTitle>{SECTION_LABELS[selectedSection.section_type] ?? selectedSection.title} 商品</CardTitle>
            <CardDescription>可調整商品排序、啟用狀態，或從此區塊移除商品。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>商品</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead className="text-right">價格</TableHead>
                    <TableHead className="w-28">排序</TableHead>
                    <TableHead className="w-24">啟用</TableHead>
                    <TableHead className="w-48">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(selectedSection.products ?? []).map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="h-12 w-12 overflow-hidden rounded bg-muted">
                            {item.product?.image ? (
                              <img src={item.product.image} alt={item.product.name ?? ""} className="h-full w-full object-cover" />
                            ) : null}
                          </div>
                          <div className="font-medium">{item.product?.name ?? "商品不存在或已下架"}</div>
                        </div>
                      </TableCell>
                      <TableCell>{item.product?.sku ?? "-"}</TableCell>
                      <TableCell className="text-right">NT$ {Number(item.product?.price ?? 0).toLocaleString()}</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={item.sort_order}
                          onChange={(event) => patchSectionProduct(item.id, { sort_order: Number(event.target.value) })}
                        />
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={item.is_active}
                          onCheckedChange={(checked) => patchSectionProduct(item.id, { is_active: checked })}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button size="sm" variant="secondary" onClick={() => saveSectionProduct(item)} disabled={busy}>
                            儲存
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => removeProduct(item.id)} disabled={busy}>
                            <Trash2 className="mr-2 h-4 w-4" />
                            移除
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!(selectedSection.products ?? []).length && (
                    <TableRow>
                      <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                        此區塊尚未加入商品。
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            <Button variant="secondary" onClick={saveProductOrder} disabled={busy || !(selectedSection.products ?? []).length}>
              儲存商品排序
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
