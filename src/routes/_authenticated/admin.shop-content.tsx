import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { FileText, Loader2, Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ForbiddenScreen } from "@/components/ForbiddenScreen";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useAuth, type AppRole } from "@/hooks/use-auth";
import {
  adminListShopContentPages,
  deleteShopContentPage,
  reorderShopContentPages,
  upsertShopContentPage,
} from "@/lib/shop-content.functions";

const ALLOWED_ROLES: AppRole[] = ["super_admin", "admin"];

const SECTION_LABELS: Record<ShopContentSection, string> = {
  wholesale: "批發專區",
  patent: "專利檢驗區",
  news: "最新消息",
  health: "健康學術",
};

const SECTION_OPTIONS = Object.entries(SECTION_LABELS) as Array<[ShopContentSection, string]>;

type ShopContentSection = "wholesale" | "patent" | "news" | "health";

type ShopContentPage = {
  id: string;
  section_type: ShopContentSection;
  title: string;
  slug: string;
  summary: string | null;
  cover_image: string | null;
  images?: string[] | null;
  content_json?: Record<string, unknown> | null;
  content_html: string | null;
  external_url: string | null;
  sort_order: number;
  is_published: boolean;
  published_at: string | null;
  updated_at: string;
};

const EMPTY_FORM: Omit<ShopContentPage, "id" | "published_at" | "updated_at"> = {
  section_type: "news",
  title: "",
  slug: "",
  summary: "",
  cover_image: "",
  images: [],
  content_json: {},
  content_html: "",
  external_url: "",
  sort_order: 100,
  is_published: false,
};

export const Route = createFileRoute("/_authenticated/admin/shop-content")({
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
    return <ForbiddenScreen requiredRoles={ALLOWED_ROLES} pageName="商城內容管理" />;
  }

  return <ShopContentAdminPage />;
}

