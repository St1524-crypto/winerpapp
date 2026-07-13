import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const RETURN_ADMIN_ROLES = ["super_admin", "admin", "finance"] as const;
const RETURN_STATUSES = ["draft", "submitted", "approved", "completed", "cancelled"] as const;
const RETURN_TYPES = ["partial_return", "full_return", "exchange", "refund_only"] as const;
const INVENTORY_ACTIONS = ["restock", "scrap", "no_stock_change"] as const;

const StatusSchema = z.enum(RETURN_STATUSES);
const db = supabaseAdmin as any;

type ReturnStatus = (typeof RETURN_STATUSES)[number];

async function assertReturnAdmin(userId: string) {
  const { data, error } = await db
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", RETURN_ADMIN_ROLES as unknown as string[]);

  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    throw new Error("沒有權限管理退貨單。");
  }
}

function todayCompact() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, "");
}

function makeReturnNo() {
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `SR-${todayCompact()}-${suffix}`;
}

function asNumber(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function asInt(value: unknown) {
  const n = Math.floor(Number(value ?? 0));
  return Number.isFinite(n) ? n : 0;
}

function statusPatch(status: ReturnStatus, userId: string) {
  const now = new Date().toISOString();
  if (status === "submitted") return { submitted_by: userId, submitted_at: now };
  if (status === "approved") return { approved_by: userId, approved_at: now };
  if (status === "completed") return { completed_by: userId, completed_at: now };
  if (status === "cancelled") return { cancelled_by: userId, cancelled_at: now };
  return {};
}

async function writeAudit(userId: string, action: string, entityId: string, metadata: Record<string, unknown>) {
  const { error } = await db.from("audit_logs").insert({
    user_id: userId,
    action,
    entity: "sales_returns",
    entity_id: entityId,
    metadata,
  });

  if (error) {
    console.warn("[sales-returns] audit log write failed", error.message);
  }
}

const ListSchema = z.object({
  status: z.enum([...RETURN_STATUSES, "all"]).optional().default("all"),
  query: z.string().trim().max(80).optional().default(""),
  limit: z.number().int().min(1).max(500).optional().default(100),
});

export const adminListSalesReturns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ListSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertReturnAdmin(context.userId);

    let query = db
      .from("sales_returns")
      .select(
        "id, return_no, sales_order_id, company_id, status, return_type, reason, subtotal, refund_amount, points_reverse_status, inventory_status, created_by, approved_by, completed_by, created_at, updated_at",
      )
      .order("created_at", { ascending: false })
      .limit(data.limit);

    if (data.status !== "all") query = query.eq("status", data.status);
    const keyword = data.query.trim();
    if (keyword) {
      const escaped = keyword.replace(/[%_]/g, "\\$&");
      query = query.or(`return_no.ilike.%${escaped}%,reason.ilike.%${escaped}%`);
    }

    const { data: returns, error } = await query;
    if (error) throw new Error(error.message);

    const orderIds = Array.from(new Set((returns ?? []).map((row: any) => row.sales_order_id).filter(Boolean)));
    const companyIds = Array.from(new Set((returns ?? []).map((row: any) => row.company_id).filter(Boolean)));

    const [{ data: orders }, { data: companies }] = await Promise.all([
      orderIds.length
        ? db
            .from("sales_orders")
            .select("id, order_no, customer_name, customer_phone, total_amount, payment_status, order_status, user_id")
            .in("id", orderIds)
        : Promise.resolve({ data: [] }),
      companyIds.length
        ? db.from("companies").select("id, company_name, slug").in("id", companyIds)
        : Promise.resolve({ data: [] }),
    ]);

    const orderMap = new Map((orders ?? []).map((order: any) => [order.id, order]));
    const companyMap = new Map((companies ?? []).map((company: any) => [company.id, company]));

    return (returns ?? []).map((row: any) => ({
      ...row,
      order: orderMap.get(row.sales_order_id) ?? null,
      company: companyMap.get(row.company_id) ?? null,
    }));
  });

const DetailSchema = z.object({ id: z.string().uuid() });

