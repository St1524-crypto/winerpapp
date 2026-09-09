// Server-only helper: notify site admin of a new cooperation application.
//
// Sends the `cooperation-application-admin-notice` React Email template through
// Lovable's managed email API (see src/lib/email-templates/send-email.ts).
//
// Recipient is taken from the env var COOPERATION_NOTIFY_EMAIL. If it is not
// set, we skip sending and log a warning — the application is still recorded
// in the database and visible in the admin dashboard.

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

const ADMIN_URL = "https://winerp.app/admin/cooperation-applications";
const TEMPLATE_NAME = "cooperation-application-admin-notice";

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

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const logSend = async (
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
      console.error("[cooperation.notify] email_send_log insert failed", {
        code: error.code,
        message: error.message,
      });
    }
  };

  try {
    const { sendTemplateEmail } = await import("./email-templates/send-email");

    const displayName =
      app.company_name || app.contact_name || app.owner_name || "未填寫";
    const salesChannels = (app.sales_channels ?? []).join("、");

    const result = await sendTemplateEmail(TEMPLATE_NAME, recipient, {
      idempotencyKey: `cooperation-${app.id}`,
      templateData: {
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
      },
    });

    if (!result.sent) {
      await logSend("suppressed");
      return { delivered: false, reason: "recipient suppressed" };
    }

    await logSend("sent");
    return { delivered: true };
  } catch (e: any) {
    const reason = e?.message || String(e);
    console.error("[cooperation.notify] unexpected error", e);
    await logSend("failed", reason);
    return { delivered: false, reason };
  }
}
