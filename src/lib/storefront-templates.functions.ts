import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const templateInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  cover_image: z.string().trim().max(500).optional().or(z.literal("")),
  content_json: z.any().optional(),
  sort_order: z.number().int().min(0).max(99999).default(0),
  is_active: z.boolean().default(true),
  is_default: z.boolean().default(false),
});

const idSchema = z.object({ id: z.string().uuid() });

async function ensureAdmin(context: { supabase: any; userId: string }) {
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

export const listStorefrontTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("member_storefront_templates")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listActiveStorefrontTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("member_storefront_templates")
      .select("id, name, description, cover_image, content_json, sort_order, is_default")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getStorefrontTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("member_storefront_templates")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

export const createStorefrontTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => templateInputSchema.parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("member_storefront_templates")
      .insert({
        name: data.name.trim(),
        description: data.description?.trim() || null,
        cover_image: data.cover_image?.trim() || null,
        content_json: data.content_json ?? {},
        sort_order: data.sort_order,
        is_active: data.is_active,
        is_default: data.is_default,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateStorefrontTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    templateInputSchema.partial().extend({ id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { id, ...rest } = data;
    const payload: Record<string, unknown> = {};
    if (rest.name !== undefined) payload.name = rest.name.trim();
    if (rest.description !== undefined) payload.description = rest.description?.trim() || null;
    if (rest.cover_image !== undefined) payload.cover_image = rest.cover_image?.trim() || null;
    if (rest.content_json !== undefined) payload.content_json = rest.content_json;
    if (rest.sort_order !== undefined) payload.sort_order = rest.sort_order;
    if (rest.is_active !== undefined) payload.is_active = rest.is_active;
    if (rest.is_default !== undefined) payload.is_default = rest.is_default;
    const { data: row, error } = await supabaseAdmin
      .from("member_storefront_templates")
      .update(payload as any)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteStorefrontTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idSchema.parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // soft delete
    const { error } = await supabaseAdmin
      .from("member_storefront_templates")
      .update({ is_active: false })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getMyStorefrontPage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("member_storefront_pages")
      .select("*")
      .eq("member_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

export const applyStorefrontTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idSchema.parse(d))
  .handler(async ({ data, context }) => {
    // Read template only if active
    const { data: tpl, error: tplErr } = await context.supabase
      .from("member_storefront_templates")
      .select("id, content_json, is_active")
      .eq("id", data.id)
      .maybeSingle();
    if (tplErr) throw new Error(tplErr.message);
    if (!tpl || !tpl.is_active) throw new Error("版模不存在或已停用");

    // Deep copy via JSON round-trip
    const deepCopied = JSON.parse(JSON.stringify(tpl.content_json ?? {}));

    const { data: existing } = await context.supabase
      .from("member_storefront_pages")
      .select("id")
      .eq("member_id", context.userId)
      .maybeSingle();

    if (existing) {
      const { error } = await context.supabase
        .from("member_storefront_pages")
        .update({
          content_json: deepCopied,
          applied_template_id: tpl.id,
        })
        .eq("member_id", context.userId);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await context.supabase
        .from("member_storefront_pages")
        .insert({
          member_id: context.userId,
          content_json: deepCopied,
          applied_template_id: tpl.id,
        });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const saveMyStorefrontPageContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ content_json: z.any() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: existing } = await context.supabase
      .from("member_storefront_pages")
      .select("id")
      .eq("member_id", context.userId)
      .maybeSingle();
    if (existing) {
      const { error } = await context.supabase
        .from("member_storefront_pages")
        .update({ content_json: data.content_json })
        .eq("member_id", context.userId);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await context.supabase
        .from("member_storefront_pages")
        .insert({ member_id: context.userId, content_json: data.content_json });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const publishMyStorefrontPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("member_storefront_pages")
      .update({ published_at: new Date().toISOString() })
      .eq("member_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
