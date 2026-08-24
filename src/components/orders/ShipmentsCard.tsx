import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, Truck, Trash2, Plus } from "lucide-react";
import {
  createOrderShipment,
  listOrderShipments,
  voidOrderShipment,
  type ShipmentRow,
} from "@/lib/shipments.functions";

export type ShipmentOrderItem = {
  id: string;
  product_name: string;
  quantity: number;
};

function localNowInput() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ShipmentsCard({
  orderId,
  items,
  readOnly = false,
  onChanged,
}: {
  orderId: string;
  items: ShipmentOrderItem[];
  readOnly?: boolean;
  onChanged?: () => void;
}) {
  const qc = useQueryClient();
  const list = useServerFn(listOrderShipments);
  const create = useServerFn(createOrderShipment);
  const voidFn = useServerFn(voidOrderShipment);
  const [open, setOpen] = useState(false);

  const shipmentsQ = useQuery({
    queryKey: ["order-shipments", orderId],
    enabled: !!orderId,
    queryFn: async () => (await list({ data: { orderId } })) as ShipmentRow[],
  });

  const shipments = shipmentsQ.data ?? [];
  const active = shipments.filter((s) => !s.voided_at);

  const shippedByItem = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of active) {
      for (const it of s.items ?? []) {
        map[it.sales_order_item_id] = (map[it.sales_order_item_id] ?? 0) + Number(it.quantity ?? 0);
      }
    }
    return map;
  }, [active]);

  const totalOrdered = items.reduce((s, i) => s + Number(i.quantity ?? 0), 0);
  const totalShipped = Object.values(shippedByItem).reduce((s, n) => s + n, 0);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["order-shipments", orderId] });
    onChanged?.();
  };

  const voidMut = useMutation({
    mutationFn: async (shipmentId: string) => await voidFn({ data: { shipmentId } }),
    onSuccess: () => {
      toast.success("已作廢出貨紀錄");
      refresh();
    },
    onError: (e: any) => toast.error(e?.message ?? "作廢失敗"),
  });

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Truck className="h-4 w-4 text-primary" />
          出貨紀錄
          <Badge variant="outline">
            {totalShipped} / {totalOrdered} 件
          </Badge>
        </CardTitle>
        {!readOnly && (
          <Button size="sm" variant="outline" onClick={() => setOpen(true)} disabled={totalShipped >= totalOrdered}>
            <Plus className="h-3.5 w-3.5 mr-1" />
            新增出貨
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {shipmentsQ.isLoading ? (
          <div className="py-4 text-center text-muted-foreground">載入中...</div>
        ) : (
          <>
            <div className="space-y-1">
              {items.map((it) => {
                const done = shippedByItem[it.id] ?? 0;
                return (
                  <div key={it.id} className="flex items-center justify-between gap-2">
                    <span className="truncate">{it.product_name}</span>
                    <span
                      className={
                        done >= it.quantity
                          ? "tabular-nums text-emerald-500"
                          : "tabular-nums text-muted-foreground"
                      }
                    >
                      已出 {done} / {it.quantity}
                    </span>
                  </div>
                );
              })}
            </div>

            {shipments.length === 0 ? (
              <div className="text-muted-foreground text-xs">尚無出貨紀錄</div>
            ) : (
              <div className="space-y-2">
                {shipments.map((s) => (
                  <div
                    key={s.id}
                    className={`rounded-md border p-3 ${s.voided_at ? "opacity-50 line-through" : ""}`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="text-xs text-muted-foreground">
                        {s.shipped_at ? new Date(s.shipped_at).toLocaleString() : "—"}
                        {s.shipping_company ? ` · ${s.shipping_company}` : ""}
                        {s.tracking_no ? ` · ${s.tracking_no}` : ""}
                      </div>
                      {!readOnly && !s.voided_at && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive h-7 px-2"
                          onClick={() => voidMut.mutate(s.id)}
                          disabled={voidMut.isPending}
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-1" />
                          作廢
                        </Button>
                      )}
                    </div>
                    <div className="space-y-0.5">
                      {(s.items ?? []).map((i) => (
                        <div key={i.id} className="flex justify-between gap-2 text-xs">
                          <span className="truncate">{i.product_name ?? "—"}</span>
                          <span className="tabular-nums">x {i.quantity}</span>
                        </div>
                      ))}
                    </div>
                    {s.note && <div className="mt-1 text-xs text-muted-foreground">備註：{s.note}</div>}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>

      {!readOnly && (
        <ShipmentDialog
          open={open}
          onOpenChange={setOpen}
          items={items}
          shippedByItem={shippedByItem}
          onSubmit={async (payload) => {
            await create({ data: { orderId, ...payload } });
            toast.success("出貨紀錄已建立");
            setOpen(false);
            refresh();
          }}
        />
      )}
    </Card>
  );
}

function ShipmentDialog({
  open,
  onOpenChange,
  items,
  shippedByItem,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  items: ShipmentOrderItem[];
  shippedByItem: Record<string, number>;
  onSubmit: (payload: {
    shippedAt: string;
    shippingCompany?: string;
    trackingNo?: string;
    note?: string;
    items: Array<{ sales_order_item_id: string; quantity: number }>;
  }) => Promise<void>;
}) {
  const remaining = (id: string, qty: number) => Math.max(0, qty - (shippedByItem[id] ?? 0));
  const [qty, setQty] = useState<Record<string, number>>({});
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [shippedAt, setShippedAt] = useState(localNowInput());
  const [company, setCompany] = useState("");
  const [pickup, setPickup] = useState(false);
  const [tracking, setTracking] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [initKey, setInitKey] = useState("");

  const key = `${open}-${items.map((i) => `${i.id}:${remaining(i.id, i.quantity)}`).join(",")}`;
  if (open && key !== initKey) {
    const nextQty: Record<string, number> = {};
    const nextChecked: Record<string, boolean> = {};
    for (const it of items) {
      const rem = remaining(it.id, it.quantity);
      nextQty[it.id] = rem;
      nextChecked[it.id] = rem > 0;
    }
    setQty(nextQty);
    setChecked(nextChecked);
    setShippedAt(localNowInput());
    setInitKey(key);
  }

  const selected = items
    .filter((it) => checked[it.id] && (qty[it.id] ?? 0) > 0)
    .map((it) => ({ sales_order_item_id: it.id, quantity: Math.min(qty[it.id] ?? 0, remaining(it.id, it.quantity)) }));

  async function submit() {
    if (selected.length === 0) {
      toast.error("請至少選擇一個出貨品項");
      return;
    }
    setSaving(true);
    try {
      await onSubmit({
        shippedAt,
        shippingCompany: pickup ? "自取" : company || undefined,
        trackingNo: pickup ? undefined : tracking || undefined,
        note: note || undefined,
        items: selected,
      });
      setCompany("");
      setTracking("");
      setPickup(false);
      setNote("");
      setInitKey("");
    } catch (e: any) {
      toast.error(e?.message ?? "建立出貨失敗");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>新增出貨</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            {items.map((it) => {
              const rem = remaining(it.id, it.quantity);
              return (
                <div key={it.id} className="flex items-center gap-2">
                  <Checkbox
                    checked={!!checked[it.id]}
                    disabled={rem <= 0}
                    onCheckedChange={(v) => setChecked((s) => ({ ...s, [it.id]: !!v }))}
                  />
                  <span className="flex-1 truncate text-sm">{it.product_name}</span>
                  <span className="text-xs text-muted-foreground">剩 {rem}</span>
                  <Input
                    type="number"
                    min={1}
                    max={rem}
                    disabled={rem <= 0 || !checked[it.id]}
                    value={qty[it.id] ?? 0}
                    onChange={(e) =>
                      setQty((s) => ({ ...s, [it.id]: Math.min(Number(e.target.value) || 0, rem) }))
                    }
                    className="w-20 h-8"
                  />
                </div>
              );
            })}
          </div>

          <div className="flex items-center gap-2 rounded-md border p-2">
            <Checkbox id="pickup" checked={pickup} onCheckedChange={(v) => setPickup(!!v)} />
            <Label htmlFor="pickup" className="text-sm cursor-pointer">
              自取（現場取貨，免物流）
            </Label>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">出貨時間</Label>
              <Input type="datetime-local" value={shippedAt} onChange={(e) => setShippedAt(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">物流公司</Label>
              <Input
                value={pickup ? "自取" : company}
                disabled={pickup}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="黑貓 / 郵局..."
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">物流單號</Label>
              <Input value={pickup ? "" : tracking} disabled={pickup} onChange={(e) => setTracking(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">備註</Label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            取消
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
            確認出貨
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