export const adminGetSalesReturnDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => DetailSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertReturnAdmin(context.userId);

    const { data: salesReturn, error } = await db.from("sales_returns").select("*").eq("id", data.id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!salesReturn) throw new Error("找不到退貨單。");

    const [{ data: items }, { data: order }, { data: pointReversals }] = await Promise.all([
      db.from("sales_return_items").select("*").eq("sales_return_id", data.id).order("created_at", { ascending: true }),
      db.from("sales_orders").select("*").eq("id", salesReturn.sales_order_id).maybeSingle(),
      db
        .from("point_transactions")
        .select("*")
        .eq("reference_id", data.id)
        .eq("source", "sales_return_reverse")
        .order("created_at", { ascending: true }),
    ]);

    const orderItemIds = (items ?? []).map((item: any) => item.sales_order_item_id).filter(Boolean);
    const { data: originalItems } = orderItemIds.length
      ? await db.from("sales_order_items").select("*").in("id", orderItemIds)
      : { data: [] };

    return {
      salesReturn,
      items: items ?? [],
      order: order ?? null,
      originalItems: originalItems ?? [],
      pointReversals: pointReversals ?? [],
    };
  });

const CreateItemSchema = z.object({
  sales_order_item_id: z.string().uuid(),
  quantity: z.number().int().min(1),
  inventory_action: z.enum(INVENTORY_ACTIONS).optional().default("restock"),
  reason: z.string().trim().max(500).optional(),
  condition_note: z.string().trim().max(500).optional(),
});

const CreateSchema = z.object({
  sales_order_id: z.string().uuid(),
  return_type: z.enum(RETURN_TYPES).optional().default("partial_return"),
  reason: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(1000).optional(),
  items: z.array(CreateItemSchema).min(1, "請至少選擇一筆退貨明細。").max(100),
});

export const adminCreateSalesReturn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertReturnAdmin(context.userId);

    const { data: order, error: orderError } = await db
      .from("sales_orders")
      .select("id, order_no, user_id, company_id, total_amount, order_status, payment_status")
      .eq("id", data.sales_order_id)
      .maybeSingle();
    if (orderError) throw new Error(orderError.message);
    if (!order) throw new Error("找不到原始訂單。");

    const requestedIds = Array.from(new Set(data.items.map((item) => item.sales_order_item_id)));
    const { data: orderItems, error: itemsError } = await db
      .from("sales_order_items")
      .select("id, sales_order_id, product_id, product_name, sku, unit_price, quantity, subtotal")
      .in("id", requestedIds);
    if (itemsError) throw new Error(itemsError.message);

    const itemMap = new Map((orderItems ?? []).map((item: any) => [item.id, item]));
    let subtotal = 0;
    const lines = data.items.map((item) => {
      const original = itemMap.get(item.sales_order_item_id);
      if (!original) throw new Error("選擇的訂單明細不存在。");
      if (original.sales_order_id !== data.sales_order_id) throw new Error("選擇的明細不屬於此訂單。");
      if (item.quantity > asInt(original.quantity)) {
        throw new Error(`「${original.product_name}」退貨數量不可超過原訂單數量。`);
      }

      const unitPrice = asNumber(original.unit_price);
      const lineSubtotal = Math.round(item.quantity * unitPrice * 100) / 100;
      subtotal += lineSubtotal;
      return {
        sales_order_item_id: item.sales_order_item_id,
        product_id: original.product_id,
        product_name: original.product_name,
        sku: original.sku,
        quantity: item.quantity,
        unit_price: unitPrice,
        subtotal: lineSubtotal,
        inventory_action: item.inventory_action,
        reason: item.reason ?? null,
        condition_note: item.condition_note ?? null,
      };
    });

    let insertedReturn: any | null = null;
    for (let attempt = 0; attempt < 3 && !insertedReturn; attempt += 1) {
      const { data: row, error } = await db
        .from("sales_returns")
        .insert({
          return_no: makeReturnNo(),
          sales_order_id: data.sales_order_id,
          company_id: order.company_id ?? null,
          status: "draft",
          return_type: data.return_type,
          reason: data.reason ?? null,
          notes: data.notes ?? null,
          subtotal,
          refund_amount: subtotal,
          created_by: context.userId,
        })
        .select("*")
        .single();

      if (!error) insertedReturn = row;
      else if (!String(error.message).includes("duplicate key")) throw new Error(error.message);
    }
    if (!insertedReturn) throw new Error("建立退貨單編號失敗，請再試一次。");

    const { error: insertItemsError } = await db.from("sales_return_items").insert(
      lines.map((line) => ({
        ...line,
        sales_return_id: insertedReturn.id,
      })),
    );
    if (insertItemsError) {
      await db.from("sales_returns").delete().eq("id", insertedReturn.id);
      throw new Error(insertItemsError.message);
    }

    await writeAudit(context.userId, "sales_return_created", insertedReturn.id, {
      sales_order_id: data.sales_order_id,
      return_no: insertedReturn.return_no,
      item_count: lines.length,
      subtotal,
    });

    return { ok: true, salesReturn: insertedReturn };
  });

