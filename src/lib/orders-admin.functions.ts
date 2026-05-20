import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertSuperAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "super_admin")
    .maybeSingle();
  if (!data) throw new Error("Forbidden: 需要 super_admin 權限才能刪除訂單");
}

export const deleteSalesOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ orderId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context.userId);

    const { data: order, error: fetchErr } = await supabaseAdmin
      .from("sales_orders")
      .select("id, order_no, total_amount, company_id")
      .eq("id", data.orderId)
      .maybeSingle();
    if (fetchErr) throw new Error(fetchErr.message);
    if (!order) throw new Error("找不到訂單");

    // Delete dependents first (in case FK is not ON DELETE CASCADE)
    await supabaseAdmin.from("payments").delete().eq("sales_order_id", data.orderId);
    await supabaseAdmin.from("sales_order_items").delete().eq("sales_order_id", data.orderId);

    const { error: delErr } = await supabaseAdmin
      .from("sales_orders")
      .delete()
      .eq("id", data.orderId);
    if (delErr) throw new Error(delErr.message);

    await supabaseAdmin.from("audit_logs").insert({
      user_id: context.userId,
      entity: "sales_orders",
      entity_id: data.orderId,
      action: "delete",
      metadata: {
        order_no: order.order_no,
        total_amount: order.total_amount,
        company_id: order.company_id,
        by: context.userId,
      },
    });

    return { ok: true };
  });
