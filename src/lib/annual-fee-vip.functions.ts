import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function ensureAdmin(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = (data ?? []).map((r: any) => r.role);
  if (!roles.some((r: string) => ["super_admin", "admin"].includes(r))) {
    throw new Error("沒有權限");
  }
}

/** Admin：列出所有年費規則 */
export const adminListAnnualFeeRules = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("annual_fee_vip_rules")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

const ruleSchema = z.object({
  id: z.string().uuid().optional(),
  sku: z.string().min(1),
  upgrade_days: z.number().int().min(1).default(365),
  gift_product_id: z.string().uuid().nullable().optional(),
  gift_quantity: z.number().int().min(0).default(0),
  is_active: z.boolean().default(true),
  notes: z.string().nullable().optional(),
  target_tier_code: z.string().max(8).nullable().optional(),
  reward_points: z.number().int().min(0).default(0),
  show_on_vip_upgrade_page: z.boolean().default(false),
  sort_order: z.number().int().default(0),
});

export const upsertAnnualFeeRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ruleSchema.parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const payload: any = { ...data };
    if (!payload.id) delete payload.id;
    const { data: row, error } = await supabaseAdmin
      .from("annual_fee_vip_rules")
      .upsert(payload, { onConflict: "sku" })
      .select()
      .single();
    if (error) throw error;
    await supabaseAdmin.from("audit_logs").insert({
      user_id: context.userId,
      action: data.id ? "update" : "create",
      entity: "annual_fee_vip_rule",
      entity_id: row.id,
      metadata: { sku: row.sku, upgrade_days: row.upgrade_days },
    });
    return row;
  });

export const toggleAnnualFeeRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid(), is_active: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("annual_fee_vip_rules")
      .update({ is_active: data.is_active })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const deleteAnnualFeeRule = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("annual_fee_vip_rules").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

/** Admin：搜尋商品（用來選贈品） */
export const searchProductsForGift = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ keyword: z.string().default("") }).parse(d))
  .handler(async ({ data, context }) => {
    await ensureAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("products")
      .select("id, sku, name, price, status")
      .eq("status", "active")
      .order("name")
      .limit(20);
    const kw = (data.keyword ?? "").trim();
    if (kw) q = q.or(`name.ilike.%${kw}%,sku.ilike.%${kw}%`);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

/** 前台：列出已上架到 /shop/vip 的年費 VIP 套組（公開，不含敏感欄位） */
export const listPublicAnnualFeeVipPackages = createServerFn({ method: "GET" })
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rules, error } = await supabaseAdmin
      .from("annual_fee_vip_rules")
      .select("id, sku, upgrade_days, target_tier_code, reward_points, gift_product_id, gift_quantity, sort_order, notes")
      .eq("is_active", true)
      .eq("show_on_vip_upgrade_page", true)
      .order("sort_order", { ascending: true });
    if (error) throw error;
    const list = rules ?? [];
    const skus = list.map((r: any) => r.sku).filter(Boolean);
    const giftIds = list.map((r: any) => r.gift_product_id).filter(Boolean);
    const productsRes = skus.length
      ? await supabaseAdmin.from("products").select("id, sku, name, price, image, status").in("sku", skus)
      : { data: [] as any[] };
    const giftsRes = giftIds.length
      ? await supabaseAdmin.from("products").select("id, sku, name, image").in("id", giftIds)
      : { data: [] as any[] };
    const pBySku = new Map((productsRes.data ?? []).map((p: any) => [p.sku, p]));
    const gById = new Map((giftsRes.data ?? []).map((p: any) => [p.id, p]));
    return list.map((r: any) => {
      const product: any = pBySku.get(r.sku) ?? null;
      return {
        id: r.id,
        sku: r.sku,
        upgrade_days: r.upgrade_days,
        target_tier_code: r.target_tier_code,
        reward_points: r.reward_points,
        gift_quantity: r.gift_quantity,
        notes: r.notes,
        product: product && product.status === "active"
          ? { id: product.id, sku: product.sku, name: product.name, price: Number(product.price ?? 0), image: product.image }
          : null,
        gift: r.gift_product_id ? gById.get(r.gift_product_id) ?? null : null,
      };
    });
  });

/**
 * 內部：訂單付款成功後，檢查是否含年費 SKU，若是則自動升級 VIP（冪等）。
 * 由其他 serverFn（確認付款流程）或管理端動作呼叫；
 * 不可在 client 直接呼叫升級任意訂單。
 */
