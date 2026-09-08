import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Trash2, Users, FileText, Plus } from "lucide-react";
import {
  adminListDocuments,
  adminSaveDocument,
  adminDeleteDocument,
  adminCreateUploadUrl,
  adminListViewers,
  adminSearchMembers,
  adminAddViewer,
  adminRemoveViewer,
  adminListAccessLogs,
} from "@/lib/company-documents.functions";

export const Route = createFileRoute("/_authenticated/admin/operations/documents")({
  component: CompanyDocumentsPage,
});

type Doc = Awaited<ReturnType<typeof adminListDocuments>>[number];
type Viewer = Awaited<ReturnType<typeof adminListViewers>>[number];
type LogRow = Awaited<ReturnType<typeof adminListAccessLogs>>[number];
type Member = { id: string; name: string | null; member_no: string | null; phone: string | null };

function fmt(ts: string) {
  return new Date(ts).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" });
}

function CompanyDocumentsPage() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Doc> | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [viewerDoc, setViewerDoc] = useState<Doc | null>(null);

  async function reload() {
    setLoading(true);
    try {
      const [d, l] = await Promise.all([adminListDocuments(), adminListAccessLogs({ data: {} })]);
      setDocs(d);
      setLogs(l);
    } catch (e: any) {
      toast.error(e.message ?? "載入失敗");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { reload(); }, []);

  async function save() {
    if (!editing?.title?.trim()) { toast.error("請輸入文件標題"); return; }
    setSaving(true);
    try {
      let filePath = editing.file_path ?? null;
      let fileName = editing.file_name ?? null;
      let fileSize = editing.file_size ?? null;
      if (file) {
        const up = await adminCreateUploadUrl({ data: { fileName: file.name } });
        const res = await fetch(up.signedUrl, { method: "PUT", body: file });
        if (!res.ok) throw new Error("檔案上傳失敗");
        filePath = up.path;
        fileName = file.name;
        fileSize = file.size;
      }
      await adminSaveDocument({
        data: {
          id: editing.id,
          title: editing.title.trim(),
          description: editing.description ?? null,
          body: editing.body ?? null,
          filePath,
          fileName,
          fileSize,
          isActive: editing.is_active ?? true,
        },
      });
      toast.success("已儲存");
      setEditing(null);
      setFile(null);
      await reload();
    } catch (e: any) {
      toast.error(e.message ?? "儲存失敗");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("確定刪除這份文件？")) return;
    try {
      await adminDeleteDocument({ data: { id } });
      toast.success("已刪除");
      await reload();
    } catch (e: any) {
      toast.error(e.message ?? "刪除失敗");
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2"><FileText className="h-4 w-4" />公司管理文件</CardTitle>
          <Button size="sm" onClick={() => { setEditing({ title: "", is_active: true }); setFile(null); }}>
            <Plus className="h-4 w-4 mr-1" />新增文件
          </Button>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-3">
            會員需輸入本人登入密碼才能開啟文件，系統會記錄開啟的會員與時間。
          </p>
          {loading ? (
            <div className="py-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : docs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">尚無文件</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-muted-foreground">
                  <tr className="border-b">
                    <th className="text-left py-2">標題</th>
                    <th className="text-left py-2">附件</th>
                    <th className="text-left py-2">狀態</th>
                    <th className="text-left py-2">可見人數</th>
                    <th className="text-left py-2">開啟次數</th>
                    <th className="text-right py-2">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {docs.map((d) => (
                    <tr key={d.id} className="border-b last:border-0">
                      <td className="py-2">
                        <div className="font-medium">{d.title}</div>
                        <div className="text-xs text-muted-foreground line-clamp-1">{d.description ?? "—"}</div>
                      </td>
                      <td className="py-2 text-xs">{d.file_name ?? "—"}</td>
                      <td className="py-2">
                        <Badge variant={d.is_active ? "secondary" : "outline"}>{d.is_active ? "啟用" : "停用"}</Badge>
                      </td>
                      <td className="py-2">{d.viewerCount}</td>
                      <td className="py-2">{d.openCount}</td>
                      <td className="py-2 text-right space-x-1">
                        <Button size="sm" variant="outline" onClick={() => setViewerDoc(d)}>
                          <Users className="h-4 w-4 mr-1" />可見名單
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => { setEditing(d); setFile(null); }}>編輯</Button>
                        <Button size="sm" variant="ghost" onClick={() => remove(d.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>開啟紀錄（會員 / 時間）</CardTitle></CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">尚無開啟紀錄</p>
          ) : (
            <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="text-muted-foreground sticky top-0 bg-background">
                  <tr className="border-b">
                    <th className="text-left py-2">文件</th>
                    <th className="text-left py-2">會員</th>
                    <th className="text-left py-2">會員編號</th>
                    <th className="text-left py-2">開啟時間</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((l) => (
                    <tr key={l.id} className="border-b last:border-0">
                      <td className="py-2">{l.documentTitle}</td>
                      <td className="py-2">{l.memberName}</td>
                      <td className="py-2">{l.memberNo}</td>
                      <td className="py-2">{fmt(l.accessedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{editing?.id ? "編輯文件" : "新增文件"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>標題</Label>
              <Input value={editing?.title ?? ""} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>說明</Label>
              <Input value={editing?.description ?? ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>文件內容（文字）</Label>
              <Textarea rows={8} value={editing?.body ?? ""} onChange={(e) => setEditing({ ...editing, body: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>附件檔案（選填，最大 50MB）</Label>
              <Input type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              {editing?.file_name && !file && (
                <p className="text-xs text-muted-foreground">目前附件：{editing.file_name}</p>
              )}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={editing?.is_active ?? true}
                onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })}
              />
              啟用（會員可見）
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditing(null)}>取消</Button>
              <Button onClick={save} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "儲存"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ViewerDialog doc={viewerDoc} onClose={() => { setViewerDoc(null); reload(); }} />
    </div>
  );
}

function ViewerDialog({ doc, onClose }: { doc: Doc | null; onClose: () => void }) {
  const [viewers, setViewers] = useState<Viewer[]>([]);
  const [keyword, setKeyword] = useState("");
  const [results, setResults] = useState<Member[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!doc) return;
    adminListViewers({ data: { documentId: doc.id } }).then(setViewers).catch(() => {});
  }, [doc?.id]);

  async function search() {
    if (!keyword.trim()) return;
    setBusy(true);
    try {
      setResults((await adminSearchMembers({ data: { keyword: keyword.trim() } })) as Member[]);
    } catch (e: any) {
      toast.error(e.message ?? "查詢失敗");
    } finally {
      setBusy(false);
    }
  }

  async function add(userId: string) {
    if (!doc) return;
    await adminAddViewer({ data: { documentId: doc.id, userId } });
    setViewers(await adminListViewers({ data: { documentId: doc.id } }));
    toast.success("已加入可見名單");
  }

  async function remove(id: string) {
    if (!doc) return;
    await adminRemoveViewer({ data: { id } });
    setViewers(await adminListViewers({ data: { documentId: doc.id } }));
  }

  return (
    <Dialog open={!!doc} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>可見名單 — {doc?.title}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="搜尋姓名 / 會員編號 / 電話"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && search()}
            />
            <Button onClick={search} disabled={busy}>搜尋</Button>
          </div>
          {results.length > 0 && (
            <div className="border rounded-md divide-y max-h-48 overflow-y-auto">
              {results.map((m) => (
                <div key={m.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span>{m.name ?? "—"}（{m.member_no ?? "—"}）{m.phone ?? ""}</span>
                  <Button size="sm" variant="outline" onClick={() => add(m.id)}>加入</Button>
                </div>
              ))}
            </div>
          )}
          <div>
            <p className="text-sm font-medium mb-2">目前可見會員（{viewers.length}）</p>
            {viewers.length === 0 ? (
              <p className="text-sm text-muted-foreground">尚未指定，任何會員都看不到這份文件。</p>
            ) : (
              <div className="border rounded-md divide-y max-h-60 overflow-y-auto">
                {viewers.map((v) => (
                  <div key={v.id} className="flex items-center justify-between px-3 py-2 text-sm">
                    <span>{v.name}（{v.memberNo}）{v.phone}</span>
                    <Button size="sm" variant="ghost" onClick={() => remove(v.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
