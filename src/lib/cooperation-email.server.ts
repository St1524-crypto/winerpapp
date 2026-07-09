// Server-only helper: notify admins of a new cooperation application.
//
// TODO(email): The project currently only has the email queue processor
// (src/routes/lovable/email/queue/process.ts) — no transactional send route,
// no template registry, and no verified sender domain scaffolded here.
// Until the user runs email domain setup + scaffold_transactional_email,
// we intentionally do NOT send fake emails. This stub records to server
// logs so administrators can still see submissions in the runtime logs
// and inspect them in the admin backoffice.
//
// To activate real email delivery:
//   1. Configure email domain (Lovable Cloud → Emails).
//   2. Run scaffold_transactional_email to generate the send route + templates.
//   3. Replace the console.info below with a call to the transactional
//      send endpoint using a `cooperation-application-admin-notice` template.

export type CooperationApplicationSummary = {
  id: string;
  application_type: "dealer" | "reseller" | "vip";
  company_name: string | null;
  contact_name: string | null;
  owner_name: string | null;
  phone: string;
  email: string;
  sales_channels: string[] | null;
  note: string | null;
};

export async function notifyAdminOfCooperationApplication(
  app: CooperationApplicationSummary,
): Promise<{ delivered: boolean; reason?: string }> {
  console.info("[cooperation.application] new submission", {
    id: app.id,
    type: app.application_type,
    company: app.company_name,
    contact: app.contact_name ?? app.owner_name,
    phone: app.phone,
    email: app.email,
    channels: app.sales_channels,
    note: app.note?.slice(0, 200),
  });
  return {
    delivered: false,
    reason:
      "email provider not configured — configure email domain and run scaffold_transactional_email",
  };
}
