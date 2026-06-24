import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  listActiveStorefrontTemplates,
  applyStorefrontTemplate,
  syncMyAppliedStorefrontTemplate,
  getMyStorefrontPage,
  publishMyStorefrontPage,
  listMyCustomTemplates,
  createMyCustomTemplate,
  updateMyCustomTemplate,
  deleteMyCustomTemplate,
  applyMyCustomTemplate,
  saveCurrentPageAsCustomTemplate,
} from "@/lib/storefront-templates.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StorefrontTemplatePreview } from "@/components/shop/StorefrontTemplatePreview";
import { Eye, Upload, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useRef } from "react";

function CoverImageUploader({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  async function handleFile(file: File) {
    if (!/^image\/(jpe?g|png|webp|gif)$/i.test(file.type)) {
      toast.error("僅支援 JPG / PNG / WEBP / GIF");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("檔案超過 5MB");
      return;
    }
    setUploading(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id ?? "anon";
      const ext = file.name.split(".").pop() || "jpg";
      const path = `member-storefront-templates/${uid}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage
        .from("product-images")
        .upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type });
      if (error) {
        toast.error(error.message);
        return;
      }
      const { data: pub } = supabase.storage.from("product-images").getPublicUrl(path);
      onChange(pub.publicUrl);
      toast.success("已上傳封面圖");
    } finally {
      setUploading(false);
    }
  }
  return (
    <div className="space-y-2">
      <div className="flex gap-2 items-start">
        {value ? (
          <img src={value} alt="封面預覽" className="h-20 w-20 object-cover rounded border" />
        ) : (
          <div className="h-20 w-20 rounded border border-dashed flex items-center justify-center text-xs text-muted-foreground">無圖</div>
        )}
        <div className="flex-1 space-y-2">
          <Input placeholder="封面圖網址（或上傳）" value={value} onChange={(e) => onChange(e.target.value)} />
          <div className="flex gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = "";
              }}
            />
            <Button type="button" size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Upload className="h-3 w-3 mr-1" />}
              上傳圖片
            </Button>
            {value && (
              <Button type="button" size="sm" variant="ghost" onClick={() => onChange("")}>清除</Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/shop/account/storefront/templates")({
  component: MemberStorefrontTemplatesPage,
});

type Template = {
  id: string;
  name: string;
  description: string | null;
  cover_image: string | null;
  content_json: any;
};

type CustomTemplate = Template & { is_active: boolean; sort_order: number };

function MemberStorefrontTemplatesPage() {
  const navigate = useNavigate();
  const list = useServerFn(listActiveStorefrontTemplates);
  const apply = useServerFn(applyStorefrontTemplate);
  const syncApplied = useServerFn(syncMyAppliedStorefrontTemplate);
  const getPage = useServerFn(getMyStorefrontPage);
  const publish = useServerFn(publishMyStorefrontPage);
  const listMine = useServerFn(listMyCustomTemplates);
  const createMine = useServerFn(createMyCustomTemplate);
  const updateMine = useServerFn(updateMyCustomTemplate);
  const deleteMine = useServerFn(deleteMyCustomTemplate);
  const applyMine = useServerFn(applyMyCustomTemplate);
  const saveCurrent = useServerFn(saveCurrentPageAsCustomTemplate);

  const [items, setItems] = useState<Template[]>([]);
  const [mine, setMine] = useState<CustomTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState<{ tpl: Template; isCustom: boolean } | null>(null);
  const [appliedId, setAppliedId] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [preview, setPreview] = useState<{ tpl: Template; isCustom: boolean } | null>(null);

  // Edit/create dialog
  const [editing, setEditing] = useState<CustomTemplate | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", cover_image: "", content_json: "{}" });

  // Save current page as template
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveForm, setSaveForm] = useState({ name: "", description: "", cover_image: "" });

  async function reload() {
    setLoading(true);
    try {
      const [tpls, page, my] = await Promise.all([list(), getPage(), listMine()]);
      setItems(tpls as Template[]);
      setAppliedId((page as any)?.applied_template_id ?? null);
      setMine(my as CustomTemplate[]);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { reload(); }, []);

  async function handleApply() {
    if (!confirm) return;
    setApplying(true);
    try {
      if (confirm.isCustom) {
        await applyMine({ data: { id: confirm.tpl.id } });
      } else {
        await apply({ data: { id: confirm.tpl.id } });
      }
      toast.success("已套用版模");
      setConfirm(null);
      reload();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setApplying(false);
    }
  }

  async function handlePublish() {
    try {
      await publish();
      toast.success("已發布品牌頁");
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function handleSyncAppliedTemplate() {
    setSyncing(true);
    try {
      await syncApplied();
      toast.success("已同步目前使用版模內容");
      reload();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSyncing(false);
    }
  }

  function openCreate() {
    setEditing(null);
    setForm({ name: "", description: "", cover_image: "", content_json: "{}" });
    setEditOpen(true);
  }

  function openEdit(t: CustomTemplate) {
    setEditing(t);
    setForm({
      name: t.name,
      description: t.description ?? "",
      cover_image: t.cover_image ?? "",
      content_json: JSON.stringify(t.content_json ?? {}, null, 2),
    });
    setEditOpen(true);
  }

  async function submitEdit() {
    let parsed: any = {};
    try {
      parsed = form.content_json.trim() ? JSON.parse(form.content_json) : {};
    } catch {
      toast.error("content_json 格式錯誤");
      return;
    }
    try {
      if (editing) {
        await updateMine({
          data: {
            id: editing.id,
            name: form.name,
            description: form.description,
            cover_image: form.cover_image,
            content_json: parsed,
          },
        });
        toast.success("已更新版模");
      } else {
        await createMine({
          data: {
            name: form.name,
            description: form.description,
            cover_image: form.cover_image,
            content_json: parsed,
            sort_order: 0,
            is_active: true,
          },
        });
        toast.success("已新增自訂版模");
      }
      setEditOpen(false);
      reload();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function handleDeleteMine(t: CustomTemplate) {
    if (!window.confirm(`確定刪除「${t.name}」？`)) return;
    try {
      await deleteMine({ data: { id: t.id } });
      toast.success("已刪除");
      reload();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  async function submitSaveCurrent() {
    if (!saveForm.name.trim()) {
      toast.error("請輸入名稱");
      return;
    }
    try {
      await saveCurrent({ data: saveForm });
      toast.success("已將目前品牌頁儲存為自訂版模");
      setSaveOpen(false);
      setSaveForm({ name: "", description: "", cover_image: "" });
      reload();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  return (
    <div className="container mx-auto p-6 space-y-8">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">個人品牌行銷版模版式</h1>
          <p className="text-muted-foreground text-sm mt-1">先從管理員提供的版模選擇，或建立並套用您自己的版模。</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" onClick={() => navigate({ to: "/shop/account/storefront" })}>返回品牌頁</Button>
          <Button variant="outline" onClick={handlePublish}>發布</Button>
        </div>
      </div>

      {/* Admin templates */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">管理員預設版模組</h2>
        </div>
        {loading ? (
          <div>載入中…</div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {items.map((t) => {
              const isCurrent = appliedId === t.id;
              return (
                <Card key={t.id} className={isCurrent ? "ring-2 ring-primary" : ""}>
                  {t.cover_image && (
                    <img src={t.cover_image} alt={t.name} className="w-full h-40 object-cover rounded-t" />
                  )}
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span>{t.name}</span>
                      {isCurrent && <span className="text-xs text-primary">使用中</span>}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground min-h-[3em]">{t.description}</p>
                    <div className="flex gap-2">
                      <Button variant="outline" className="flex-1" onClick={() => setPreview({ tpl: t, isCustom: false })}>
                        <Eye className="w-4 h-4 mr-1" />預覽
                      </Button>
                      <Button className="flex-1" onClick={() => setConfirm({ tpl: t, isCustom: false })}>立即套用</Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {items.length === 0 && <div className="text-muted-foreground">目前沒有預設版模。</div>}
          </div>
        )}
      </section>

      {/* Member custom templates */}
      <section className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-lg font-semibold">我的自訂版模</h2>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" onClick={() => setSaveOpen(true)}>將目前品牌頁存為版模</Button>
            <Button onClick={openCreate}>新增自訂版模</Button>
          </div>
        </div>
        {!loading && (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {mine.map((t) => (
              <Card key={t.id}>
                {t.cover_image && (
                  <img src={t.cover_image} alt={t.name} className="w-full h-40 object-cover rounded-t" />
                )}
                <CardHeader>
                  <CardTitle>{t.name}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground min-h-[3em]">{t.description}</p>
                  <div className="flex gap-2 flex-wrap">
                    <Button variant="outline" onClick={() => setPreview({ tpl: t, isCustom: true })}>
                      <Eye className="w-4 h-4 mr-1" />預覽
                    </Button>
                    <Button className="flex-1" onClick={() => setConfirm({ tpl: t, isCustom: true })}>套用</Button>
                    <Button variant="outline" onClick={() => openEdit(t)}>編輯</Button>
                    <Button variant="destructive" onClick={() => handleDeleteMine(t)}>刪除</Button>
                  </div>
                </CardContent>
              </Card>
            ))}
            {mine.length === 0 && <div className="text-muted-foreground">尚未建立自訂版模。</div>}
          </div>
        )}
      </section>

      {appliedId && (
        <Card>
          <CardHeader><CardTitle>後續動作</CardTitle></CardHeader>
          <CardContent className="flex gap-2 flex-wrap">
            <Button asChild variant="outline">
              <Link to="/shop/account/storefront">編輯品牌頁</Link>
            </Button>
            <Button variant="outline" onClick={handleSyncAppliedTemplate} disabled={syncing}>
              {syncing ? "同步中…" : "同步目前使用版模內容"}
            </Button>
            <Button onClick={handlePublish}>發布品牌頁</Button>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>套用版模確認</AlertDialogTitle>
            <AlertDialogDescription>
              套用「{confirm?.tpl.name}」會覆蓋目前品牌頁內容，是否繼續？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={applying}>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleApply} disabled={applying}>
              {applying ? "套用中…" : "確認套用"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Template preview */}
      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>預覽：{preview?.tpl.name}</DialogTitle>
          </DialogHeader>
          {preview?.tpl.cover_image && (
            <img src={preview.tpl.cover_image} alt={preview.tpl.name} className="w-full max-h-56 object-cover rounded" />
          )}
          {preview?.tpl.description && (
            <p className="text-sm text-muted-foreground">{preview.tpl.description}</p>
          )}
          {preview && <StorefrontTemplatePreview content={preview.tpl.content_json} />}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreview(null)}>關閉</Button>
            <Button
              onClick={() => {
                const p = preview!;
                setPreview(null);
                setConfirm({ tpl: p.tpl, isCustom: p.isCustom });
              }}
              disabled={!preview}
            >
              套用此版模
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit/Create custom template */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "編輯自訂版模" : "新增自訂版模"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>名稱</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label>描述</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div>
              <Label>封面圖</Label>
              <CoverImageUploader value={form.cover_image} onChange={(url) => setForm({ ...form, cover_image: url })} />
            </div>
            <div>
              <Label>content_json</Label>
              <Textarea
                rows={8}
                className="font-mono text-xs"
                value={form.content_json}
                onChange={(e) => setForm({ ...form, content_json: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>取消</Button>
            <Button onClick={submitEdit}>儲存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Save current page as template */}
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>將目前品牌頁存為自訂版模</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>名稱</Label>
              <Input value={saveForm.name} onChange={(e) => setSaveForm({ ...saveForm, name: e.target.value })} />
            </div>
            <div>
              <Label>描述</Label>
              <Textarea value={saveForm.description} onChange={(e) => setSaveForm({ ...saveForm, description: e.target.value })} />
            </div>
            <div>
              <Label>封面圖</Label>
              <CoverImageUploader value={saveForm.cover_image} onChange={(url) => setSaveForm({ ...saveForm, cover_image: url })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)}>取消</Button>
            <Button onClick={submitSaveCurrent}>儲存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
