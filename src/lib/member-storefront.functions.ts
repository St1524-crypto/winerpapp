import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const PAGE_TEMPLATES = ["A", "B", "C", "D"] as const;

const urlSchema = z.string().trim().url().max(500).optional().or(z.literal(""));

const profileSchema = z.object({
  profile_avatar: z.string().trim().max(500).optional().or(z.literal("")),
  profile_cover: z.string().trim().max(500).optional().or(z.literal("")),
  brand_name: z.string().trim().max(80).optional().or(z.literal("")),
  brand_intro: z.string().trim().max(1200).optional().or(z.literal("")),
  line_url: urlSchema,
  facebook_url: urlSchema,
  instagram_url: urlSchema,
  youtube_url: urlSchema,
  page_template: z.enum(PAGE_TEMPLATES),
});

const featuredSchema = z.object({
  productIds: z.array(z.string().uuid()).max(20),
});

const httpUrlSchema = z
  .string()
  .trim()
  .max(500)
  .regex(/^https?:\/\//i, "URL must start with http:// or https://")
  .optional()
  .or(z.literal(""));

const customProductSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1200).optional().or(z.literal("")),
  image_url: z.string().trim().max(500).optional().or(z.literal("")),
  video_url: httpUrlSchema,
  purchase_url: httpUrlSchema,
  is_active: z.boolean().default(true),
});

const videoSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(120),
  video_url: z
    .string()
    .trim()
    .min(1)
    .max(500)
    .regex(/^https?:\/\//i, "URL must start with http:// or https://"),
  sort_order: z.number().int().min(0).max(9999).default(0),
});

const idSchema = z.object({ id: z.string().uuid() });

function nullIfEmpty(value: string | null | undefined) {
  const text = value?.trim();
  return text ? text : null;
}

function normalizeProfile(data: z.infer<typeof profileSchema>) {
  return {
    profile_avatar: nullIfEmpty(data.profile_avatar),
    profile_cover: nullIfEmpty(data.profile_cover),
    brand_name: nullIfEmpty(data.brand_name),
    brand_intro: nullIfEmpty(data.brand_intro),
    line_url: nullIfEmpty(data.line_url),
    facebook_url: nullIfEmpty(data.facebook_url),
    instagram_url: nullIfEmpty(data.instagram_url),
    youtube_url: nullIfEmpty(data.youtube_url),
    page_template: data.page_template,
  };
}

function normalizeCustomProduct(data: z.infer<typeof customProductSchema>, memberId: string) {
  return {
    member_id: memberId,
    title: data.title.trim(),
    description: nullIfEmpty(data.description),
    image_url: nullIfEmpty(data.image_url),
    video_url: nullIfEmpty(data.video_url),
    purchase_url: nullIfEmpty(data.purchase_url),
    is_active: data.is_active,
  };
}

function normalizeVideo(data: z.infer<typeof videoSchema>, memberId: string) {
  return {
    member_id: memberId,
    title: data.title.trim(),
    video_url: data.video_url.trim(),
    sort_order: data.sort_order,
  };
}

function applyPublicProfileFilters<T>(query: T): T {
  return (query as any)
    .or("frozen_code.is.null,frozen_code.eq.N")
    .or("member_status.is.null,member_status.eq.active,member_status.eq.正式會員") as T;
}

async function getStorefrontByMember(memberId: string) {
  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, name, display_name, member_no, marketing_slug, avatar_url, profile_avatar, profile_cover, brand_name, brand_intro, line_url, facebook_url, instagram_url, youtube_url, page_template, is_vip")
    .eq("id", memberId)
    .maybeSingle();
  if (profileError) throw new Error(profileError.message);
  if (!profile) return null;

  const [featuredRes, customRes, videosRes] = await Promise.all([
    supabaseAdmin
      .from("member_featured_products")
      .select("id, product_id, sort_order, products(id, sku, name, category, price, stock, image, created_at, short_description, description, category_id, safe_stock, status, featured, updated_at, company_id, reward_points, discount_points_max, specs)")
      .eq("member_id", memberId)
      .order("sort_order", { ascending: true })
      .limit(20),
    supabaseAdmin
      .from("member_custom_products")
      .select("*")
      .eq("member_id", memberId)
      .eq("is_active", true)
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("member_videos")
      .select("*")
      .eq("member_id", memberId)
      .order("sort_order", { ascending: true }),
  ]);

  if (featuredRes.error) throw new Error(featuredRes.error.message);
  if (customRes.error) throw new Error(customRes.error.message);
  if (videosRes.error) throw new Error(videosRes.error.message);

  const featuredProducts = ((featuredRes.data ?? []) as any[])
    .map((row) => ({ ...row.products, storefront_sort_order: row.sort_order }))
    .filter((product) => product?.id && product.status === "active");

  const { data: publishedPage, error: pageError } = await supabaseAdmin
    .from("member_storefront_pages")
    .select("content_json, published_at")
    .eq("member_id", memberId)
    .not("published_at", "is", null)
    .maybeSingle();
  if (pageError) throw new Error(pageError.message);

  return {
    profile,
    featuredProducts,
    customProducts: customRes.data ?? [],
    videos: videosRes.data ?? [],
    publishedPage: publishedPage ?? null,
  };
}

