import { createMiddleware } from "@tanstack/react-start";

/** Decode the (already signed) JWT payload to read its session id. Used only to deny, never to grant. */
export function readJwtSessionId(token: string): string | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const json = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof json?.session_id === "string" ? json.session_id : null;
  } catch {
    return null;
  }
}

/**
 * Rejects server function calls whose sign-in was revoked in user_sessions,
 * matching by auth session id (survives token refresh) or legacy token hash.
 */
export const rejectRevokedSession = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const { getRequest } = await import("@tanstack/react-start/server");
  const auth = getRequest()?.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return next();
  const token = auth.slice(7);
  const sessionId = readJwtSessionId(token);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { createHash } = await import("node:crypto");
  const hash = createHash("sha256").update(token).digest("hex");
  const filters = [`session_token_hash.eq.${hash}`];
  if (sessionId && /^[0-9a-f-]{36}$/i.test(sessionId)) filters.push(`auth_session_id.eq.${sessionId}`);
  const { data } = await supabaseAdmin
    .from("user_sessions")
    .select("id")
    .not("revoked_at", "is", null)
    .or(filters.join(","))
    .limit(1);
  if (data && data.length > 0) throw new Error("Unauthorized: session revoked");
  return next();
});