const UpdateStatusSchema = z.object({
  id: z.string().uuid(),
  status: StatusSchema,
  note: z.string().trim().max(500).optional(),
});

export const adminUpdateSalesReturnStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => UpdateStatusSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertReturnAdmin(context.userId);

    const { data: current, error: getError } = await db.from("sales_returns").select("*").eq("id", data.id).maybeSingle();
    if (getError) throw new Error(getError.message);
    if (!current) throw new Error("找不到退貨單。");
    if (current.status === "completed") throw new Error("已完成的退貨單不可再變更狀態。");
    if (current.status === "cancelled") throw new Error("已取消的退貨單不可再變更狀態。");
    if (data.status === "completed") {
      throw new Error("請使用「套用退貨效果」完成庫存與獎勵點處理，不可直接改為完成。");
    }

    const patch = {
      status: data.status,
      notes: data.note ? `${current.notes ? `${current.notes}\n` : ""}${data.note}` : current.notes,
      ...statusPatch(data.status, context.userId),
    };

    const { data: updated, error } = await db.from("sales_returns").update(patch).eq("id", data.id).select("*").single();
    if (error) throw new Error(error.message);

    await writeAudit(context.userId, "sales_return_status_updated", data.id, {
      from: current.status,
      to: data.status,
      note: data.note ?? null,
    });

    return { ok: true, salesReturn: updated };
  });

const ApplySchema = z.object({
  id: z.string().uuid(),
  note: z.string().trim().max(500).optional(),
});

