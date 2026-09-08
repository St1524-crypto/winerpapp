import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileText, Loader2, Lock, Download } from "lucide-react";
import { listMyDocuments, openDocumentWithPassword } from "@/lib/company-documents.functions";

export const Route = createFileRoute("/shop/account/documents")({
  component: MyDocumentsPage,
  head: () => ({
    meta: [
      { title: "公司管理文件 — 源晶商城會員中心" },
      { name: "description", content: "查看公司授權給您的管理文件，開啟前需輸入本人登入密碼。" },
      { property: "og:title", content: "公司管理文件 — 源晶商城會員中心" },
      { property: "og:description", content: "查看公司授權給您的管理文件，開啟前需輸入本人登入密碼。" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type DocItem = Awaited<ReturnType<typeof listMyDocuments>>[number];
type OpenedDoc = { id: string; title: string; description: string | null; body: string | null; fileName: string | null; fileUrl: string | null };

function MyDocumentsPage() {
  const [docs, setDocs] = useState<DocItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState<DocItem | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [opened, setOpened] = useState<OpenedDoc | null>(null);

  useEffect(() => {
    listMyDocuments()
      .then(setDocs)
      .catch(() => toast.error("載入失敗"))
      .finally(() => setLoading(false));
  }, []);

  async function unlock() {
    if (!target || !password) return;
    setBusy(true);
    try {
      const res = await openDocumentWithPassword({ data: { documentId: target.id, password } });
      if (!res.ok) {
        toast.error(
          res.error === "invalid_password" ? "密碼錯誤，請重新輸入" :
          res.error === "no_access" ? "您沒有此文件的查看權限" : "無法開啟文件",
        );
        return;
      }
      setOpened(res.document);
      setTarget(null);
      setPassword("");
    } catch (e: any) {
      toast.error(e.message ?? "開啟失敗");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><FileText className="h-4 w-4" />公司管理文件</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            開啟文件需輸入您本人的登入密碼，系統會記錄開啟人與開啟時間。
          </p>
          {loading ? (
            <div className="py-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : docs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">目前沒有授權給您的文件</p>
          ) : (
            <div className="space-y-2">
              {docs.map((d) => (
                <div key={d.id} className="flex items-center justify-between gap-3 border rounded-lg px-4 py-3">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{d.title}</div>
                    <div className="text-xs text-muted-foreground truncate">{d.description ?? "—"}</div>
                  </div>
                  <Button size="sm" onClick={() => { setTarget(d); setPassword(""); }}>
                    <Lock className="h-4 w-4 mr-1" />輸入密碼開啟
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>驗證身分</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">開啟「{target?.title}」請輸入您的登入密碼。</p>
            <div className="space-y-1">
              <Label htmlFor="doc-password">登入密碼</Label>
              <Input
                id="doc-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && unlock()}
              />
            </div>
            <Button className="w-full" onClick={unlock} disabled={busy || !password}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "開啟文件"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!opened} onOpenChange={(o) => !o && setOpened(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{opened?.title}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {opened?.description && <p className="text-sm text-muted-foreground">{opened.description}</p>}
            {opened?.body && (
              <div className="whitespace-pre-wrap text-sm border rounded-md p-3 max-h-[50vh] overflow-y-auto">
                {opened.body}
              </div>
            )}
            {opened?.fileUrl && (
              <Button asChild variant="outline">
                <a href={opened.fileUrl} target="_blank" rel="noreferrer">
                  <Download className="h-4 w-4 mr-1" />下載附件（{opened.fileName}）
                </a>
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
