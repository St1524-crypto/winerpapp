import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  listWebhookEndpoints, createWebhookEndpoint, updateWebhookEndpoint,
  deleteWebhookEndpoint, rerollWebhookToken, listWebhookDeliveries, revealWebhookToken,
} from "@/lib/webhooks.functions";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Trash2, RefreshCw } from "lucide-react";

const EVENTS = ["member.created", "order.created", "group_buy.created", "group_buy.completed", "vip.upgraded"] as const;

export const Route = createFileRoute("/_authenticated/webhooks-admin")({
  component: WebhooksAdmin,
});

function WebhooksAdmin() {
  const list = useServerFn(listWebhookEndpoints);
  const create = useServerFn(createWebhookEndpoint);
  const upd = useServerFn(updateWebhookEndpoint);
  const del = useServerFn(deleteWebhookEndpoint);
  const reroll = useServerFn(rerollWebhookToken);
  const reveal = useServerFn(revealWebhookToken);
  const listDel = useServerFn(listWebhookDeliveries);

  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["webhooks"], queryFn: () => list() });
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [selectedEvents, setSelectedEvents] = useState<string[]>([...EVENTS]);
  const [showDeliveries, setShowDeliveries] = useState<string | null>(null);
  const { data: delData } = useQuery({
    queryKey: ["webhook-del", showDeliveries],
    queryFn: () => listDel({ data: { endpointId: showDeliveries! } }),
    enabled: !!showDeliveries,
  });

  async function handleCreate() {
    try {
      await create({ data: { name, url, events: selectedEvents as any } });
      toast.success("已建立");
      setName(""); setUrl("");
      qc.invalidateQueries({ queryKey: ["webhooks"] });
    } catch (e: any) { toast.error(e.message); }
  }

  return (
    <div className="space-y-4 max-w-5xl">
      <h1 className="text-2xl font-bold">Webhook 管理</h1>
      <Card>
        <CardHeader><CardTitle>新增 Endpoint</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div><Label>名稱</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="n8n 主流程" /></div>
          <div><Label>URL</Label><Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://n8n.example.com/webhook/..." /></div>
          <div>
            <Label>訂閱事件</Label>
            <div className="flex flex-wrap gap-2 mt-1">
              {EVENTS.map((ev) => (
                <label key={ev} className="flex items-center gap-1 text-sm border rounded px-2 py-1 cursor-pointer">
                  <input type="checkbox" checked={selectedEvents.includes(ev)}
                    onChange={(e) => setSelectedEvents(e.target.checked ? [...selectedEvents, ev] : selectedEvents.filter((x) => x !== ev))} />
                  {ev}
                </label>
              ))}
            </div>
          </div>
          <Button onClick={handleCreate} disabled={!name || !url}>建立</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>現有 Endpoints</CardTitle></CardHeader>
        <CardContent>
          {(data?.endpoints ?? []).map((ep: any) => (
            <div key={ep.id} className="border-b py-3 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{ep.name} <Badge variant={ep.active ? "default" : "secondary"}>{ep.active ? "啟用" : "停用"}</Badge></div>
                  <div className="text-xs text-muted-foreground break-all">{ep.url}</div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={async () => {
                    await upd({ data: { id: ep.id, active: !ep.active } });
                    qc.invalidateQueries({ queryKey: ["webhooks"] });
                  }}>{ep.active ? "停用" : "啟用"}</Button>
                  <Button size="sm" variant="outline" onClick={async () => {
                    const r = await reroll({ data: { id: ep.id } });
                    toast.success("已重新產生 Token");
                    qc.invalidateQueries({ queryKey: ["webhooks"] });
                  }}><RefreshCw className="h-3 w-3" /></Button>
                  <Button size="sm" variant="outline" onClick={() => setShowDeliveries(showDeliveries === ep.id ? null : ep.id)}>紀錄</Button>
                  <Button size="sm" variant="destructive" onClick={async () => {
                    if (!confirm("確定刪除？")) return;
                    await del({ data: { id: ep.id } });
                    qc.invalidateQueries({ queryKey: ["webhooks"] });
                  }}><Trash2 className="h-3 w-3" /></Button>
                </div>
              </div>
              <div className="text-xs">事件：{ep.events.join(", ")}</div>
              <div className="text-xs">
                <span className="text-muted-foreground">Bearer Token：</span>
                <code className="bg-muted px-2 py-0.5 rounded">{ep.bearer_token}</code>
              </div>
              {showDeliveries === ep.id && (
                <div className="bg-muted/50 p-2 rounded text-xs space-y-1 max-h-64 overflow-y-auto">
                  {(delData?.deliveries ?? []).map((d: any) => (
                    <div key={d.id} className="flex justify-between border-b py-1">
                      <span>{d.event} · {new Date(d.delivered_at).toLocaleString("zh-TW")}</span>
                      <span className={d.status_code && d.status_code < 300 ? "text-green-600" : "text-red-600"}>
                        {d.status_code ?? d.error ?? "?"}
                      </span>
                    </div>
                  ))}
                  {!delData?.deliveries?.length && <div className="text-muted-foreground">尚無紀錄</div>}
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
