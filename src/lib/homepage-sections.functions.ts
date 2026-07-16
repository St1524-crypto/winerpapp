import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ADMIN_ROLES = ["super_admin", "admin"] as const;
const SECTION_TYPES = ["limited_offer", "bundle", "featured", "best_seller", "new_arrival"] as const;

const SAFE_PRODUCT_COLUMNS =
  "id, sku, name, category, price, stock, image, created_at, short_description, description, category_id, safe_stock, status, featured, updated_at, company_id, reward_points, discount_points_max, specs, wholesale_only";

const jsonRecord = z.record(z.unknown());
const optionalTimestamp = z.string().trim().min(1).max(80).nullable().optional();

const sectionSchema = z.object({
  id: z.string().uuid().optional(),
  section_type: z.enum(SECTION_TYPES).optional(),
  title: z.string().trim().min(1).max(120),
  subtitle: z.string().trim().max(300).nullable().optional(),
  is_active: z.boolean().default(true),
  sort_order: z.number().int().min(0).max(9999).default(0),
  display_limit: z.number().int().min(1).max(48).default(8),
  config_json: jsonRecord.default({}),
});

const sectionProductSchema = z.object({
  id: z.string().uuid().optional(),
  section_id: z.string().uuid(),
  product_id: z.string().uuid(),
  sort_order: z.number().int().min(0).max(9999).default(0),
  is_active: z.boolean().default(true),
  starts_at: optionalTimestamp,
  ends_at: optionalTimestamp,
  config_json: jsonRecord.default({}),
});

const removeSectionProductSchema = z.object({
  id: z.string().uuid(),
});

const reorderItemsSchema = z.object({
  items: z.array(
    z.object({
      id: z.string().uuid(),
      sort_order: z.number().int().min(0).max(9999),
    }),
  ).max(100),
});

const reorderSectionProductsSchema = reorderItemsSchema.extend({
  sectionId: z.string().uuid(),
});

const searchProductsSchema = z.object({
  query: z.string().trim().max(80).optional().default(""),
  limit: z.number().int().min(1).max(50).optional().default(20),
});

type ProductRow = Record<string, unknown> & { id?: string; status?: string };
type SectionProductRow = {
  id: string;
  section_id: string;
  product_id: string;
  sort_order: number;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  config_json: Record<string, unknown> | null;
  product?: ProductRow | ProductRow[] | null;
  products?: ProductRow | ProductRow[] | null;
};

let _adminPromise: Promise<any> | null = null;
async function db(): Promise<any> {
  if (!_adminPromise) {
    _adminPromise = import("@/integrations/supabase/client.server").then((m) => m.supabaseAdmin);
  }
  return _adminPromise;
}

let _publicClient: any = null;
async function dbPublic(): Promise<any> {
  if (_publicClient) return _publicClient;
  const { createClient } = await import("@supabase/supabase-js");
  _publicClient = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
  );
  return _publicClient;
}

function nullIfEmpty(value: string | null | undefined) {
  const text = value?.trim();
  return text ? text : null;
}

function activeNowFilter<T>(query: T): T {
  return (query as any)
    .eq("is_active", true)
    .or("starts_at.is.null,starts_at.lte.now()")
    .or("ends_at.is.null,ends_at.gte.now()") as T;
}

function pickProduct(row: SectionProductRow): ProductRow | null {
  const source = row.product ?? row.products;
  if (Array.isArray(source)) return (source[0] ?? null) as ProductRow | null;
  return (source ?? null) as ProductRow | null;
}

function normalizeSectionProduct(row: SectionProductRow, excludeWholesaleOnly = false) {
  const product = pickProduct(row);
  if (!product?.id || product.status !== "active") return null;
  if (excludeWholesaleOnly && (product as any).wholesale_only === true) return null;

  return {
    id: row.id,
    section_id: row.section_id,
    product_id: row.product_id,
    sort_order: row.sort_order,
    is_active: row.is_active,
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    config_json: row.config_json ?? {},
    product,
  };
}

async function assertAdmin(userId: string) {
  const { data, error } = await (await db())
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", [...ADMIN_ROLES]);
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("需要 admin 或 super_admin 權限");
}

async function loadSectionProducts(sectionIds: string[], includeInactive = false, client?: any) {
  if (!sectionIds.length) return new Map<string, ReturnType<typeof normalizeSectionProduct>[]>();

  const c = client ?? (await db());
  let query = c
    .from("homepage_section_products")
    .select(`id, section_id, product_id, sort_order, is_active, starts_at, ends_at, config_json, product:products(${SAFE_PRODUCT_COLUMNS})`)
    .in("section_id", sectionIds)
    .order("sort_order", { ascending: true });

  if (!includeInactive) query = activeNowFilter(query);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  // Public callers (includeInactive=false) must not surface wholesale-only products
  const excludeWholesaleOnly = !includeInactive;

  const grouped = new Map<string, ReturnType<typeof normalizeSectionProduct>[]>();
  for (const row of (data ?? []) as SectionProductRow[]) {
    const normalized = normalizeSectionProduct(row, excludeWholesaleOnly);
    if (!normalized) continue;
    const list = grouped.get(row.section_id) ?? [];
    list.push(normalized);
    grouped.set(row.section_id, list);
  }

  return grouped;
}

export const listPublicHomepageSections = createServerFn({ method: "GET" }).handler(async () => {
  const client = await dbPublic();
  const { data: sections, error } = await client
    .from("homepage_sections")
    .select("id, section_type, title, subtitle, is_active, sort_order, display_limit, config_json, created_at, updated_at")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (error) throw new Error(error.message);

  const sectionRows = sections ?? [];
  const productsBySection = await loadSectionProducts(sectionRows.map((section: any) => section.id), false, client);

  return {
    sections: sectionRows.map((section: any) => ({
      ...section,
      config_json: section.config_json ?? {},
      products: (productsBySection.get(section.id) ?? []).slice(0, Number(section.display_limit) || 8),
    })),
  };
});

export const adminListHomepageSections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);

    const { data: sections, error } = await (await db())
      .from("homepage_sections")
      .select("*")
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);

    const sectionRows = sections ?? [];
    const productsBySection = await loadSectionProducts(sectionRows.map((section: any) => section.id), true);

    return {
      sections: sectionRows.map((section: any) => ({
        ...section,
        config_json: section.config_json ?? {},
        products: productsBySection.get(section.id) ?? [],
      })),
    };
  });

export const upsertHomepageSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => sectionSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    const payload = {
      section_type: data.section_type,
      title: data.title.trim(),
      subtitle: nullIfEmpty(data.subtitle),
      is_active: data.is_active,
      sort_order: data.sort_order,
      display_limit: data.display_limit,
      config_json: data.config_json,
    };

    if (data.id) {
      const { data: section, error } = await (await db())
        .from("homepage_sections")
        .update(payload)
        .eq("id", data.id)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return { ok: true, section };
    }

    if (!data.section_type) throw new Error("新增首頁區塊時必須指定 section_type");

    const { data: section, error } = await (await db())
      .from("homepage_sections")
      .insert(payload)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, section };
  });

export const upsertHomepageSectionProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => sectionProductSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    const payload = {
      section_id: data.section_id,
      product_id: data.product_id,
      sort_order: data.sort_order,
      is_active: data.is_active,
      starts_at: nullIfEmpty(data.starts_at),
      ends_at: nullIfEmpty(data.ends_at),
      config_json: data.config_json,
    };

    if (data.id) {
      const { data: item, error } = await (await db())
        .from("homepage_section_products")
        .update(payload)
        .eq("id", data.id)
        .select("*")
        .single();
      if (error) throw new Error(error.message);
      return { ok: true, item };
    }

    const { data: item, error } = await (await db())
      .from("homepage_section_products")
      .upsert(payload, { onConflict: "section_id,product_id" })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, item };
  });

export const removeHomepageSectionProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => removeSectionProductSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    const { error } = await (await db())
      .from("homepage_section_products")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const reorderHomepageSections = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => reorderItemsSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    const client = await db();
    const updates = await Promise.all(
      data.items.map((item) =>
        client
          .from("homepage_sections")
          .update({ sort_order: item.sort_order })
          .eq("id", item.id),
      ),
    );
    const error = updates.find((result: any) => result.error)?.error;
    if (error) throw new Error(error.message);
    return { ok: true, count: data.items.length };
  });

export const reorderHomepageSectionProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => reorderSectionProductsSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    const client2 = await db();
    const updates = await Promise.all(
      data.items.map((item) =>
        client2
          .from("homepage_section_products")
          .update({ sort_order: item.sort_order })
          .eq("id", item.id)
          .eq("section_id", data.sectionId),
      ),
    );
    const error = updates.find((result: any) => result.error)?.error;
    if (error) throw new Error(error.message);
    return { ok: true, count: data.items.length };
  });

export const searchActiveProductsForHomepage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => searchProductsSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    const term = data.query.trim().replace(/[%_,()]/g, " ");
    const pattern = `%${term}%`;
    const baseSelect = `id, sku, name, category, price, stock, image, created_at, short_description, category_id, safe_stock, status, featured, company_id, reward_points, discount_points_max`;

    if (!term) {
      const { data: products, error } = await (await db())
        .from("products")
        .select(baseSelect)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(data.limit);
      if (error) throw new Error(error.message);
      return { products: products ?? [] };
    }

    const client3 = await db();
    const [byName, bySku] = await Promise.all([
      client3
        .from("products")
        .select(baseSelect)
        .eq("status", "active")
        .ilike("name", pattern)
        .order("created_at", { ascending: false })
        .limit(data.limit),
      client3
        .from("products")
        .select(baseSelect)
        .eq("status", "active")
        .ilike("sku", pattern)
        .order("created_at", { ascending: false })
        .limit(data.limit),
    ]);

    if (byName.error) throw new Error(byName.error.message);
    if (bySku.error) throw new Error(bySku.error.message);

    const merged = new Map<string, ProductRow>();
    for (const product of [...(byName.data ?? []), ...(bySku.data ?? [])] as ProductRow[]) {
      if (product.id) merged.set(product.id, product);
    }

    return { products: Array.from(merged.values()).slice(0, data.limit) };
  });
