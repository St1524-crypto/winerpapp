import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Copy, Eye, ImageIcon, Loader2, Plus, Save, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useIsDealer } from "@/hooks/use-dealer";
import {
  deleteMyCustomProduct,
  deleteMyStorefrontVideo,
  getMyStorefrontManagerData,
  saveMyFeaturedProducts,
  saveMyStorefrontProfile,
  upsertMyCustomProduct,
  upsertMyStorefrontVideo,
} from "@/lib/member-storefront.functions";

type TemplateKey = "A" | "B" | "C" | "D";
interface TemplateOption {
  value: TemplateKey;
  label: string;
  desc: string;
  /** 是否允許目前使用者選擇此版型 */
  allow: (ctx: { isAdmin: boolean; isDealer: boolean; isMember: boolean }) => boolean;
}

const TEMPLATE_OPTIONS: TemplateOption[] = [
  { value: "A", label: "A 品牌型", desc: "所有會員皆可使用", allow: () => true },
  { value: "B", label: "B 電商型", desc: "經銷商 / 管理員", allow: ({ isAdmin, isDealer }) => isAdmin || isDealer },
  { value: "C", label: "C 招商型", desc: "經銷商 / 管理員", allow: ({ isAdmin, isDealer }) => isAdmin || isDealer },
  { value: "D", label: "D 影音型", desc: "所有會員皆可使用", allow: () => true },
];

export const Route = createFileRoute("/shop/account/storefront")({
  component: StorefrontManagerPage,
  head: () => ({ meta: [{ title: "個人品牌頁管理 — 源晶商城" }] }),
});

const EMPTY_PROFILE = {
  profile_avatar: "",
  profile_cover: "",
  brand_name: "",
  brand_intro: "",
  line_url: "",
  facebook_url: "",
  instagram_url: "",
  youtube_url: "",
  page_template: "A",
};

const EMPTY_CUSTOM = {
  title: "",
  description: "",
  image_url: "",
  video_url: "",
  purchase_url: "",
  is_active: true,
};

const EMPTY_VIDEO = {
  title: "",
  video_url: "",
  sort_order: 0,
};

function StorefrontManagerPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<any>(EMPTY_PROFILE);
  const [member, setMember] = useState<any>(null);
  const [products, setProducts] = useState<any[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [customProducts, setCustomProducts] = useState<any[]>([]);
  const [videos, setVideos] = useState<any[]>([]);
  const [customForm, setCustomForm] = useState<any>(EMPTY_CUSTOM);
  const [editingCustomId, setEditingCustomId] = useState<string | null>(null);
  const [videoForm, setVideoForm] = useState<any>(EMPTY_VIDEO);
  const [editingVideoId, setEditingVideoId] = useState<string | null>(null);

  const storefrontPath = useMemo(() => {
    const key = member?.marketing_slug || member?.member_no;
    return key ? `/member-page/${encodeURIComponent(key)}` : "";
  }, [member]);
  const storefrontUrl = typeof window !== "undefined" && storefrontPath ? `${window.location.origin}${storefrontPath}` : storefrontPath;

  async function loadData() {
    setLoading(true);
    try {
      const data = await getMyStorefrontManagerData();
      setMember(data.profile);
      setProfile({
        profile_avatar: data.profile.profile_avatar ?? data.profile.avatar_url ?? "",
        profile_cover: data.profile.profile_cover ?? "",
        brand_name: data.profile.brand_name ?? "",
        brand_intro: data.profile.brand_intro ?? "",
        line_url: data.profile.line_url ?? "",
        facebook_url: data.profile.facebook_url ?? "",
        instagram_url: data.profile.instagram_url ?? "",
        youtube_url: data.profile.youtube_url ?? "",
        page_template: data.profile.page_template ?? "A",
      });
      setProducts(data.products ?? []);
      setSelectedProducts((data.featuredProducts ?? []).map((product: any) => product.id));
      setCustomProducts(data.customProducts ?? []);
      setVideos(data.videos ?? []);
    } catch (error: any) {
      toast.error(error?.message ?? "讀取個人品牌頁資料失敗");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function saveProfile() {
    setSaving(true);
    try {
      await saveMyStorefrontProfile({ data: profile });
      toast.success("個人品牌資料已儲存");
      await loadData();
    } catch (error: any) {
      toast.error(error?.message ?? "儲存失敗");
    } finally {
      setSaving(false);
    }
  }

  function toggleProduct(productId: string, checked: boolean) {
    setSelectedProducts((current) => {
      if (checked) {
        if (current.includes(productId)) return current;
        if (current.length >= 20) {
          toast.error("最多只能選擇 20 件精選商品");
          return current;
        }
        return [...current, productId];
      }
      return current.filter((id) => id !== productId);
    });
  }

  async function saveFeatured() {
    setSaving(true);
    try {
      await saveMyFeaturedProducts({ data: { productIds: selectedProducts } });
      toast.success("精選商品已儲存");
      await loadData();
    } catch (error: any) {
      toast.error(error?.message ?? "儲存精選商品失敗");
    } finally {
      setSaving(false);
    }
  }

  async function saveCustomProduct() {
    setSaving(true);
    try {
      await upsertMyCustomProduct({ data: { ...customForm, id: editingCustomId ?? undefined } });
      toast.success(editingCustomId ? "自訂商品已更新" : "自訂商品已新增");
      setCustomForm(EMPTY_CUSTOM);
      setEditingCustomId(null);
      await loadData();
    } catch (error: any) {
      toast.error(error?.message ?? "儲存自訂商品失敗");
    } finally {
      setSaving(false);
    }
  }

  async function removeCustomProduct(id: string) {
    if (!window.confirm("確定刪除這筆自訂商品？")) return;
    setSaving(true);
    try {
      await deleteMyCustomProduct({ data: { id } });
      toast.success("自訂商品已刪除");
      await loadData();
    } catch (error: any) {
      toast.error(error?.message ?? "刪除失敗");
    } finally {
      setSaving(false);
    }
  }

  async function saveVideo() {
    setSaving(true);
    try {
      await upsertMyStorefrontVideo({ data: { ...videoForm, id: editingVideoId ?? undefined } });
      toast.success(editingVideoId ? "影片已更新" : "影片已新增");
      setVideoForm(EMPTY_VIDEO);
      setEditingVideoId(null);
      await loadData();
    } catch (error: any) {
      toast.error(error?.message ?? "儲存影片失敗");
    } finally {
      setSaving(false);
    }
  }

  async function removeVideo(id: string) {
    if (!window.confirm("確定刪除這支影片？")) return;
    setSaving(true);
    try {
      await deleteMyStorefrontVideo({ data: { id } });
      toast.success("影片已刪除");
      await loadData();
    } catch (error: any) {
      toast.error(error?.message ?? "刪除失敗");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">個人品牌頁</CardTitle>
          <CardDescription>管理你的公開品牌首頁、推薦註冊連結、VIP 招募頁與展示內容。</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 md:flex-row md:items-center">
          <Input value={storefrontUrl || "請先設定會員編號或行銷網址"} readOnly className="font-mono text-xs" />
          <Button asChild variant="outline" disabled={!storefrontPath}>
            <a href={storefrontPath || "#"} target="_blank" rel="noreferrer">
              <Eye className="mr-2 h-4 w-4" />
              預覽
            </a>
          </Button>
          <Button
            variant="outline"
            disabled={!storefrontUrl}
            onClick={async () => {
              await navigator.clipboard.writeText(storefrontUrl);
              toast.success("個人品牌頁網址已複製");
            }}
          >
            <Copy className="mr-2 h-4 w-4" />
            複製
          </Button>
          <Button asChild>
            <a href="/shop/account/storefront/templates">選擇版模</a>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">基本資料與社群連結</CardTitle>
          <CardDescription>這些資料會顯示在公開個人品牌首頁。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="頭像網址">
              <ImageUrlUploadField
                value={profile.profile_avatar}
                onChange={(value) => setProfile({ ...profile, profile_avatar: value })}
                storageFolder="storefront/avatars"
                previewClassName="h-20 w-20 rounded-full"
              />
            </Field>
            <Field label="封面圖網址">
              <ImageUrlUploadField
                value={profile.profile_cover}
                onChange={(value) => setProfile({ ...profile, profile_cover: value })}
                storageFolder="storefront/covers"
                previewClassName="h-20 w-full rounded-md"
              />
            </Field>
            <Field label="個人品牌名稱">
              <Input value={profile.brand_name} onChange={(e) => setProfile({ ...profile, brand_name: e.target.value })} placeholder="例如：源晶健康顧問" />
            </Field>
            <Field label="頁面版型">
              <Select value={profile.page_template} onValueChange={(value) => setProfile({ ...profile, page_template: value })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="A">A 品牌型</SelectItem>
                  <SelectItem value="B">B 電商型</SelectItem>
                  <SelectItem value="C">C 招商型</SelectItem>
                  <SelectItem value="D">D 影音型</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <div className="md:col-span-2">
              <Field label="品牌介紹">
                <Textarea rows={4} value={profile.brand_intro} onChange={(e) => setProfile({ ...profile, brand_intro: e.target.value })} />
              </Field>
            </div>
            <Field label="LINE">
              <Input value={profile.line_url} onChange={(e) => setProfile({ ...profile, line_url: e.target.value })} placeholder="https://..." />
            </Field>
            <Field label="Facebook">
              <Input value={profile.facebook_url} onChange={(e) => setProfile({ ...profile, facebook_url: e.target.value })} placeholder="https://..." />
            </Field>
            <Field label="Instagram">
              <Input value={profile.instagram_url} onChange={(e) => setProfile({ ...profile, instagram_url: e.target.value })} placeholder="https://..." />
            </Field>
            <Field label="Youtube">
              <Input value={profile.youtube_url} onChange={(e) => setProfile({ ...profile, youtube_url: e.target.value })} placeholder="https://..." />
            </Field>
          </div>
          <div className="flex justify-end">
            <Button onClick={saveProfile} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              儲存基本資料
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">精選商品</CardTitle>
          <CardDescription>最多選擇 20 件商品，依勾選順序顯示在個人品牌頁。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="text-sm text-muted-foreground">已選 {selectedProducts.length} / 20</div>
          <div className="max-h-[360px] overflow-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12" />
                  <TableHead>商品</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">價格</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedProducts.includes(product.id)}
                        onCheckedChange={(checked) => toggleProduct(product.id, Boolean(checked))}
                      />
                    </TableCell>
                    <TableCell>{product.name}</TableCell>
                    <TableCell className="font-mono text-xs">{product.sku}</TableCell>
                    <TableCell className="text-right tabular-nums">NT$ {Number(product.price ?? 0).toLocaleString("zh-TW")}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex justify-end">
            <Button onClick={saveFeatured} disabled={saving}>
              <Save className="mr-2 h-4 w-4" />
              儲存精選商品
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">自訂商品</CardTitle>
          <CardDescription>可新增會員自售商品、外部購買網址或聯絡方式。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="商品名稱">
              <Input value={customForm.title} onChange={(e) => setCustomForm({ ...customForm, title: e.target.value })} />
            </Field>
            <Field label="圖片網址">
              <ImageUrlUploadField
                value={customForm.image_url}
                onChange={(value) => setCustomForm({ ...customForm, image_url: value })}
                storageFolder="storefront/custom-products"
                previewClassName="h-20 w-full rounded-md"
              />
            </Field>
            <Field label="影片網址">
              <Input value={customForm.video_url} onChange={(e) => setCustomForm({ ...customForm, video_url: e.target.value })} placeholder="https://..." />
            </Field>
            <Field label="外部購買網址 / 聯絡方式">
              <Input value={customForm.purchase_url} onChange={(e) => setCustomForm({ ...customForm, purchase_url: e.target.value })} placeholder="https://..." />
            </Field>
            <div className="md:col-span-2">
              <Field label="商品說明">
                <Textarea rows={3} value={customForm.description} onChange={(e) => setCustomForm({ ...customForm, description: e.target.value })} />
              </Field>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={customForm.is_active} onCheckedChange={(checked) => setCustomForm({ ...customForm, is_active: checked })} />
              <Label>上架顯示</Label>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            {editingCustomId && (
              <Button variant="outline" onClick={() => { setCustomForm(EMPTY_CUSTOM); setEditingCustomId(null); }}>
                取消編輯
              </Button>
            )}
            <Button onClick={saveCustomProduct} disabled={saving}>
              <Plus className="mr-2 h-4 w-4" />
              {editingCustomId ? "更新自訂商品" : "新增自訂商品"}
            </Button>
          </div>
          <ContentTable
            rows={customProducts}
            onEdit={(item) => {
              setEditingCustomId(item.id);
              setCustomForm({
                title: item.title ?? "",
                description: item.description ?? "",
                image_url: item.image_url ?? "",
                video_url: item.video_url ?? "",
                purchase_url: item.purchase_url ?? "",
                is_active: item.is_active ?? true,
              });
            }}
            onDelete={removeCustomProduct}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">影片管理</CardTitle>
          <CardDescription>支援 YouTube、TikTok、Facebook Reel、Shorts 連結。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-[1fr_1.5fr_120px]">
            <Field label="影片標題">
              <Input value={videoForm.title} onChange={(e) => setVideoForm({ ...videoForm, title: e.target.value })} />
            </Field>
            <Field label="影片網址">
              <Input value={videoForm.video_url} onChange={(e) => setVideoForm({ ...videoForm, video_url: e.target.value })} placeholder="https://..." />
            </Field>
            <Field label="排序">
              <Input type="number" value={videoForm.sort_order} onChange={(e) => setVideoForm({ ...videoForm, sort_order: Number(e.target.value) || 0 })} />
            </Field>
          </div>
          <div className="flex justify-end gap-2">
            {editingVideoId && (
              <Button variant="outline" onClick={() => { setVideoForm(EMPTY_VIDEO); setEditingVideoId(null); }}>
                取消編輯
              </Button>
            )}
            <Button onClick={saveVideo} disabled={saving}>
              <Plus className="mr-2 h-4 w-4" />
              {editingVideoId ? "更新影片" : "新增影片"}
            </Button>
          </div>
          <VideoTable
            rows={videos}
            onEdit={(video) => {
              setEditingVideoId(video.id);
              setVideoForm({
                title: video.title ?? "",
                video_url: video.video_url ?? "",
                sort_order: Number(video.sort_order ?? 0),
              });
            }}
            onDelete={removeVideo}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function ImageUrlUploadField({
  value,
  onChange,
  storageFolder,
  previewClassName,
}: {
  value: string;
  onChange: (value: string) => void;
  storageFolder: string;
  previewClassName: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function uploadFile(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("請選擇圖片檔案");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("圖片不可超過 5MB");
      return;
    }

    setUploading(true);
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user) throw new Error("請先登入後再上傳圖片");

      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const folder = storageFolder.replace(/^\/+|\/+$/g, "");
      const path = `${userData.user.id}/${folder}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from("avatars")
        .upload(path, file, { cacheControl: "3600", upsert: false });

      if (error) throw error;

      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      onChange(data.publicUrl);
      toast.success("圖片已上傳");
    } catch (error: any) {
      const message = /row-level security|permission|policy/i.test(error?.message ?? "")
        ? "權限不足，請重新登入後再上傳圖片。"
        : error?.message ?? "圖片上傳失敗";
      toast.error(message);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input value={value} onChange={(event) => onChange(event.target.value)} placeholder="https://..." />
        <Button type="button" variant="outline" onClick={() => inputRef.current?.click()} disabled={uploading}>
          {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
          上傳
        </Button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(event) => uploadFile(event.target.files?.[0])}
      />
      <div className={`${previewClassName} overflow-hidden border bg-muted`}>
        {value ? (
          <img src={value} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-muted-foreground">
            <ImageIcon className="h-5 w-5" />
          </div>
        )}
      </div>
    </div>
  );
}

function ContentTable({ rows, onEdit, onDelete }: { rows: any[]; onEdit: (row: any) => void; onDelete: (id: string) => void }) {
  if (!rows.length) return <p className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">尚未新增自訂商品</p>;

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>商品名稱</TableHead>
            <TableHead>狀態</TableHead>
            <TableHead>建立時間</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell>{row.title}</TableCell>
              <TableCell>{row.is_active ? "上架" : "下架"}</TableCell>
              <TableCell>{formatDate(row.created_at)}</TableCell>
              <TableCell className="space-x-2 text-right">
                <Button size="sm" variant="outline" onClick={() => onEdit(row)}>編輯</Button>
                <Button size="sm" variant="outline" onClick={() => onDelete(row.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function VideoTable({ rows, onEdit, onDelete }: { rows: any[]; onEdit: (row: any) => void; onDelete: (id: string) => void }) {
  if (!rows.length) return <p className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">尚未新增影片</p>;

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>標題</TableHead>
            <TableHead>排序</TableHead>
            <TableHead>網址</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell>{row.title}</TableCell>
              <TableCell>{row.sort_order}</TableCell>
              <TableCell className="max-w-sm truncate">{row.video_url}</TableCell>
              <TableCell className="space-x-2 text-right">
                <Button size="sm" variant="outline" onClick={() => onEdit(row)}>編輯</Button>
                <Button size="sm" variant="outline" onClick={() => onDelete(row.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function formatDate(value: unknown) {
  if (!value) return "-";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString("zh-TW", { hour12: false });
}
