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

export function cronAuthErrorResponse(result: Exclude<CronAuthResult, { ok: true }>) {
  return Response.json(result.body, { status: result.status });
}
