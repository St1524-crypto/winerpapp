// Server-only helper: notify site admin of a new cooperation application.
//
// Renders the `cooperation-application-admin-notice` React Email template and
// enqueues it into the `transactional_emails` pgmq queue via the service-role
// client. The queue processor (src/routes/lovable/email/queue/process.ts)
// delivers it through Lovable Emails.
//
// Recipient is taken from the env var COOPERATION_NOTIFY_EMAIL. If it is not
// set, we skip sending and log a warning — the application is still recorded
// in the database and visible in the admin dashboard.

import * as React from "react";

export type CooperationApplicationSummary = {
  id: string;
  application_type: "dealer" | "reseller" | "vip";
  company_name: string | null;
  contact_name: string | null;
  owner_name: string | null;
  phone: string;
  email: string;
  sales_channels: string[] | null;
  line_id?: string | null;
  city?: string | null;
  note: string | null;
};

const TYPE_LABELS: Record<string, string> = {
  dealer: "經銷商申請",
  reseller: "個人代銷申請",
  vip: "VIP 會員申請",
};

const SITE_NAME = "winerpapp";
const SENDER_DOMAIN = "win889999.winerp.app";
const FROM_DOMAIN = "winerp.app";
const ADMIN_URL = "https://winerp.app/admin/cooperation-applications";

export async function notifyAdminOfCooperationApplication(
  app: CooperationApplicationSummary,
): Promise<{ delivered: boolean; reason?: string }> {
  const recipient = process.env.COOPERATION_NOTIFY_EMAIL;
  if (!recipient) {
    console.warn(
      "[cooperation.notify] COOPERATION_NOTIFY_EMAIL not set — skipping email",
      { id: app.id, type: app.application_type },
    );
    return { delivered: false, reason: "COOPERATION_NOTIFY_EMAIL not configured" };
  }

  try {
    const { render } = await import("@react-email/render");
    const { template } = await import(
      "./email-templates/cooperation-application-admin-notice"
    );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const displayName =
      app.company_name || app.contact_name || app.owner_name || "未填寫";
    const salesChannels = (app.sales_channels ?? []).join("、");
    const templateData = {
      applicationType: app.application_type,
      typeLabel: TYPE_LABELS[app.application_type] ?? app.application_type,
      displayName,
      phone: app.phone,
      email: app.email,
      lineId: app.line_id ?? undefined,
      city: app.city ?? undefined,
      salesChannels: salesChannels || undefined,
      note: app.note ?? undefined,
      adminUrl: ADMIN_URL,
      submittedAt: new Date().toISOString(),
    };

    const element = React.createElement(template.component, templateData);
    const html = await render(element);
    const text = await render(element, { plainText: true });
    const subject =
      typeof template.subject === "function"
        ? template.subject(templateData)
        : template.subject;

    const messageId = crypto.randomUUID();
    const normalizedRecipient = recipient.toLowerCase();

    // Suppression + unsubscribe token (mirrors send route behavior)
    const { data: suppressed } = await supabaseAdmin
      .from("suppressed_emails")
      .select("id")
      .eq("email", normalizedRecipient)
      .maybeSingle();
    if (suppressed) {
      console.warn("[cooperation.notify] recipient is suppressed", {
        recipient: normalizedRecipient,
      });
      return { delivered: false, reason: "recipient suppressed" };
    }

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

    await supabaseAdmin.from("email_send_log").insert({
      message_id: messageId,
      template_name: "cooperation-application-admin-notice",
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
        label: "cooperation-application-admin-notice",
        idempotency_key: `cooperation-${app.id}`,
        unsubscribe_token: unsubscribeToken,
        queued_at: new Date().toISOString(),
      } as any,
    });

    if (enqueueError) {
      console.error("[cooperation.notify] enqueue failed", enqueueError);
      await supabaseAdmin.from("email_send_log").insert({
        message_id: messageId,
        template_name: "cooperation-application-admin-notice",
        recipient_email: recipient,
        status: "failed",
        error_message: enqueueError.message,
      });
      return { delivered: false, reason: enqueueError.message };
    }

    return { delivered: true };
  } catch (e: any) {
    console.error("[cooperation.notify] unexpected error", e);
    return { delivered: false, reason: e?.message || String(e) };
  }
}
