-- Hide webhook_endpoints.bearer_token from direct Data API SELECT.
-- Admins still manage rows (insert/update/delete), but the secret column
-- is no longer readable via PostgREST for authenticated/anon roles.
-- service_role retains full access for privileged server code that
-- actually needs to dispatch webhooks.

REVOKE SELECT ON public.webhook_endpoints FROM anon, authenticated;

GRANT SELECT (id, company_id, name, url, events, active, created_at, updated_at)
  ON public.webhook_endpoints TO authenticated;

-- Keep insert/update/delete privileges intact for admins (RLS still gates rows).
GRANT INSERT, UPDATE, DELETE ON public.webhook_endpoints TO authenticated;
GRANT ALL ON public.webhook_endpoints TO service_role;