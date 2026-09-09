// Server-only helper: notify the customer that their order has been shipped.
//
// Sends the `order-shipped-notice` React Email template through Lovable's
// managed email API (see src/lib/email-templates/send-email.ts).

const TEMPLATE_NAME = "order-shipped-notice";

export async function notifyCustomerOrderShipped(params: {
  orderId: string;
  shipmentId: string;
  shippingCompany?: string | null;
  trackingNo?: string | null;
  shippedAt?: string | null;
}): Promise<{ delivered: boolean; reason?: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const logSend = async (
    recipient: string,
    status: "sent" | "suppressed" | "failed",
    errorMessage?: string,
  ) => {
    const { error } = await supabaseAdmin.from("email_send_log").insert({
      message_id: null,
      template_name: TEMPLATE_NAME,
      recipient_email: recipient,
      status,
      error_message: errorMessage ?? null,
    });
    if (error) {
      console.error("[order.shipped.notify] email_send_log insert failed", {
        code: error.code,
        message: error.message,
      });
    }
  };

  let recipient = "";
  try {
    const { data: order, error } = await supabaseAdmin
      .from("sales_orders")
      .select("id, order_no, customer_name, customer_email, shipping_address, pickup_store")
      .eq("id", params.orderId)
      .maybeSingle();
    if (error) return { delivered: false, reason: error.message };

    const email = (order as any)?.customer_email as string | null | undefined;
    if (!order || !email) return { delivered: false, reason: "no customer email" };
    recipient = email.trim();

    const { sendTemplateEmail } = await import("./email-templates/send-email");

    const shippedAt = params.shippedAt
      ? new Date(params.shippedAt).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })
      : undefined;

    const result = await sendTemplateEmail(TEMPLATE_NAME, recipient, {
      idempotencyKey: `order-shipped-${params.shipmentId}`,
      templateData: {
        customerName: (order as any).customer_name ?? undefined,
        orderNo: (order as any).order_no ?? undefined,
        shippedAt,
        shippingCompany: params.shippingCompany ?? undefined,
        trackingNo: params.trackingNo ?? undefined,
        pickupStore: (order as any).pickup_store ?? undefined,
        shippingAddress: (order as any).shipping_address ?? undefined,
      },
    });

    if (!result.sent) {
      await logSend(recipient, "suppressed");
      return { delivered: false, reason: "recipient suppressed" };
    }

    await logSend(recipient, "sent");
    return { delivered: true };
  } catch (e: any) {
    const reason = e?.message || String(e);
    console.error("[order.shipped.notify] unexpected error", e);
    if (recipient) await logSend(recipient, "failed", reason);
    return { delivered: false, reason };
  }
}
