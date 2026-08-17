import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ShipmentItemRow = {
  id: string;
  sales_order_item_id: string;
  product_name: string | null;
  quantity: number;
};

export type ShipmentRow = {
  id: string;
  sales_order_id: string;
  shipping_company: string | null;
  tracking_no: string | null;
  status: string;
  shipped_at: string | null;
  delivered_at: string | null;
  voided_at: string | null;
  note: string | null;
  created_at: string;
  items: ShipmentItemRow[];
};

export const listOrderShipments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: shipments, error } = await context.supabase
      .from("shipments")
      .select("*")
      .eq("sales_order_id", data.orderId)
      .order("shipped_at", { ascending: false });
    if (error) throw new Error(error.message);

    const ids = (shipments ?? []).map((s: any) => s.id);
    let items: any[] = [];
    if (ids.length > 0) {
      const { data: itemRows, error: itemErr } = await (context.supabase as any)
        .from("shipment_items")
        .select("id, shipment_id, sales_order_item_id, product_name, quantity")
        .in("shipment_id", ids);
      if (itemErr) throw new Error(itemErr.message);
      items = itemRows ?? [];
    }

    return ((shipments ?? []) as any[]).map((s) => ({
      ...s,
      items: items.filter((i) => i.shipment_id === s.id),
    })) as ShipmentRow[];
  });

export const createOrderShipment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        orderId: z.string().uuid(),
        shippedAt: z.string().trim().min(1),
        shippingCompany: z.string().trim().optional().nullable(),
        trackingNo: z.string().trim().optional().nullable(),
        note: z.string().trim().optional().nullable(),
        items: z
          .array(
            z.object({
              sales_order_item_id: z.string().uuid(),
              quantity: z.coerce.number().int().positive(),
            }),
          )
          .min(1),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: result, error } = await (context.supabase.rpc as any).call(
      context.supabase,
      "create_order_shipment",
      {
        _order_id: data.orderId,
        _items: data.items,
        _shipped_at: new Date(data.shippedAt).toISOString(),
        _shipping_company: data.shippingCompany || null,
        _tracking_no: data.trackingNo || null,
        _note: data.note || null,
      },
    );
    if (error) throw new Error(error.message);
    return result as { ok: boolean; shipment_id: string; items: number; shipping_status: string };
  });

export const voidOrderShipment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ shipmentId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await (context.supabase.rpc as any).call(
      context.supabase,
      "void_order_shipment",
      { _shipment_id: data.shipmentId },
    );
    if (error) throw new Error(error.message);
    return result as { ok: boolean; shipping_status: string };
  });
