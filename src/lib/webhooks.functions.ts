import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const VALID_EVENTS = ["member.created", "order.created", "group_buy.created", "group_buy.completed", "vip.upgraded"] as const;

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
