import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const ADMIN_ROLES = ["super_admin", "admin"] as const;
const SECTION_TYPES = ["wholesale", "patent", "news", "health", "academy"] as const;

const PUBLIC_COLUMNS =
  "id,section_type,title,slug,summary,cover_image,images,content_json,content_html,external_url,sort_order,is_published,published_at,updated_at";

function publicDb() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
  ) as any;
}


const jsonRecord = z.record(z.unknown());

const listPublicSchema = z.object({
  section_type: z.enum(SECTION_TYPES).optional(),
  limit: z.number().int().min(1).max(100).optional().default(50),
});

const getBySlugSchema = z.object({
  slug: z.string().trim().min(1).max(120),
});

const upsertSchema = z.object({
  id: z.string().uuid().optional(),
  section_type: z.enum(SECTION_TYPES),
  title: z.string().trim().min(1).max(160),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9-]{1,78}[a-z0-9]$/, "網址代稱需為 3-80 字元，可含小寫英文、數字與 -"),
  summary: z.string().trim().max(500).nullable().optional(),
  cover_image: z.string().trim().max(1000).nullable().optional(),
  images: z.array(z.string().trim().min(1).max(1000)).max(7).default([]),
  content_json: jsonRecord.default({}),
  content_html: z.string().max(30000).nullable().optional(),
  external_url: z.string().trim().max(1000).nullable().optional(),
  sort_order: z.number().int().min(0).max(9999).default(0),
  is_published: z.boolean().default(false),
});

const idSchema = z.object({
  id: z.string().uuid(),
});

const reorderSchema = z.object({
  items: z
    .array(
      z.object({
        id: z.string().uuid(),
        sort_order: z.number().int().min(0).max(9999),
      }),
    )
    .max(100),
});

function db() {
  return supabaseAdmin as any;
}

function nullIfEmpty(value: string | null | undefined) {
  const text = value?.trim();
  return text ? text : null;
}

async function assertAdmin(userId: string) {
  const { data, error } = await db()
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", [...ADMIN_ROLES]);
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("需要 admin 或 super_admin 權限");
}

export const listPublicShopContentPages = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => listPublicSchema.parse(input ?? {}))
  .handler(async ({ data }) => {
    let query = publicDb()
      .from("shop_content_pages")
      .select(PUBLIC_COLUMNS)
      .eq("is_published", true)
      .order("sort_order", { ascending: true })
      .order("published_at", { ascending: false })
      .limit(data.limit);

    if (data.section_type) {
      query = query.eq("section_type", data.section_type);
    }

    const { data: pages, error } = await query;
    if (error) throw new Error(error.message);
    return { pages: pages ?? [] };
  });

export const getPublicShopContentPage = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => getBySlugSchema.parse(input))
  .handler(async ({ data }) => {
    const { data: page, error } = await publicDb()
      .from("shop_content_pages")
      .select(PUBLIC_COLUMNS)
      .eq("slug", data.slug)
      .eq("is_published", true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!page) throw new Error("找不到內容或尚未發布");
    // Sanitize admin-authored HTML server-side to prevent stored XSS on the public storefront.
    // Use a lightweight regex-based sanitizer (edge/Worker-safe — no jsdom dependency).
    if ((page as any).content_html) {
      (page as any).content_html = sanitizeHtml((page as any).content_html);
    }

    return { page };
  });

export const adminListShopContentPages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { data, error } = await db()
      .from("shop_content_pages")
      .select("*")
      .order("section_type", { ascending: true })
      .order("sort_order", { ascending: true })
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { pages: data ?? [] };
  });

export const upsertShopContentPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => upsertSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const payload = {
      section_type: data.section_type,
      title: data.title,
      slug: data.slug,
      summary: nullIfEmpty(data.summary),
      cover_image: nullIfEmpty(data.cover_image),
      images: (data.images ?? []).map((s) => s.trim()).filter(Boolean).slice(0, 7),
      content_json: data.content_json ?? {},
      content_html: nullIfEmpty(data.content_html),
      external_url: nullIfEmpty(data.external_url),
      sort_order: Number(data.sort_order) || 0,
      is_published: data.is_published,
      updated_by: context.userId,
      ...(data.is_published ? { published_at: new Date().toISOString() } : {}),
      ...(!data.id ? { created_by: context.userId } : {}),
    };

    const query = data.id
      ? db().from("shop_content_pages").update(payload).eq("id", data.id).select("*").single()
      : db().from("shop_content_pages").insert(payload).select("*").single();

    const { data: page, error } = await query;
    if (error) {
      if (String(error.message).includes("duplicate key")) {
        throw new Error("同分類下的網址代稱已存在，請更換 slug");
      }
      throw new Error(error.message);
    }
    return { page };
  });

export const deleteShopContentPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => idSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await db().from("shop_content_pages").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const reorderShopContentPages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => reorderSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    for (const item of data.items) {
      const { error } = await db()
        .from("shop_content_pages")
        .update({ sort_order: item.sort_order, updated_by: context.userId })
        .eq("id", item.id);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });
