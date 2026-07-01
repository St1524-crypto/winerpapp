import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const paymentSchema = z.object({
  amount: z.coerce.number().min(0),
  payment_method: z.string().trim().min(1).optional(),
  payment_status: z.string().trim().min(1).optional(),
  paid_at: z.string().trim().optional().nullable(),
});

const pointPaymentSchema = z.object({
  point_type: z.enum(["discount", "shopping", "reward"]),
  points_used: z.coerce.number().int().positive(),
  amount_offset: z.coerce.number().min(0),
  note: z.string().trim().optional().nullable(),
});

const orderItemSchema = z
  .object({
    product_id: z.string().uuid().optional().nullable(),
    product_name: z.string().trim().min(1),
    sku: z.string().trim().optional().nullable(),
    image: z.string().trim().optional().nullable(),
    unit_price: z.coerce.number().min(0),
    quantity: z.coerce.number().int().positive(),
    subtotal: z.coerce.number().min(0).optional(),
  })
  .passthrough();

const orderPayloadSchema = z
  .object({
    order_no: z.string().trim().optional().nullable(),
    company_id: z.string().uuid().optional().nullable(),
    user_id: z.string().uuid().optional().nullable(),
    customer_id: z.string().uuid().optional().nullable(),
    customer_name: z.string().trim().optional().nullable(),
    customer_email: z.string().trim().email().optional().nullable(),
    customer_phone: z.string().trim().optional().nullable(),
    receiver_name: z.string().trim().optional().nullable(),
    receiver_phone: z.string().trim().optional().nullable(),
    shipping_address: z.string().trim().optional().nullable(),
    shipping_method: z.string().trim().optional().nullable(),
    subtotal: z.coerce.number().min(0).optional(),
    shipping_fee: z.coerce.number().min(0).optional(),
    discount_amount: z.coerce.number().min(0).optional(),
    total_amount: z.coerce.number().min(0),
    notes: z.string().trim().optional().nullable(),
    order_status: z.string().trim().optional(),
    shipping_status: z.string().trim().optional(),
    payment_status: z.string().trim().optional(),
  })
  .passthrough();

const createOrderWithPointPaymentsSchema = z.object({
  order: orderPayloadSchema,
  items: z.array(orderItemSchema).min(1),
  payments: z.array(paymentSchema).default([]),
  pointPayments: z.array(pointPaymentSchema).default([]),
});

export const createSalesOrderWithPointPayments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    const parsed = createOrderWithPointPaymentsSchema.parse(input);
    const seen = new Set<string>();
    for (const payment of parsed.pointPayments) {
      if (seen.has(payment.point_type)) {
        throw new Error(`Duplicate point type: ${payment.point_type}`);
      }
      seen.add(payment.point_type);
    }
    return parsed;
  })
  .handler(async ({ data, context }) => {
    const pointOffsetTotal = data.pointPayments.reduce(
      (sum, payment) => sum + payment.amount_offset,
      0,
    );
    if (pointOffsetTotal > data.order.total_amount) {
      throw new Error("Point offset total cannot exceed order total.");
    }

    const cashAmountDue = data.order.total_amount - pointOffsetTotal;
    const paymentTotal = data.payments.reduce((sum, payment) => sum + payment.amount, 0);
    if (paymentTotal > cashAmountDue) {
      throw new Error("Cash payment total cannot exceed cash amount due.");
    }

    const rpc = context.supabase.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message: string } | null }>;

    const { data: order, error } = await rpc("create_sales_order_with_point_payments", {
      _order: data.order,
      _items: data.items,
      _payments: data.payments,
      _point_payments: data.pointPayments,
    });

    if (error) throw new Error(error.message);
    return order;
  });