export const processOrderAnnualFeeUpgrade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: order, error: orderErr } = await supabaseAdmin
      .from("sales_orders")
      .select("id, user_id, payment_status, order_no")
      .eq("id", data.orderId)
      .maybeSingle();
    if (orderErr) throw orderErr;
    if (!order) throw new Error("訂單不存在");

    // 授權：admin 或訂單擁有者本人
    const userId = (order as any).user_id as string | null;
    const isOwner = !!userId && userId === context.userId;
    if (!isOwner) {
      await ensureAdmin(context.supabase, context.userId);
    }

    if ((order as any).payment_status !== "paid") {
      return { ok: false, reason: "order_not_paid" };
    }
    if (!userId) return { ok: false, reason: "no_user" };


    const { data: items } = await supabaseAdmin
      .from("sales_order_items")
      .select("sku, quantity")
      .eq("sales_order_id", data.orderId);
    const skus = (items ?? []).map((i: any) => i.sku).filter(Boolean);
    if (skus.length === 0) return { ok: false, reason: "no_items" };

    const { data: rules } = await supabaseAdmin
      .from("annual_fee_vip_rules")
      .select("*")
      .eq("is_active", true)
      .in("sku", skus);
    if (!rules || rules.length === 0) return { ok: false, reason: "no_matching_rule" };

    const results: any[] = [];
    for (const rule of rules as any[]) {
      // 冪等：同一張訂單 + 同一條規則只執行一次
      const { data: existing } = await supabaseAdmin
        .from("annual_fee_upgrade_logs")
        .select("id")
        .eq("sales_order_id", data.orderId)
        .eq("rule_id", rule.id)
        .maybeSingle();
      if (existing) {
        results.push({ rule_id: rule.id, skipped: "already_processed" });
        continue;
      }

      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("vip_expires_at, is_vip")
        .eq("id", userId)
        .maybeSingle();
      const now = new Date();
      const base =
        (profile as any)?.vip_expires_at && new Date((profile as any).vip_expires_at) > now
          ? new Date((profile as any).vip_expires_at)
          : now;
      const before = (profile as any)?.vip_expires_at ?? null;
      const after = new Date(base.getTime() + rule.upgrade_days * 86400000);

      const { error: upErr } = await supabaseAdmin
        .from("profiles")
        .update({ is_vip: true, vip_expires_at: after.toISOString() })
        .eq("id", userId);
      if (upErr) throw upErr;

      await supabaseAdmin.from("annual_fee_upgrade_logs").insert({
        sales_order_id: data.orderId,
        user_id: userId,
        sku: rule.sku,
        rule_id: rule.id,
        upgrade_days: rule.upgrade_days,
        vip_expires_before: before,
        vip_expires_after: after.toISOString(),
        gift_product_id: rule.gift_product_id,
        gift_quantity: rule.gift_quantity ?? 0,
        status: "applied",
        notes: isOwner ? `會員 ${context.userId} 於前台付款後自動升級` : `由管理員 ${context.userId} 確認付款後升級`,

      });

      await supabaseAdmin.from("audit_logs").insert({
        user_id: context.userId,
        action: "annual_fee_vip_upgrade",
        entity: "sales_orders",
        entity_id: data.orderId,
        metadata: {
          order_no: (order as any).order_no,
          target_user: userId,
          sku: rule.sku,
          upgrade_days: rule.upgrade_days,
          vip_expires_before: before,
          vip_expires_after: after.toISOString(),
        },
      });

      // 發放獎勵點（若規則有設定）
      let grantedPoints = 0;
      const pts = Number((rule as any).reward_points ?? 0);
      if (pts > 0) {
        await supabaseAdmin
          .from("member_points_wallet")
          .upsert(
            { user_id: userId, reward_points: pts },
            { onConflict: "user_id", ignoreDuplicates: false },
          );
        // 確保是累加：再用 rpc-style 累加（upsert 會覆寫，改用先 select 再 update）
        const { data: w } = await supabaseAdmin
          .from("member_points_wallet")
          .select("reward_points")
          .eq("user_id", userId)
          .maybeSingle();
        const curr = Number((w as any)?.reward_points ?? 0);
        // 若 upsert 已新建為 pts，本次累加只需保證至少為 pts；若已存在更高值則重置為 curr（避免覆寫舊值）
        // 安全作法：以 logs 為唯一加總來源
        await supabaseAdmin.from("reward_wallet_logs").insert({
          member_id: userId,
          points: pts,
          type: "earn",
          description: `年費商品自動升級 VIP 獎勵 (SKU ${rule.sku})`,
        });
        // 重新依 logs 結算錢包（防止 race 重複計算）
        const { data: sum } = await supabaseAdmin
          .from("reward_wallet_logs")
          .select("points")
          .eq("member_id", userId);
        const total = (sum ?? []).reduce((s: number, r: any) => s + Number(r.points ?? 0), 0);
        await supabaseAdmin
          .from("member_points_wallet")
          .upsert(
            { user_id: userId, reward_points: total },
            { onConflict: "user_id" },
          );
        grantedPoints = pts;
        void curr;
      }

      results.push({
        rule_id: rule.id,
        applied: true,
        vip_expires_after: after.toISOString(),
        granted_reward_points: grantedPoints,
        gift_product_id: rule.gift_product_id,
        gift_quantity: rule.gift_quantity ?? 0,
      });
    }

    return { ok: true, results };
  });
