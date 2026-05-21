import { createFileRoute, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trash2, Megaphone } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  listAnnouncements,
  upsertAnnouncement,
  deleteAnnouncement,
} from "@/lib/support.functions";

export const Route = createFileRoute("/_authenticated/support-announcements")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/login" });
  },
  component: SupportAnnouncementsPage,
});

function SupportAnnouncementsPage() {
  const listFn = useServerFn(listAnnouncements);
  const upsertFn = useServerFn(upsertAnnouncement);
  const deleteFn = useServerFn(deleteAnnouncement);
  const qc = useQueryClient();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [active, setActive] = useState(true);

  const list = useQuery({ queryKey: ["announcements"], queryFn: () => listFn() });

  const create = useMutation({
    mutationFn: () => upsertFn({ data: { title, content, is_active: active } }),
    onSuccess: () => {
      setTitle(""); setContent(""); setActive(true);
      toast.success("已發布");
      qc.invalidateQueries({ queryKey: ["announcements"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "發布失敗"),
  });

  const toggle = useMutation({
    mutationFn: (a: any) =>
      upsertFn({ data: { id: a.id, title: a.title, content: a.content, is_active: !a.is_active } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["announcements"] }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("已刪除");
      qc.invalidateQueries({ queryKey: ["announcements"] });
    },
  });

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6 max-w-3xl">
      <div className="flex items-center gap-2">
        <Megaphone className="h-5 w-5" />
        <h1 className="text-xl font-semibold">客服重要通知</h1>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">發布新通知</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Input placeholder="標題" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Textarea placeholder="通知內容" rows={4} value={content} onChange={(e) => setContent(e.target.value)} />
          <div className="flex items-center gap-2 text-sm">
            <Switch checked={active} onCheckedChange={setActive} /> 立即啟用
          </div>
          <Button
            disabled={!title.trim() || !content.trim() || create.isPending}
            onClick={() => create.mutate()}
          >
            發布
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">所有通知</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {(list.data ?? []).map((a) => (
            <div key={a.id} className="flex items-start gap-3 border rounded-md p-3">
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm">{a.title}</div>
                <div className="text-xs text-muted-foreground whitespace-pre-wrap mt-1">{a.content}</div>
                <div className="text-[11px] text-muted-foreground mt-1">
                  {new Date(a.created_at).toLocaleString("zh-TW")}
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <div className="flex items-center gap-1 text-xs">
                  <Switch checked={a.is_active} onCheckedChange={() => toggle.mutate(a)} />
                  <span>{a.is_active ? "啟用" : "停用"}</span>
                </div>
                <Button size="icon" variant="ghost" onClick={() => remove.mutate(a.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
          {(list.data ?? []).length === 0 && (
            <div className="text-sm text-muted-foreground text-center py-6">尚無通知</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
