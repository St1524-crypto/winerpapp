export type CronAuthResult =
  | { ok: true }
  | { ok: false; status: 401 | 403; body: { ok: false; reason: string } };

export function requireCronSecret(request: Request): CronAuthResult {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return { ok: false, status: 403, body: { ok: false, reason: "cron_secret_not_configured" } };
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader?.toLowerCase().startsWith("bearer ")) {
    return { ok: false, status: 401, body: { ok: false, reason: "missing_bearer_token" } };
  }

  const token = authHeader.slice("bearer ".length).trim();
  if (token !== expected) {
    return { ok: false, status: 403, body: { ok: false, reason: "invalid_cron_secret" } };
  }

  return { ok: true };
}

/**
 * Accepts either CRON_SECRET or a caller-specific alternate token.
 * Used by bonus-daily-tick so pg_cron can carry a dedicated token
 * without sharing the general CRON_SECRET.
 */
export function requireAnyCronSecret(
  request: Request,
  alternateEnvName: string,
): CronAuthResult {
  const primary = process.env.CRON_SECRET;
  const alternate = process.env[alternateEnvName];
  if (!primary && !alternate) {
    return { ok: false, status: 403, body: { ok: false, reason: "cron_secret_not_configured" } };
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader?.toLowerCase().startsWith("bearer ")) {
    return { ok: false, status: 401, body: { ok: false, reason: "missing_bearer_token" } };
  }

  const token = authHeader.slice("bearer ".length).trim();
  if ((primary && token === primary) || (alternate && token === alternate)) {
    return { ok: true };
  }
  return { ok: false, status: 403, body: { ok: false, reason: "invalid_cron_secret" } };
}

export function cronAuthErrorResponse(result: Exclude<CronAuthResult, { ok: true }>) {
  return Response.json(result.body, { status: result.status });
}
