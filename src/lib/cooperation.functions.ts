import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const APPLICATION_TYPES = ["dealer", "reseller", "vip"] as const;
const STATUSES = ["pending", "contacted", "approved", "rejected", "archived"] as const;

const optStr = (max = 500) =>
  z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));

const submitSchema = z.object({
  application_type: z.enum(APPLICATION_TYPES),
  company_name: optStr(200),
  tax_id: optStr(50),
  owner_name: optStr(100),
  contact_name: optStr(100),
  phone: z.string().trim().min(4).max(50),
  email: z.string().trim().email().max(255),
  line_id: optStr(100),
  city: optStr(50),
  address: optStr(300),
  sales_channels: z.array(z.string().max(50)).max(20).optional().nullable(),
  sales_platform_url: optStr(500),
  audience_size: optStr(100),
  interested_products: optStr(500),
  expected_monthly_volume: optStr(100),
  has_referrer: z.boolean().optional().nullable(),
  referrer_info: optStr(200),
  interested_topics: z.array(z.string().max(50)).max(20).optional().nullable(),
  note: optStr(1000),
  // honeypot — must be empty
  website_url: z.string().max(0).optional().or(z.literal("").optional()),
});

export const submitCooperationApplication = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => submitSchema.parse(data))
  .handler(async ({ data }) => {
    // honeypot: silently succeed without writing
    if (data.website_url && data.website_url.length > 0) {
      return { ok: true };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { website_url: _hp, ...payload } = data;

    const { data: inserted, error } = await supabaseAdmin
      .from("cooperation_applications")
      .insert(payload)
      .select("id, application_type, company_name, contact_name, owner_name, phone, email, sales_channels, note")
      .single();

    if (error) {
      console.error("[cooperation.submit] insert failed", error);
      throw new Error("送出失敗，請稍後再試");
    }

    try {
      const { notifyAdminOfCooperationApplication } = await import("./cooperation-email.server");
      await notifyAdminOfCooperationApplication(inserted as any);
    } catch (e) {
      console.error("[cooperation.submit] notify failed", e);
    }

    return { ok: true };
  });

async function requireAdmin(context: { supabase: any; userId: string }) {
  const { data: isAdmin } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  const { data: isSuper } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "super_admin",
  });
  if (!isAdmin && !isSuper) throw new Error("Forbidden");
}

const listSchema = z.object({
  type: z.enum(APPLICATION_TYPES).optional().nullable(),
  status: z.enum(STATUSES).optional().nullable(),
}).optional().nullable();

export const listCooperationApplications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => listSchema.parse(data) ?? {})
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    let q = context.supabase
      .from("cooperation_applications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (data?.type) q = q.eq("application_type", data.type);
    if (data?.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

const updateSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(STATUSES).optional(),
  admin_note: z.string().max(2000).optional().nullable(),
});

export const updateCooperationApplication = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => updateSchema.parse(data))
  .handler(async ({ data, context }) => {
    await requireAdmin(context);
    const patch: Record<string, unknown> = {};
    if (data.status) patch.status = data.status;
    if (data.admin_note !== undefined) patch.admin_note = data.admin_note;
    const { error } = await context.supabase
      .from("cooperation_applications")
      .update(patch)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
