type RateBucket = {
  count: number;
  resetAt: number;
};

type GuardResult =
  | { ok: true; origin: string | null }
  | { ok: false; response: Response };

const WINDOW_MS = 60_000;
const buckets = new Map<string, RateBucket>();

function getAllowedOrigins(request: Request) {
  const configured = (process.env.AI_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (configured.length > 0) return configured;

  const url = new URL(request.url);
  const sameOrigin = `${url.protocol}//${url.host}`;
  const devOrigins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
  ];
  return [sameOrigin, ...devOrigins];
}

function getOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (origin) return origin;
  const referer = request.headers.get("referer");
  if (!referer) return null;
  try {
    const url = new URL(referer);
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

function getClientKey(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip")?.trim();
  const cfIp = request.headers.get("cf-connecting-ip")?.trim();
  return cfIp || forwardedFor || realIp || "unknown";
}

function corsHeaders(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin ?? "null",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "600",
    Vary: "Origin",
  };
}

function isOriginAllowed(request: Request, origin: string | null) {
  if (!origin) return false;
  return getAllowedOrigins(request).includes(origin);
}

export function publicAiOptionsResponse(request: Request) {
  const origin = getOrigin(request);
  if (!isOriginAllowed(request, origin)) return new Response(null, { status: 403 });
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
}

export function requirePublicAiAccess(request: Request): GuardResult {
  const origin = getOrigin(request);
  if (!isOriginAllowed(request, origin)) {
    return { ok: false, response: new Response("Forbidden origin", { status: 403 }) };
  }

  const now = Date.now();
  const limit = Number(process.env.AI_RECRUIT_RATE_LIMIT_PER_MINUTE ?? 10);
  const clientKey = `${origin}:${getClientKey(request)}`;
  const current = buckets.get(clientKey);

  if (!current || current.resetAt <= now) {
    buckets.set(clientKey, { count: 1, resetAt: now + WINDOW_MS });
    return { ok: true, origin };
  }

  if (current.count >= limit) {
    return {
      ok: false,
      response: new Response("Too many requests", {
        status: 429,
        headers: {
          ...corsHeaders(origin),
          "Retry-After": String(Math.ceil((current.resetAt - now) / 1000)),
        },
      }),
    };
  }

  current.count += 1;
  return { ok: true, origin };
}

export function publicAiCorsHeaders(origin: string | null) {
  return corsHeaders(origin);
}