export const getMemberStorefront = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ memberNo: z.string().trim().min(2).max(80) }).parse(d))
  .handler(async ({ data }) => {
    const raw = data.memberNo.trim();
    const upper = raw.toUpperCase();

    let profile: { id: string } | null = null;
    const { data: byNo, error: byNoError } = await applyPublicProfileFilters(supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("member_no", upper)
    )
      .limit(1)
      .maybeSingle();
    if (byNoError) throw new Error(byNoError.message);
    profile = byNo;

    if (!profile) {
      const { data: bySlug, error: bySlugError } = await applyPublicProfileFilters(supabaseAdmin
        .from("profiles")
        .select("id")
        .ilike("marketing_slug", raw)
      )
        .limit(1)
        .maybeSingle();
      if (bySlugError) throw new Error(bySlugError.message);
      profile = bySlug;
    }

    if (!profile) {
      const { data: byReferralCode, error: byReferralCodeError } = await applyPublicProfileFilters(supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("referral_code", upper)
      )
        .limit(1)
        .maybeSingle();
      if (byReferralCodeError) throw new Error(byReferralCodeError.message);
      profile = byReferralCode;
    }

    if (!profile && /^[0-9+\-\s()]{6,20}$/.test(raw)) {
      const digits = raw.replace(/\D/g, "");
      const { data: byPhone, error: byPhoneError } = await applyPublicProfileFilters(supabaseAdmin
        .from("profiles")
        .select("id")
        .eq("phone", digits)
      )
        .limit(1)
        .maybeSingle();
      if (byPhoneError) throw new Error(byPhoneError.message);
      profile = byPhone;
    }

    if (!profile?.id) return { found: false as const };

    const storefront = await getStorefrontByMember(profile.id);
    if (!storefront) return { found: false as const };
    return { found: true as const, ...storefront };
  });

export const getMyStorefrontManagerData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const storefront = await getStorefrontByMember(context.userId);
    if (!storefront) throw new Error("Profile not found");

    const { data: products, error } = await supabaseAdmin
      .from("products")
      .select("id, sku, name, price, stock, image, status")
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);

    const { data: page, error: pageError } = await supabaseAdmin
      .from("member_storefront_pages")
      .select("id, content_json, applied_template_id, published_at, created_at, updated_at")
      .eq("member_id", context.userId)
      .maybeSingle();
    if (pageError) throw new Error(pageError.message);

    let templateName: string | null = null;
    if (page?.applied_template_id) {
      const { data: tpl } = await supabaseAdmin
        .from("member_storefront_templates")
        .select("name")
        .eq("id", page.applied_template_id)
        .maybeSingle();
      templateName = tpl?.name ?? null;
    }

    return {
      ...storefront,
      products: products ?? [],
      page: page ? { ...page, templateName } : null,
    };
  });

export const saveMyStorefrontProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => profileSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await supabaseAdmin
      .from("profiles")
      .update(normalizeProfile(data))
      .eq("id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const saveMyFeaturedProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => featuredSchema.parse(d))
  .handler(async ({ data, context }) => {
    const rows = data.productIds.slice(0, 20).map((productId, index) => ({
      member_id: context.userId,
      product_id: productId,
      sort_order: index,
    }));

    const { error: deleteError } = await supabaseAdmin
      .from("member_featured_products")
      .delete()
      .eq("member_id", context.userId);
    if (deleteError) throw new Error(deleteError.message);

    if (rows.length) {
      const { error: insertError } = await supabaseAdmin.from("member_featured_products").insert(rows);
      if (insertError) throw new Error(insertError.message);
    }

    return { ok: true, count: rows.length };
  });

export const upsertMyCustomProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => customProductSchema.parse(d))
  .handler(async ({ data, context }) => {
    const payload = normalizeCustomProduct(data, context.userId);
    if (data.id) {
      const { error } = await supabaseAdmin
        .from("member_custom_products")
        .update(payload)
        .eq("id", data.id)
        .eq("member_id", context.userId);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id };
    }

    const { data: row, error } = await supabaseAdmin
      .from("member_custom_products")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: row.id };
  });

export const deleteMyCustomProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await supabaseAdmin
      .from("member_custom_products")
      .delete()
      .eq("id", data.id)
      .eq("member_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const upsertMyStorefrontVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => videoSchema.parse(d))
  .handler(async ({ data, context }) => {
    const payload = normalizeVideo(data, context.userId);
    if (data.id) {
      const { error } = await supabaseAdmin
        .from("member_videos")
        .update(payload)
        .eq("id", data.id)
        .eq("member_id", context.userId);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id };
    }

    const { data: row, error } = await supabaseAdmin
      .from("member_videos")
      .insert(payload)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: row.id };
  });

export const deleteMyStorefrontVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => idSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await supabaseAdmin
      .from("member_videos")
      .delete()
      .eq("id", data.id)
      .eq("member_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
