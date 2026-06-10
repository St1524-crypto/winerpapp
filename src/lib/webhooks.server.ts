// Server-only helper to deliver webhooks to all registered endpoints subscribed to an event.
export type WebhookEvent =
  | "member.created"
  | "order.created"
  | "group_buy.created"
  | "group_buy.completed"
  | "vip.upgraded";

export async function deliverWebhook(event: WebhookEvent, data: unknown, companyId?: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  let q = supabaseAdmin
    .from("webhook_endpoints")
    .select("id,url,bearer_token,events,company_id")
    .eq("active", true)
    .contains("events", [event]);
  if (companyId) q = q.eq("company_id", companyId);
  const { data: endpoints, error } = await q;
  if (error || !endpoints?.length) return;

  const payload = { event, timestamp: new Date().toISOString(), data };
  await Promise.allSettled(
    endpoints.map(async (ep) => {
      let status = 0; let body = ""; let err: string | null = null;
      try {
        const res = await fetch(ep.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${ep.bearer_token}`,
            "X-Webhook-Event": event,
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(10000),
        });
        status = res.status;
        body = (await res.text()).slice(0, 2000);
      } catch (e: any) {
        err = String(e?.message || e).slice(0, 500);
      }
      await supabaseAdmin.from("webhook_deliveries").insert({
        endpoint_id: ep.id, event, payload, status_code: status || null, response_body: body || null, error: err,
      });
    }),
  );
}
