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

function deepCloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value ?? {}));
}

function isBlankOrPlaceholder(value: unknown) {
  if (typeof value !== "string") return true;
  const text = value.trim();
  if (!text) return true;
  return [
    "標題",
    "關於我",
    "簡單介紹自己",
    "在每個平台與我相遇",
    "追蹤我，獲得最新內容",
  ].some((placeholder) => text.includes(placeholder));
}

function mergeTemplateMetadataIntoContent(content: any, template: { name?: string | null; description?: string | null }) {
  const next: any = deepCloneJson(content ?? {});
  const tplName = (template.name || "").trim();
  const tplDesc = (template.description || "").trim();

  if (tplName) {
    next.template_name = tplName;
    next.hero = next.hero && typeof next.hero === "object" ? next.hero : {};
    next.hero.title = tplName;
  }

  if (tplDesc) {
    next.hero = next.hero && typeof next.hero === "object" ? next.hero : {};
    next.hero.subtitle = tplDesc;
    next.about = next.about && typeof next.about === "object" ? next.about : {};
    if (isBlankOrPlaceholder(next.about.content)) next.about.content = tplDesc;
  }

  if (Array.isArray(next.sections)) {
    let hasHero = false;
    next.sections = next.sections.map((s: any) => {
      if (!s || typeof s !== "object") return s;
      if (s.type === "hero") {
        hasHero = true;
        return {
          ...s,
          ...(tplName ? { title: tplName } : {}),
          ...(tplDesc ? { subtitle: tplDesc } : {}),
        };
      }
      if (s.type === "about") {
        return {
          ...s,
          ...(tplDesc && isBlankOrPlaceholder(s.body) ? { body: tplDesc } : {}),
        };
      }
      return s;
    });

    if (!hasHero && (tplName || tplDesc)) {
      next.sections.unshift({ type: "hero", title: tplName, subtitle: tplDesc });
    }
  } else if (tplName || tplDesc) {
    next.sections = [{ type: "hero", title: tplName, subtitle: tplDesc }];
  }

  return next;
}

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
      .select("id, name, description, content_json, is_active")
      .eq("id", data.id)
      .maybeSingle();
    if (tplErr) throw new Error(tplErr.message);
    if (!tpl || !tpl.is_active) throw new Error("版模不存在或已停用");

    const deepCopied = mergeTemplateMetadataIntoContent(tpl.content_json ?? {}, tpl);

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

export const syncMyAppliedStorefrontTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: page, error: pageErr } = await context.supabase
      .from("member_storefront_pages")
      .select("id, content_json, applied_template_id")
      .eq("member_id", context.userId)
      .maybeSingle();
    if (pageErr) throw new Error(pageErr.message);
    if (!page?.applied_template_id) throw new Error("目前沒有套用中的管理員版模");

    const { data: tpl, error: tplErr } = await context.supabase
      .from("member_storefront_templates")
      .select("id, name, description, is_active")
      .eq("id", page.applied_template_id)
      .maybeSingle();
    if (tplErr) throw new Error(tplErr.message);
    if (!tpl || !tpl.is_active) throw new Error("版模不存在或已停用");

    const content = mergeTemplateMetadataIntoContent(page.content_json ?? {}, tpl);
    const { error } = await context.supabase
      .from("member_storefront_pages")
      .update({ content_json: content })
      .eq("id", page.id)
      .eq("member_id", context.userId);
    if (error) throw new Error(error.message);
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

export const unpublishMyStorefrontPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("member_storefront_pages")
      .update({ published_at: null })
      .eq("member_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });


// ============= Member custom templates =============

const customInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  cover_image: z.string().trim().max(500).optional().or(z.literal("")),
  content_json: z.any().optional(),
  sort_order: z.number().int().min(0).max(99999).default(0),
  is_active: z.boolean().default(true),
});

export const listMyCustomTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("member_storefront_custom_templates")
      .select("*")
      .eq("member_id", context.userId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createMyCustomTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => customInputSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("member_storefront_custom_templates")
      .insert({
        member_id: context.userId,
        name: data.name.trim(),
        description: data.description?.trim() || null,
        cover_image: data.cover_image?.trim() || null,
        content_json: data.content_json ?? {},
        sort_order: data.sort_order,
        is_active: data.is_active,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateMyCustomTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    customInputSchema.partial().extend({ id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { id, ...rest } = data;
    const payload: Record<string, unknown> = {};
    if (rest.name !== undefined) payload.name = rest.name.trim();
    if (rest.description !== undefined) payload.description = rest.description?.trim() || null;
    if (rest.cover_image !== undefined) payload.cover_image = rest.cover_image?.trim() || null;
    if (rest.content_json !== undefined) payload.content_json = rest.content_json;
    if (rest.sort_order !== undefined) payload.sort_order = rest.sort_order;
    if (rest.is_active !== undefined) payload.is_active = rest.is_active;
    const { data: row, error } = await context.supabase
      .from("member_storefront_custom_templates")
      .update(payload as any)
      .eq("id", id)
      .eq("member_id", context.userId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteMyCustomTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("member_storefront_custom_templates")
      .delete()
      .eq("id", data.id)
      .eq("member_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const applyMyCustomTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: tpl, error: tplErr } = await context.supabase
      .from("member_storefront_custom_templates")
      .select("id, content_json, member_id")
      .eq("id", data.id)
      .eq("member_id", context.userId)
      .maybeSingle();
    if (tplErr) throw new Error(tplErr.message);
    if (!tpl) throw new Error("找不到自訂版模");

    const deepCopied = JSON.parse(JSON.stringify(tpl.content_json ?? {}));

    const { data: existing } = await context.supabase
      .from("member_storefront_pages")
      .select("id")
      .eq("member_id", context.userId)
      .maybeSingle();

    if (existing) {
      const { error } = await context.supabase
        .from("member_storefront_pages")
        .update({ content_json: deepCopied, applied_template_id: null })
        .eq("member_id", context.userId);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await context.supabase
        .from("member_storefront_pages")
        .insert({ member_id: context.userId, content_json: deepCopied, applied_template_id: null });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const saveCurrentPageAsCustomTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      name: z.string().trim().min(1).max(120),
      description: z.string().trim().max(2000).optional().or(z.literal("")),
      cover_image: z.string().trim().max(500).optional().or(z.literal("")),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: page, error: pageErr } = await context.supabase
      .from("member_storefront_pages")
      .select("content_json")
      .eq("member_id", context.userId)
      .maybeSingle();
    if (pageErr) throw new Error(pageErr.message);
    const content = JSON.parse(JSON.stringify(page?.content_json ?? {}));
    const { data: row, error } = await context.supabase
      .from("member_storefront_custom_templates")
      .insert({
        member_id: context.userId,
        name: data.name.trim(),
        description: data.description?.trim() || null,
        cover_image: data.cover_image?.trim() || null,
        content_json: content,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });
