import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useBranding } from "@/hooks/use-branding";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Upload, Image as ImageIcon, Trash2, Loader2 } from "lucide-react";
import { ForbiddenScreen } from "@/components/ForbiddenScreen";
import { CurrentCompanyProfileCard } from "@/components/admin/CurrentCompanyProfileCard";

export const Route = createFileRoute("/_authenticated/settings")({ component: SettingsPage });

interface BrandItem { name: string; url: string; }

function SettingsPage() {
  const { roles } = useAuth();
  const isAdmin = roles.includes("super_admin") || roles.includes("admin");
  const { logoUrl, setLogoUrl } = useBranding();
  const [items, setItems] = useState<BrandItem[]>([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function loadList() {
    const { data, error } = await supabase.storage.from("branding").list("logos", { limit: 50, sortBy: { column: "created_at", order: "desc" } });
    if (error) return;
    const list: BrandItem[] = (data ?? [])
      .filter((f) => f.name && !f.name.startsWith("."))
      .map((f) => {
        const path = `logos/${f.name}`;
        const { data: pub } = supabase.storage.from("branding").getPublicUrl(path);
        return { name: f.name, url: pub.publicUrl };
      });
    setItems(list);
  }
  useEffect(() => { loadList(); }, []);

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("圖片需小於 5MB"); return; }
    if (!file.type.startsWith("image/")) { toast.error("僅支援圖片檔"); return; }
    setBusy(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `logos/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("branding").upload(path, file, { upsert: false, contentType: file.type });
      if (error) throw error;
      const { data: pub } = supabase.storage.from("branding").getPublicUrl(path);
      await setLogoUrl(pub.publicUrl);
      toast.success("Logo 已更新並套用");
      await loadList();
    } catch (err: any) {
      toast.error(err.message ?? "上傳失敗");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function applyLogo(url: string) {
    await setLogoUrl(url);
    toast.success("已套用");
  }

  async function removeFile(name: string, url: string) {
    if (!confirm(`確定刪除 ${name}？`)) return;
    const { error } = await supabase.storage.from("branding").remove([`logos/${name}`]);
    if (error) { toast.error(error.message); return; }
    if (logoUrl === url) await setLogoUrl(null);
    toast.success("已刪除");
    await loadList();
  }

  async function resetDefault() {
    await setLogoUrl(null);
    toast.success("已還原預設 Logo");
  }

  if (!isAdmin) {
    return <ForbiddenScreen requiredRoles={["super_admin", "admin"]} pageName="系統設定" />;
  }

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">系統設定</h1>
        <p className="text-sm text-muted-foreground mt-1">管理品牌資產與全站介面參數。</p>
      </div>

      <CurrentCompanyProfileCard />

      <Card className="bg-card/60 backdrop-blur border-border/60">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ImageIcon className="h-4 w-4 text-primary" /> 品牌 Logo
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
            <div className="flex h-28 w-28 items-center justify-center rounded-2xl bg-white ring-1 ring-primary/30 shadow-glow overflow-hidden">
              <img src={logoUrl} alt="目前 Logo" className="h-full w-full object-contain" />
            </div>
            <div className="space-y-2 flex-1">
              <div className="text-sm font-medium">目前使用的 Logo</div>
              <div className="text-xs text-muted-foreground break-all max-w-md">{logoUrl}</div>
              <div className="flex flex-wrap gap-2 pt-2">
                <Button onClick={() => fileRef.current?.click()} disabled={busy} className="bg-gradient-primary">
                  {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                  上傳新 Logo
                </Button>
                <Button variant="outline" onClick={resetDefault} disabled={busy}>還原預設</Button>
              </div>
              <Input ref={fileRef} type="file" accept="image/*" onChange={onUpload} className="hidden" />
              <p className="text-[11px] text-muted-foreground">支援 PNG / JPG / SVG，建議方形、小於 5MB。儲存後將即時套用至登入頁與側欄。</p>
            </div>
          </div>

          <div>
            <div className="text-sm font-medium mb-3">已上傳的 Logo</div>
            {items.length === 0 ? (
              <div className="text-xs text-muted-foreground py-6 text-center border border-dashed rounded-lg">尚未上傳任何 Logo</div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {items.map((it) => {
                  const active = it.url === logoUrl;
                  return (
                    <div key={it.name} className={`group relative rounded-xl border p-2 bg-white transition-all ${active ? "ring-2 ring-primary shadow-glow" : "border-border/60 hover:border-primary/50"}`}>
                      <div className="aspect-square flex items-center justify-center overflow-hidden">
                        <img src={it.url} alt={it.name} className="max-h-full max-w-full object-contain" />
                      </div>
                      <div className="mt-2 flex gap-1">
                        <Button size="sm" variant={active ? "secondary" : "default"} className="flex-1 h-7 text-xs" onClick={() => applyLogo(it.url)} disabled={active}>
                          {active ? "使用中" : "套用"}
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => removeFile(it.name, it.url)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