export const adminApplySalesReturnEffects = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ApplySchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertReturnAdmin(context.userId);

    const { data: salesReturn, error: returnError } = await db
      .from("sales_returns")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (returnError) throw new Error(returnError.message);
    if (!salesReturn) throw new Error("找不到退貨單。");
    if (salesReturn.status === "cancelled") throw new Error("已取消的退貨單不可套用效果。");

    const alreadyInventory = salesReturn.inventory_status === "processed" || salesReturn.inventory_status === "skipped";
    const alreadyPoints = salesReturn.points_reverse_status === "processed" || salesReturn.points_reverse_status === "skipped";
    if (salesReturn.status === "completed" && alreadyInventory && alreadyPoints) {
      return { ok: true, skipped: "already_applied" };
    }

    const [{ data: items }, { data: order }] = await Promise.all([
      db.from("sales_return_items").select("*").eq("sales_return_id", data.id),
      db.from("sales_orders").select("id, order_no, user_id, company_id").eq("id", salesReturn.sales_order_id).maybeSingle(),
    ]);
    if (!order) throw new Error("找不到退貨單對應的原始訂單。");

    const inventoryResults: any[] = [];
    let inventoryStatus = salesReturn.inventory_status;
    if (!alreadyInventory) {
      const restockLines = (items ?? []).filter((item: any) => item.inventory_action === "restock" && item.product_id);
      for (const item of restockLines) {
        const { data: product, error: productError } = await db
          .from("products")
          .select("id, stock, company_id")
          .eq("id", item.product_id)
          .maybeSingle();
        if (productError) throw new Error(productError.message);
        if (!product) throw new Error(`找不到商品：${item.product_name}`);

        const beforeStock = asInt(product.stock);
        const qty = asInt(item.quantity);
        const afterStock = beforeStock + qty;
        const { error: updateStockError } = await db.from("products").update({ stock: afterStock }).eq("id", item.product_id);
        if (updateStockError) throw new Error(updateStockError.message);

        const { error: logError } = await db.from("inventory_logs").insert({
          product_id: item.product_id,
          type: "sales_return_restock",
          quantity: qty,
          company_id: product.company_id ?? order.company_id ?? salesReturn.company_id ?? null,
        });
        if (logError) throw new Error(logError.message);

        inventoryResults.push({ product_id: item.product_id, before_stock: beforeStock, quantity: qty, after_stock: afterStock });
      }
      inventoryStatus = restockLines.length > 0 ? "processed" : "skipped";
      const { error } = await db.from("sales_returns").update({ inventory_status: inventoryStatus }).eq("id", data.id);
      if (error) throw new Error(error.message);
    }

    let pointsStatus = salesReturn.points_reverse_status;
    const pointResults: any[] = [];
    if (!alreadyPoints) {
      const { data: existingReversals, error: existingError } = await db
        .from("point_transactions")
        .select("id")
        .eq("reference_id", data.id)
        .eq("source", "sales_return_reverse");
      if (existingError) throw new Error(existingError.message);

      if ((existingReversals ?? []).length > 0) {
        pointsStatus = "processed";
      } else if (!order.user_id) {
        pointsStatus = "skipped";
      } else {
        const { data: earnRows, error: earnError } = await db
          .from("point_transactions")
          .select("*")
          .eq("reference_id", order.id)
          .eq("point_type", "reward")
          .gt("amount", 0)
          .in("source", ["order_earn", "order_earn_referrer"]);
        if (earnError) throw new Error(earnError.message);

        if (!earnRows || earnRows.length === 0) {
          pointsStatus = "skipped";
        } else {
          const byUser = new Map<string, number>();
          for (const tx of earnRows as any[]) {
            byUser.set(tx.user_id, (byUser.get(tx.user_id) ?? 0) + asInt(tx.amount));
          }

          for (const [userId, points] of byUser.entries()) {
            const { data: wallet } = await db
              .from("member_points_wallet")
              .select("reward_points")
              .eq("user_id", userId)
              .maybeSingle();
            const before = asInt(wallet?.reward_points);
            const after = before - points;

            const { error: walletError } = await db
              .from("member_points_wallet")
              .upsert({ user_id: userId, reward_points: after, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
            if (walletError) throw new Error(walletError.message);

            const note = `退貨單 ${salesReturn.return_no} 追回原訂單獎勵點`;
            const { error: pointError } = await db.from("point_transactions").insert({
              user_id: userId,
              point_type: "reward",
              amount: -points,
              balance_after: after,
              source: "sales_return_reverse",
              reference_id: data.id,
              note,
              created_by: context.userId,
            });
            if (pointError) throw new Error(pointError.message);

            const { error: rewardLogError } = await db.from("reward_wallet_logs").insert({
              member_id: userId,
              points: -points,
              type: "cancel",
              status: "success",
              description: note,
            });
            if (rewardLogError) throw new Error(rewardLogError.message);

            pointResults.push({ user_id: userId, before_reward_points: before, reversed_points: points, after_reward_points: after });
          }
          pointsStatus = "processed";
        }
      }

      const { error } = await db
        .from("sales_returns")
        .update({
          points_reverse_status: pointsStatus,
          points_reverse_summary: {
            source_order_id: order.id,
            reversed: pointResults,
            processed_at: new Date().toISOString(),
          },
        })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
    }

    const completedAt = new Date().toISOString();
    const { data: updated, error: completeError } = await db
      .from("sales_returns")
      .update({
        status: "completed",
        completed_by: context.userId,
        completed_at: completedAt,
        inventory_status: inventoryStatus,
        points_reverse_status: pointsStatus,
        notes: data.note ? `${salesReturn.notes ? `${salesReturn.notes}\n` : ""}${data.note}` : salesReturn.notes,
      })
      .eq("id", data.id)
      .select("*")
      .single();
    if (completeError) throw new Error(completeError.message);

    await writeAudit(context.userId, "sales_return_effects_applied", data.id, {
      sales_order_id: salesReturn.sales_order_id,
      return_no: salesReturn.return_no,
      inventory_status: inventoryStatus,
      points_reverse_status: pointsStatus,
      inventory: inventoryResults,
      points: pointResults,
    });

    return {
      ok: true,
      salesReturn: updated,
      inventory: inventoryResults,
      points: pointResults,
      inventory_status: inventoryStatus,
      points_reverse_status: pointsStatus,
    };
  });
