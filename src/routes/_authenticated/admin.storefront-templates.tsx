import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/use-auth";
import {
  listStorefrontTemplates,
  createStorefrontTemplate,
  updateStorefrontTemplate,
  deleteStorefrontTemplate,
} from "@/lib/storefront-templates.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Upload } from "lucide-react";
import { ForbiddenScreen } from "@/components/ForbiddenScreen";

export const Route = createFileRoute("/_authenticated/admin/storefront-templates")({
  component: AdminStorefrontTemplatesPage,
});

type Template = {
  id: string;
  name: string;
  description: string | null;
  cover_image: string | null;
  content_json: any;
  sort_order: number;
  is_active: boolean;
  is_default: boolean;
};

function AdminStorefrontTemplatesPage() {
  const { roles, rolesLoaded } = useAuth();
  const navigate = useNavigate();
  const list = useServerFn(listStorefrontTemplates);
  const create = useServerFn(createStorefrontTemplate);
  const update = useServerFn(updateStorefrontTemplate);
  const remove = useServerFn(deleteStorefrontTemplate);
  const [items, setItems] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Template> | null>(null);

  const isAdmin = roles.includes("admin") || roles.includes("super_admin");

  async function reload() {
    setLoading(true);
    try {
      const data = await list();
      setItems(data as Template[]);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (rolesLoaded && isAdmin) reload();
  }, [rolesLoaded, isAdmin]);

  if (!rolesLoaded) return <div className="p-6">載入中…</div>;
  if (!isAdmin) return <ForbiddenScreen requiredRoles={["admin", "super_admin"]} />;

  async function handleSave() {
    if (!editing) return;
    try {
      let contentJson: any = editing.content_json;
      if (typeof contentJson === "string") {
        try {
          contentJson = JSON.parse(contentJson);
        } catch {
          toast.error("content_json 不是有效 JSON");
          return;
        }
      }
      const payload = {
        name: editing.name || "",
        description: editing.description || "",
        cover_image: editing.cover_image || "",
        content_json: contentJson ?? {},
        sort_order: editing.sort_order ?? 0,
        is_active: editing.is_active ?? true,
        is_default: editing.is_default ?? false,
      };
      if (editing.id) {
        await update({ data: { id: editing.id, ...payload } });
        toast.success("已更新");
      } else {
        await create({ data: payload });
        toast.success("已建立");
      }
      setEditing(null);
      reload();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("確定停用此版模？停用後會員前台將不再顯示。")) return;
    try {
      await remove({ data: { id } });
      toast.success("已停用");
      reload();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">會員品牌頁版模管理</h1>
          <p className="text-muted-foreground text-sm mt-1">建立、編輯與管理會員可套用的行銷版模。</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate({ to: "/admin" })}>返回</Button>
          <Button onClick={() => setEditing({ name: "", content_json: {}, sort_order: 0, is_active: true, is_default: false })}>
            新增版模
          </Button>
        </div>
      </div>

      {editing && (
        <Card>
          <CardHeader>
            <CardTitle>{editing.id ? "編輯版模" : "新增版模"}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>名稱</Label>
              <Input value={editing.name || ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </div>
            <div>
              <Label>描述</Label>
              <Textarea value={editing.description || ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
            </div>
            <div>
              <Label>封面圖網址</Label>
              <Input value={editing.cover_image || ""} onChange={(e) => setEditing({ ...editing, cover_image: e.target.value })} />
            </div>
            <div>
              <Label>排序</Label>
              <Input
                type="number"
                value={editing.sort_order ?? 0}
                onChange={(e) => setEditing({ ...editing, sort_order: Number(e.target.value) })}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={editing.is_active ?? true} onCheckedChange={(v) => setEditing({ ...editing, is_active: v })} />
              <Label>啟用</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={editing.is_default ?? false} onCheckedChange={(v) => setEditing({ ...editing, is_default: v })} />
              <Label>設為預設</Label>
            </div>
            <div className="space-y-2">
              <Label>版型 layout</Label>
              <Input
                placeholder="例如：social / event / sales"
                value={(() => {
                  let cj: any = editing.content_json;
                  if (typeof cj === "string") { try { cj = JSON.parse(cj); } catch { cj = {}; } }
                  return cj?.layout || "";
                })()}
                onChange={(e) => {
                  let cj: any = editing.content_json;
                  if (typeof cj === "string") { try { cj = JSON.parse(cj); } catch { cj = {}; } }
                  setEditing({ ...editing, content_json: { ...(cj || {}), layout: e.target.value } });
                }}
              />
            </div>
            <div className="space-y-2">
              <Label>圖片區塊（最多 7 張，含說明）</Label>
              <GalleryEditor
                value={(() => {
                  let cj: any = editing.content_json;
                  if (typeof cj === "string") { try { cj = JSON.parse(cj); } catch { cj = {}; } }
                  return Array.isArray(cj?.gallery) ? cj.gallery : [];
                })()}
                onChange={(gallery) => {
                  let cj: any = editing.content_json;
                  if (typeof cj === "string") { try { cj = JSON.parse(cj); } catch { cj = {}; } }
                  setEditing({ ...editing, content_json: { ...(cj || {}), gallery } });
                }}
              />
            </div>
            <div className="space-y-2">
              <Label>內容區塊 sections（表單編輯）</Label>
              <SectionsEditor
                value={(() => {
                  let cj: any = editing.content_json;
                  if (typeof cj === "string") { try { cj = JSON.parse(cj); } catch { cj = {}; } }
                  return Array.isArray(cj?.sections) ? cj.sections : [];
                })()}
                onChange={(sections) => {
                  let cj: any = editing.content_json;
                  if (typeof cj === "string") { try { cj = JSON.parse(cj); } catch { cj = {}; } }
                  setEditing({ ...editing, content_json: { ...(cj || {}), sections } });
                }}
              />
            </div>
            <details>
              <summary className="cursor-pointer text-sm text-muted-foreground">content_json (進階 / 原始 JSON)</summary>
              <Textarea
                rows={10}
                className="font-mono text-xs mt-2"
                value={typeof editing.content_json === "string" ? editing.content_json : JSON.stringify(editing.content_json ?? {}, null, 2)}
                onChange={(e) => setEditing({ ...editing, content_json: e.target.value })}
              />
            </details>
            <div className="flex gap-2">
              <Button onClick={handleSave}>儲存</Button>
              <Button variant="outline" onClick={() => setEditing(null)}>取消</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div>載入中…</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((t) => (
            <Card key={t.id} className={!t.is_active ? "opacity-60" : ""}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>{t.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {t.is_active ? "啟用" : "停用"}{t.is_default ? " · 預設" : ""} · 排序 {t.sort_order}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {t.cover_image && <img src={t.cover_image} alt={t.name} className="w-full h-32 object-cover rounded" />}
                <p className="text-sm text-muted-foreground">{t.description}</p>
                <details className="text-xs">
                  <summary className="cursor-pointer">預覽 content_json</summary>
                  <pre className="bg-muted p-2 rounded overflow-auto max-h-64 mt-2">{JSON.stringify(t.content_json, null, 2)}</pre>
                </details>
                <div className="flex gap-2 pt-2">
                  <Button size="sm" variant="outline" onClick={() => setEditing(t)}>編輯</Button>
                  <Button size="sm" variant="destructive" onClick={() => handleDelete(t.id)}>停用</Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

const MAX_GALLERY = 7;
type GalleryItem = { image: string; caption: string };

function GalleryEditor({ value, onChange }: { value: GalleryItem[]; onChange: (v: GalleryItem[]) => void }) {
  const items: GalleryItem[] = Array.isArray(value) ? value : [];
  const update = (i: number, patch: Partial<GalleryItem>) => {
    const next = items.map((it, idx) => (idx === i ? { ...it, ...patch } : it));
    onChange(next);
  };
  const add = () => {
    if (items.length >= MAX_GALLERY) return;
    onChange([...items, { image: "", caption: "" }]);
  };
  const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <div className="space-y-3">
      {items.map((it, i) => (
        <GalleryRow
          key={i}
          index={i}
          item={it}
          total={items.length}
          onUpdate={(patch) => update(i, patch)}
          onMoveUp={() => move(i, -1)}
          onMoveDown={() => move(i, 1)}
          onRemove={() => remove(i)}
        />
      ))}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{items.length} / {MAX_GALLERY}</span>
        <Button type="button" size="sm" variant="outline" onClick={add} disabled={items.length >= MAX_GALLERY}>
          新增圖片
        </Button>
      </div>
    </div>
  );
}

function GalleryRow({
  index,
  item,
  total,
  onUpdate,
  onMoveUp,
  onMoveDown,
  onRemove,
}: {
  index: number;
  item: GalleryItem;
  total: number;
  onUpdate: (patch: Partial<GalleryItem>) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleUpload(file: File) {
    if (!/^image\/(jpe?g|png)$/i.test(file.type)) {
      toast.error("僅支援 JPG / PNG 圖檔");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("檔案超過 5MB");
      return;
    }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `storefront-templates/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from("product-images")
        .upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type });
      if (error) {
        toast.error(error.message);
        return;
      }
      const { data: pub } = supabase.storage.from("product-images").getPublicUrl(path);
      onUpdate({ image: pub.publicUrl });
      toast.success("已上傳");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="border rounded-md p-3 space-y-2 bg-muted/30">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">圖片 #{index + 1}</span>
        <div className="flex gap-1">
          <Button type="button" size="sm" variant="ghost" onClick={onMoveUp} disabled={index === 0}>↑</Button>
          <Button type="button" size="sm" variant="ghost" onClick={onMoveDown} disabled={index === total - 1}>↓</Button>
          <Button type="button" size="sm" variant="destructive" onClick={onRemove}>刪除</Button>
        </div>
      </div>
      <div className="grid gap-2 md:grid-cols-[96px_1fr_1fr] items-start">
        <div className="space-y-1">
          {item.image ? (
            <img src={item.image} alt={`圖片${index + 1}`} className="h-24 w-24 object-cover rounded border" />
          ) : (
            <div className="h-24 w-24 rounded border border-dashed flex items-center justify-center text-xs text-muted-foreground">無圖</div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleUpload(f);
              e.target.value = "";
            }}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-24"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Upload className="h-3 w-3 mr-1" />上傳</>}
          </Button>
        </div>
        <Input
          placeholder="圖片網址（可直接貼上或上傳）"
          value={item.image || ""}
          onChange={(e) => onUpdate({ image: e.target.value })}
        />
        <Input
          placeholder="說明文字"
          value={item.caption || ""}
          onChange={(e) => onUpdate({ caption: e.target.value })}
        />
      </div>
    </div>
  );
}

type SectionItem = {
  type: string;
  title?: string;
  subtitle?: string;
  body?: string;
  ctaText?: string;
  buttonText?: string;
  url?: string;
  date?: string;
  location?: string;
  limit?: number;
  items?: Array<{ title?: string; desc?: string; time?: string }>;
  showFacebook?: boolean;
  showInstagram?: boolean;
  showLine?: boolean;
  showYoutube?: boolean;
};

const SECTION_TYPES: Array<{ value: string; label: string }> = [
  { value: "hero", label: "Hero 主視覺" },
  { value: "about", label: "關於我" },
  { value: "services", label: "服務項目（列表）" },
  { value: "agenda", label: "活動流程（列表）" },
  { value: "featured_products", label: "精選商品" },
  { value: "custom_products", label: "獨家推薦" },
  { value: "social_links", label: "社群連結" },
  { value: "videos", label: "精選影片" },
  { value: "event_info", label: "活動資訊" },
  { value: "cta", label: "行動呼籲 CTA" },
  { value: "contact", label: "聯絡資訊" },
];

function SectionsEditor({ value, onChange }: { value: SectionItem[]; onChange: (v: SectionItem[]) => void }) {
  const list: SectionItem[] = Array.isArray(value) ? value : [];
  const update = (i: number, patch: Partial<SectionItem>) =>
    onChange(list.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const add = () => onChange([...list, { type: "hero", title: "" }]);
  const remove = (i: number) => onChange(list.filter((_, idx) => idx !== i));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <div className="space-y-3">
      {list.map((s, i) => (
        <div key={i} className="border rounded-md p-3 space-y-2 bg-muted/20">
          <div className="flex items-center justify-between gap-2">
            <select
              className="border rounded px-2 py-1 text-sm bg-background"
              value={s.type}
              onChange={(e) => update(i, { type: e.target.value })}
            >
              {SECTION_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <div className="flex gap-1">
              <Button type="button" size="sm" variant="ghost" onClick={() => move(i, -1)} disabled={i === 0}>↑</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => move(i, 1)} disabled={i === list.length - 1}>↓</Button>
              <Button type="button" size="sm" variant="destructive" onClick={() => remove(i)}>刪除</Button>
            </div>
          </div>
          <SectionFields section={s} onUpdate={(patch) => update(i, patch)} />
        </div>
      ))}
      <Button type="button" size="sm" variant="outline" onClick={add}>新增區塊</Button>
    </div>
  );
}

function SectionFields({ section, onUpdate }: { section: SectionItem; onUpdate: (patch: Partial<SectionItem>) => void }) {
  const t = section.type;
  const needsTitle = ["hero", "about", "services", "agenda", "featured_products", "custom_products", "social_links", "videos", "event_info", "cta", "contact"].includes(t);
  const needsBody = ["about", "event_info"].includes(t);
  const needsSubtitle = t === "hero";
  const needsCtaText = t === "hero";
  const needsButton = t === "cta";
  const needsUrl = t === "cta";
  const needsDateLoc = t === "event_info";
  const needsLimit = t === "featured_products";
  const needsItems = t === "services" || t === "agenda";
  const needsSocial = t === "social_links" || t === "contact";

  return (
    <div className="grid gap-2">
      {needsTitle && (
        <Input placeholder="標題" value={section.title || ""} onChange={(e) => onUpdate({ title: e.target.value })} />
      )}
      {needsSubtitle && (
        <Input placeholder="副標題 / 小標" value={section.subtitle || ""} onChange={(e) => onUpdate({ subtitle: e.target.value })} />
      )}
      {needsBody && (
        <Textarea placeholder="內文" rows={3} value={section.body || ""} onChange={(e) => onUpdate({ body: e.target.value })} />
      )}
      {needsCtaText && (
        <Input placeholder="CTA 按鈕文字" value={section.ctaText || ""} onChange={(e) => onUpdate({ ctaText: e.target.value })} />
      )}
      {needsButton && (
        <Input placeholder="按鈕文字" value={section.buttonText || ""} onChange={(e) => onUpdate({ buttonText: e.target.value })} />
      )}
      {needsUrl && (
        <Input placeholder="連結網址" value={section.url || ""} onChange={(e) => onUpdate({ url: e.target.value })} />
      )}
      {needsDateLoc && (
        <div className="grid grid-cols-2 gap-2">
          <Input placeholder="日期 (例如 2026/06/27 14:00)" value={section.date || ""} onChange={(e) => onUpdate({ date: e.target.value })} />
          <Input placeholder="地點" value={section.location || ""} onChange={(e) => onUpdate({ location: e.target.value })} />
        </div>
      )}
      {needsLimit && (
        <Input type="number" placeholder="顯示數量上限" value={section.limit ?? 6} onChange={(e) => onUpdate({ limit: Number(e.target.value) })} />
      )}
      {needsSocial && (
        <div className="flex flex-wrap gap-3 text-sm">
          <label className="flex items-center gap-1"><input type="checkbox" checked={!!section.showFacebook} onChange={(e) => onUpdate({ showFacebook: e.target.checked })} />Facebook</label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={!!section.showInstagram} onChange={(e) => onUpdate({ showInstagram: e.target.checked })} />Instagram</label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={!!section.showYoutube} onChange={(e) => onUpdate({ showYoutube: e.target.checked })} />YouTube</label>
          <label className="flex items-center gap-1"><input type="checkbox" checked={!!section.showLine} onChange={(e) => onUpdate({ showLine: e.target.checked })} />LINE</label>
        </div>
      )}
      {needsItems && (
        <ItemsEditor type={t} items={section.items || []} onChange={(items) => onUpdate({ items })} />
      )}
    </div>
  );
}

function ItemsEditor({ type, items, onChange }: { type: string; items: Array<{ title?: string; desc?: string; time?: string }>; onChange: (v: Array<{ title?: string; desc?: string; time?: string }>) => void }) {
  const update = (i: number, patch: Partial<{ title: string; desc: string; time: string }>) =>
    onChange(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const add = () => onChange([...items, type === "agenda" ? { time: "", title: "" } : { title: "", desc: "" }]);
  const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i));
  return (
    <div className="space-y-2">
      {items.map((it, i) => (
        <div key={i} className="flex gap-2 items-center">
          {type === "agenda" ? (
            <>
              <Input className="w-32" placeholder="時間" value={it.time || ""} onChange={(e) => update(i, { time: e.target.value })} />
              <Input placeholder="項目" value={it.title || ""} onChange={(e) => update(i, { title: e.target.value })} />
            </>
          ) : (
            <>
              <Input className="w-40" placeholder="標題" value={it.title || ""} onChange={(e) => update(i, { title: e.target.value })} />
              <Input placeholder="說明" value={it.desc || ""} onChange={(e) => update(i, { desc: e.target.value })} />
            </>
          )}
          <Button type="button" size="sm" variant="destructive" onClick={() => remove(i)}>×</Button>
        </div>
      ))}
      <Button type="button" size="sm" variant="outline" onClick={add}>新增項目</Button>
    </div>
  );
}