function ShopContentAdminPage() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pages, setPages] = useState<ShopContentPage[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [sectionFilter, setSectionFilter] = useState<"all" | ShopContentSection>("all");
  const [form, setForm] = useState(EMPTY_FORM);

  const filteredPages = useMemo(
    () => pages.filter((page) => sectionFilter === "all" || page.section_type === sectionFilter),
    [pages, sectionFilter],
  );

  async function loadPages() {
    setLoading(true);
    try {
      const result = await adminListShopContentPages();
      const rows = (result.pages ?? []) as ShopContentPage[];
      setPages(rows);
      if (selectedId) {
        const selected = rows.find((page) => page.id === selectedId);
        if (selected) setFormFromPage(selected);
      }
    } catch (error: any) {
      toast.error(error?.message ?? "讀取商城內容失敗");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPages();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setFormFromPage(page: ShopContentPage) {
    setSelectedId(page.id);
    setForm({
      section_type: page.section_type,
      title: page.title,
      slug: page.slug,
      summary: page.summary ?? "",
      cover_image: page.cover_image ?? "",
      content_json: page.content_json ?? {},
      content_html: page.content_html ?? "",
      external_url: page.external_url ?? "",
      sort_order: Number(page.sort_order) || 0,
      is_published: !!page.is_published,
    });
  }

  function newPage(sectionType: ShopContentSection = "news") {
    setSelectedId("");
    setForm({ ...EMPTY_FORM, section_type: sectionType });
  }

  function slugify(value: string) {
    return value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .replace(/[\u4e00-\u9fa5]/g, "")
      .slice(0, 80);
  }

  async function savePage() {
    setBusy(true);
    try {
      const slug = form.slug.trim() || slugify(form.title) || `${form.section_type}-${Date.now()}`;
      await upsertShopContentPage({
        data: {
          id: selectedId || undefined,
          section_type: form.section_type,
          title: form.title,
          slug,
          summary: form.summary || null,
          cover_image: form.cover_image || null,
          content_json: form.content_json ?? {},
          content_html: form.content_html || null,
          external_url: form.external_url || null,
          sort_order: Number(form.sort_order) || 0,
          is_published: form.is_published,
        },
      });
      toast.success("商城內容已儲存");
      setForm((current) => ({ ...current, slug }));
      await loadPages();
    } catch (error: any) {
      toast.error(error?.message ?? "儲存商城內容失敗");
    } finally {
      setBusy(false);
    }
  }

  async function deletePage(id: string) {
    if (!window.confirm("確定刪除此內容？此操作無法復原。")) return;
    setBusy(true);
    try {
      await deleteShopContentPage({ data: { id } });
      toast.success("商城內容已刪除");
      if (selectedId === id) newPage();
      await loadPages();
    } catch (error: any) {
      toast.error(error?.message ?? "刪除商城內容失敗");
    } finally {
      setBusy(false);
    }
  }

  async function saveSortOrder() {
    setBusy(true);
    try {
      await reorderShopContentPages({
        data: {
          items: pages.map((page) => ({
            id: page.id,
            sort_order: Number(page.sort_order) || 0,
          })),
        },
      });
      toast.success("排序已更新");
      await loadPages();
    } catch (error: any) {
      toast.error(error?.message ?? "更新排序失敗");
    } finally {
      setBusy(false);
    }
  }

  function patchPage(id: string, patch: Partial<ShopContentPage>) {
    setPages((current) =>
      current.map((page) => (page.id === id ? { ...page, ...patch } : page)),
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
          <h1 className="text-2xl font-bold">商城內容管理</h1>
          <p className="text-muted-foreground">管理批發專區、專利檢驗區、最新消息與健康學術內容。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={loadPages} disabled={busy}>
            <RefreshCw className="mr-2 h-4 w-4" />
            重新整理
          </Button>
          <Button onClick={() => newPage(sectionFilter === "all" ? "news" : sectionFilter)} disabled={busy}>
            <Plus className="mr-2 h-4 w-4" />
            新增內容
          </Button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Card>
          <CardHeader>
            <CardTitle>內容清單</CardTitle>
            <CardDescription>可篩選分類、調整排序與發布狀態。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant={sectionFilter === "all" ? "default" : "outline"}
                onClick={() => setSectionFilter("all")}
              >
                全部
              </Button>
              {SECTION_OPTIONS.map(([value, label]) => (
                <Button
                  key={value}
                  type="button"
                  variant={sectionFilter === value ? "default" : "outline"}
                  onClick={() => setSectionFilter(value)}
                >
                  {label}
                </Button>
              ))}
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>分類</TableHead>
                    <TableHead>標題</TableHead>
                    <TableHead>Slug</TableHead>
                    <TableHead className="w-24">排序</TableHead>
                    <TableHead className="w-24">狀態</TableHead>
                    <TableHead className="w-36">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPages.map((page) => (
                    <TableRow key={page.id} className={selectedId === page.id ? "bg-muted/50" : undefined}>
                      <TableCell>
                        <Badge variant="outline">{SECTION_LABELS[page.section_type]}</Badge>
                      </TableCell>
                      <TableCell>
                        <button
                          type="button"
                          className="max-w-[240px] truncate text-left font-medium hover:text-primary"
                          onClick={() => setFormFromPage(page)}
                        >
                          {page.title}
                        </button>
                        {page.summary && <div className="mt-1 max-w-[320px] truncate text-xs text-muted-foreground">{page.summary}</div>}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{page.slug}</TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          value={page.sort_order}
                          onChange={(event) => patchPage(page.id, { sort_order: Number(event.target.value) || 0 })}
                          className="h-8"
                        />
                      </TableCell>
                      <TableCell>
                        {page.is_published ? (
                          <Badge className="bg-emerald-500/15 text-emerald-600 border border-emerald-500/30">已發布</Badge>
                        ) : (
                          <Badge variant="secondary">草稿</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" onClick={() => setFormFromPage(page)}>編輯</Button>
                          <Button size="icon" variant="ghost" onClick={() => deletePage(page.id)} disabled={busy}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <Button variant="outline" onClick={saveSortOrder} disabled={busy || pages.length === 0}>
              <Save className="mr-2 h-4 w-4" />
              儲存排序
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              {selectedId ? "編輯內容" : "新增內容"}
            </CardTitle>
            <CardDescription>發布後會供前台內容區讀取；草稿不會公開顯示。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>分類</Label>
                <Select
                  value={form.section_type}
                  onValueChange={(value) => setForm((current) => ({ ...current, section_type: value as ShopContentSection }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SECTION_OPTIONS.map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>排序</Label>
                <Input
                  type="number"
                  value={form.sort_order}
                  onChange={(event) => setForm((current) => ({ ...current, sort_order: Number(event.target.value) || 0 }))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>標題</Label>
              <Input
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                placeholder="例如：源晶專利檢驗報告"
              />
            </div>

            <div className="space-y-1.5">
              <Label>網址代稱 slug</Label>
              <Input
                value={form.slug}
                onChange={(event) => setForm((current) => ({ ...current, slug: event.target.value.toLowerCase() }))}
                placeholder="例如：patent-report-2026"
              />
              <p className="text-xs text-muted-foreground">3-80 字元，可含小寫英文、數字與 -；留空會依標題嘗試產生。</p>
            </div>

            <div className="space-y-1.5">
              <Label>摘要</Label>
              <Textarea
                rows={3}
                value={form.summary ?? ""}
                onChange={(event) => setForm((current) => ({ ...current, summary: event.target.value }))}
                placeholder="簡短描述內容重點"
              />
            </div>

            <div className="space-y-1.5">
              <Label>封面圖片 URL</Label>
              <Input
                value={form.cover_image ?? ""}
                onChange={(event) => setForm((current) => ({ ...current, cover_image: event.target.value }))}
                placeholder="https://..."
              />
            </div>

            <div className="space-y-1.5">
              <Label>外部連結 / PDF URL</Label>
              <Input
                value={form.external_url ?? ""}
                onChange={(event) => setForm((current) => ({ ...current, external_url: event.target.value }))}
                placeholder="https://..."
              />
            </div>

            <div className="space-y-1.5">
              <Label>內容</Label>
              <Textarea
                rows={8}
                value={form.content_html ?? ""}
                onChange={(event) => setForm((current) => ({ ...current, content_html: event.target.value }))}
                placeholder="可輸入純文字或簡單 HTML 內容"
              />
            </div>

            <div className="flex items-center justify-between rounded-md border p-3">
              <div>
                <Label>發布到前台</Label>
                <p className="text-xs text-muted-foreground">關閉時僅後台可見。</p>
              </div>
              <Switch
                checked={form.is_published}
                onCheckedChange={(checked) => setForm((current) => ({ ...current, is_published: checked }))}
              />
            </div>

            <div className="flex gap-2">
              <Button onClick={savePage} disabled={busy}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                儲存內容
              </Button>
              <Button type="button" variant="outline" onClick={() => newPage(form.section_type)} disabled={busy}>
                清空新增
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
