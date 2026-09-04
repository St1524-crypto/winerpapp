// Server-only helper: notify the customer that their order has been shipped.
//
// Renders the `order-shipped-notice` React Email template and enqueues it into
// the `transactional_emails` pgmq queue via the service-role client.

import * as React from "react";

const SITE_NAME = "光禾館源晶";
const SENDER_DOMAIN = "win889999.winerp.app";
const FROM_DOMAIN = "winerp.app";

export async function notifyCustomerOrderShipped(params: {
  orderId: string;
  shipmentId: string;
  shippingCompany?: string | null;
  trackingNo?: string | null;
  shippedAt?: string | null;
}): Promise<{ delivered: boolean; reason?: string }> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: order, error } = await supabaseAdmin
      .from("sales_orders")
      .select("id, order_no, customer_name, customer_email, shipping_address, pickup_store")
      .eq("id", params.orderId)
      .maybeSingle();
    if (error) return { delivered: false, reason: error.message };

    const recipient = (order as any)?.customer_email as string | null | undefined;
    if (!order || !recipient) return { delivered: false, reason: "no customer email" };

    const normalizedRecipient = recipient.trim().toLowerCase();
    const { data: suppressed } = await supabaseAdmin
      .from("suppressed_emails")
      .select("id")
      .eq("email", normalizedRecipient)
      .maybeSingle();
    if (suppressed) return { delivered: false, reason: "recipient suppressed" };

    const { render } = await import("@react-email/render");
    const { template } = await import("./email-templates/order-shipped-notice");

    const shippedAt = params.shippedAt
      ? new Date(params.shippedAt).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })
      : undefined;
    const templateData = {
      customerName: (order as any).customer_name ?? undefined,
      orderNo: (order as any).order_no ?? undefined,
      shippedAt,
      shippingCompany: params.shippingCompany ?? undefined,
      trackingNo: params.trackingNo ?? undefined,
      pickupStore: (order as any).pickup_store ?? undefined,
      shippingAddress: (order as any).shipping_address ?? undefined,
    };

    const element = React.createElement(template.component, templateData);
    const html = await render(element);
    const text = await render(element, { plainText: true });
    const subject =
      typeof template.subject === "function" ? template.subject(templateData) : template.subject;

    // Unsubscribe token (mirrors send route behavior)
    let unsubscribeToken: string;
    const { data: existing } = await supabaseAdmin
      .from("email_unsubscribe_tokens")
      .select("token, used_at")
      .eq("email", normalizedRecipient)
      .maybeSingle();
    if (existing && !existing.used_at) {
      unsubscribeToken = existing.token;
    } else {
      const bytes = new Uint8Array(32);
      crypto.getRandomValues(bytes);
      unsubscribeToken = Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      await supabaseAdmin
        .from("email_unsubscribe_tokens")
        .upsert(
          { token: unsubscribeToken, email: normalizedRecipient },
          { onConflict: "email", ignoreDuplicates: true },
        );
      const { data: stored } = await supabaseAdmin
        .from("email_unsubscribe_tokens")
        .select("token")
        .eq("email", normalizedRecipient)
        .maybeSingle();
      if (stored?.token) unsubscribeToken = stored.token;
    }

    const messageId = crypto.randomUUID();
    await supabaseAdmin.from("email_send_log").insert({
      message_id: messageId,
      template_name: "order-shipped-notice",
      recipient_email: recipient,
      status: "pending",
    });

    const { error: enqueueError } = await supabaseAdmin.rpc("enqueue_email", {
      queue_name: "transactional_emails",
      payload: {
        message_id: messageId,
        to: recipient,
        from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
        sender_domain: SENDER_DOMAIN,
        subject,
        html,
        text,
        purpose: "transactional",
        label: "order-shipped-notice",
        idempotency_key: `order-shipped-${params.shipmentId}`,
        unsubscribe_token: unsubscribeToken,
        queued_at: new Date().toISOString(),
      } as any,
    });

    if (enqueueError) {
      await supabaseAdmin.from("email_send_log").insert({
        message_id: messageId,
        template_name: "order-shipped-notice",
        recipient_email: recipient,
        status: "failed",
        error_message: enqueueError.message,
      });
      return { delivered: false, reason: enqueueError.message };
    }

    return { delivered: true };
  } catch (e: any) {
    console.error("[order.shipped.notify] unexpected error", e);
    return { delivered: false, reason: e?.message || String(e) };
  }
}
