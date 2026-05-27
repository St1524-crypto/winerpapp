// Dedicated Supabase client used for guest cart operations.
// Injects the per-browser `x-cart-session` header so RLS policies can
// match cart rows by session token without exposing other guests' carts.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const CACHE = new Map<string, ReturnType<typeof createClient<Database>>>();

export function getCartClient(sessionToken: string) {
  if (!sessionToken) throw new Error("Missing cart session token");
  const existing = CACHE.get(sessionToken);
  if (existing) return existing;

  const SUPABASE_URL =
    import.meta.env.VITE_SUPABASE_URL || (typeof process !== "undefined" ? process.env.SUPABASE_URL : undefined);
  const SUPABASE_PUBLISHABLE_KEY =
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    (typeof process !== "undefined" ? process.env.SUPABASE_PUBLISHABLE_KEY : undefined);
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    throw new Error("Supabase environment variables are not configured");
  }

  const client = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
    global: { headers: { "x-cart-session": sessionToken } },
  });
  CACHE.set(sessionToken, client);
  return client;
}
