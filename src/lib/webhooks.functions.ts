import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const VALID_EVENTS = ["member.created", "order.created", "group_buy.created", "group_buy.completed", "vip.upgraded"] as const;

// SSRF guard: only allow https:// to public hostnames. Blocks loopback,
// link-local (incl. cloud metadata 169.254.169.254), private RFC1918 ranges,
// IPv6 loopback / unique-local / link-local, and bare hostnames without a dot.
function assertSafeWebhookUrl(raw: string) {
  let u: URL;
  try { u = new URL(raw); } catch { throw new Error("Webhook URL 格式無效"); }
  if (u.protocol !== "https:") throw new Error("Webhook URL 必須使用 https://");
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host) throw new Error("Webhook URL 主機名無效");
  // Block obvious internal names
  const blockedNames = new Set(["localhost", "ip6-localhost", "ip6-loopback", "metadata", "metadata.google.internal"]);
  if (blockedNames.has(host)) throw new Error("Webhook URL 不可指向內網/雲端中繼資料服務");
  if (host.endsWith(".local") || host.endsWith(".internal")) throw new Error("Webhook URL 不可指向內網主機");
  // IPv4 check
  const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [parseInt(v4[1], 10), parseInt(v4[2], 10)];
    if (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224 // multicast / reserved
    ) throw new Error("Webhook URL 不可指向私有/保留 IP 範圍");
  }
  // IPv6 check (loopback, link-local fe80::/10, unique-local fc00::/7)
  if (host.includes(":")) {
    const h = host;
    if (h === "::1" || h === "::" || h.startsWith("fe8") || h.startsWith("fe9") || h.startsWith("fea") || h.startsWith("feb") || h.startsWith("fc") || h.startsWith("fd")) {
      throw new Error("Webhook URL 不可指向私有/保留 IPv6");
    }
  }
  // Require a dot in hostname for non-IP hosts (rejects bare intranet names)
  if (!v4 && !host.includes(":") && !host.includes(".")) {
    throw new Error("Webhook URL 必須使用完整網域名稱");
  }
}

async function requireAdmin(supabase: any) {
  const { data: roles } = await supabase.from("user_roles").select("role");
  if (!roles?.some((r: any) => ["super_admin", "admin"].includes(r.role))) throw new Error("無權限");
}

export const listWebhookEndpoints = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.supabase);
    const { data, error } = await context.supabase
      .from("webhook_endpoints").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return { endpoints: data ?? [] };
  });

export const createWebhookEndpoint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      name: z.string().min(1).max(80),
      url: z.string().url(),
      events: z.array(z.enum(VALID_EVENTS)).min(1),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase);
    const { data: profile } = await context.supabase
      .from("profiles").select("current_company_id").eq("id", context.userId).single();
    if (!profile?.current_company_id) throw new Error("未綁定公司");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: ep, error } = await supabaseAdmin
      .from("webhook_endpoints")
      .insert({
        name: data.name, url: data.url, events: data.events,
        company_id: profile.current_company_id,
      })
      .select().single();
    if (error) throw error;
    return { endpoint: ep };
  });

export const updateWebhookEndpoint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      name: z.string().min(1).max(80).optional(),
      url: z.string().url().optional(),
      events: z.array(z.enum(VALID_EVENTS)).min(1).optional(),
      active: z.boolean().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase);
    const { id, ...patch } = data;
    const { error } = await context.supabase.from("webhook_endpoints").update(patch).eq("id", id);
    if (error) throw error;
    return { ok: true };
  });

export const deleteWebhookEndpoint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase);
    const { error } = await context.supabase.from("webhook_endpoints").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const rerollWebhookToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase);
    const newToken = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "").slice(0, 16);
    const { error } = await context.supabase
      .from("webhook_endpoints").update({ bearer_token: newToken }).eq("id", data.id);
    if (error) throw error;
    return { token: newToken };
  });

export const listWebhookDeliveries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { endpointId: string }) => z.object({ endpointId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase);
    const { data: rows, error } = await context.supabase
      .from("webhook_deliveries").select("*").eq("endpoint_id", data.endpointId)
      .order("delivered_at", { ascending: false }).limit(50);
    if (error) throw error;
    return { deliveries: rows ?? [] };
  });

// admin: settings
export const getGroupBuySettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: profile } = await context.supabase
      .from("profiles").select("current_company_id").eq("id", context.userId).single();
    if (!profile?.current_company_id) return { settings: null };
    const { data, error } = await context.supabase
      .from("group_buy_settings").select("*").eq("company_id", profile.current_company_id).maybeSingle();
    if (error) throw error;
    return { settings: data };
  });

export const updateGroupBuySettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      winner_reward_pct: z.number().min(0).max(100),
      initiator_reward_pct: z.number().min(0).max(100),
      default_duration_days: z.number().int().min(1).max(30),
      target_count: z.number().int().min(2).max(50),
      max_orders_per_user: z.number().int().min(1).max(10),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase);
    const { data: profile } = await context.supabase
      .from("profiles").select("current_company_id").eq("id", context.userId).single();
    if (!profile?.current_company_id) throw new Error("未綁定公司");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("group_buy_settings")
      .upsert({ company_id: profile.current_company_id, ...data }, { onConflict: "company_id" });
    if (error) throw error;
    return { ok: true };
  });
