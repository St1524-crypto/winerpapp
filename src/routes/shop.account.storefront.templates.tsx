import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  listActiveStorefrontTemplates,
  applyStorefrontTemplate,
  getMyStorefrontPage,
  publishMyStorefrontPage,
} from "@/lib/storefront-templates.functions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

function MemberStorefrontTemplatesPage() {
  const navigate = useNavigate();
  const list = useServerFn(listActiveStorefrontTemplates);
  const apply = useServerFn(applyStorefrontTemplate);
  const getPage = useServerFn(getMyStorefrontPage);
  const publish = useServerFn(publishMyStorefrontPage);
  const [items, setItems] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirm, setConfirm] = useState<Template | null>(null);
  const [appliedId, setAppliedId] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  async function reload() {
    setLoading(true);
    try {
      const [tpls, page] = await Promise.all([list(), getPage()]);
      setItems(tpls as Template[]);
      setAppliedId((page as any)?.applied_template_id ?? null);
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
      await apply({ data: { id: confirm.id } });
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
      await publish({});
      toast.success("已發布品牌頁");
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">選擇品牌頁版模</h1>
          <p className="text-muted-foreground text-sm mt-1">挑選一個合適的行銷版模，立即套用到您的品牌頁。</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate({ to: "/shop/account/storefront" })}>返回品牌頁</Button>
          <Button variant="outline" onClick={handlePublish}>發布</Button>
        </div>
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
                  <Button className="w-full" onClick={() => setConfirm(t)}>立即套用</Button>
                </CardContent>
              </Card>
            );
          })}
          {items.length === 0 && <div className="text-muted-foreground">目前沒有可用版模。</div>}
        </div>
      )}

      {appliedId && (
        <Card>
          <CardHeader><CardTitle>後續動作</CardTitle></CardHeader>
          <CardContent className="flex gap-2 flex-wrap">
            <Button asChild variant="outline">
              <Link to="/shop/account/storefront">編輯品牌頁</Link>
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
              套用「{confirm?.name}」會覆蓋目前品牌頁內容，是否繼續？
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
    </div>
  );
}
