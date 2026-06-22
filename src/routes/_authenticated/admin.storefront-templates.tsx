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
            <div>
              <Label>content_json (進階)</Label>
              <Textarea
                rows={10}
                className="font-mono text-xs"
                value={typeof editing.content_json === "string" ? editing.content_json : JSON.stringify(editing.content_json ?? {}, null, 2)}
                onChange={(e) => setEditing({ ...editing, content_json: e.target.value })}
              />
            </div>
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
