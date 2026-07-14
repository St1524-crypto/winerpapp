import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const PR_ADMIN_ROLES = ["super_admin", "admin", "finance"] as const;
const PR_STATUSES = ["draft", "submitted", "completed", "cancelled"] as const;
const INVENTORY_ACTIONS = ["deduct_stock", "no_stock_change"] as const;

const db = supabaseAdmin as any;

type PRStatus = (typeof PR_STATUSES)[number];

async function assertPRAdmin(userId: string) {
  const { data, error } = await db
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", PR_ADMIN_ROLES as unknown as string[]);
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("沒有權限管理進貨退回單。");
}

function todayCompact() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, "");
}
function makeReturnNo() {
  const s = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `PR-${todayCompact()}-${s}`;
}
function asNum(v: unknown) { const n = Number(v ?? 0); return Number.isFinite(n) ? n : 0; }
function asInt(v: unknown) { const n = Math.floor(Number(v ?? 0)); return Number.isFinite(n) ? n : 0; }

async function writeAudit(userId: string, action: string, entityId: string, metadata: Record<string, unknown>) {
  const { error } = await db.from("audit_logs").insert({
    user_id: userId, action, entity: "purchase_returns", entity_id: entityId, metadata,
  });
  if (error) console.warn("[purchase-returns] audit failed", error.message);
}

// ---- List ----
const ListSchema = z.object({
  status: z.enum([...PR_STATUSES, "all"]).optional().default("all"),
  query: z.string().trim().max(80).optional().default(""),
  limit: z.number().int().min(1).max(500).optional().default(100),
});

export const adminListPurchaseReturns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ListSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertPRAdmin(context.userId);
    let q = db.from("purchase_returns").select("*").order("created_at", { ascending: false }).limit(data.limit);
    if (data.status !== "all") q = q.eq("status", data.status);
    const kw = data.query.trim();
    if (kw) {
      const esc = kw.replace(/[%_]/g, "\\$&");
      q = q.or(`return_no.ilike.%${esc}%,vendor_name.ilike.%${esc}%,reason.ilike.%${esc}%`);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const poIds = Array.from(new Set((rows ?? []).map((r: any) => r.purchase_order_id).filter(Boolean)));
    const { data: pos } = poIds.length
      ? await db.from("purchase_orders").select("id, po_no, status, total_amount").in("id", poIds)
      : { data: [] };
    const poMap = new Map((pos ?? []).map((p: any) => [p.id, p]));
    return (rows ?? []).map((r: any) => ({ ...r, purchase_order: poMap.get(r.purchase_order_id) ?? null }));
  });

// ---- Detail ----
const DetailSchema = z.object({ id: z.string().uuid() });

export const adminGetPurchaseReturnDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => DetailSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertPRAdmin(context.userId);
    const { data: pr, error } = await db.from("purchase_returns").select("*").eq("id", data.id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!pr) throw new Error("找不到進貨退回單。");
    const [{ data: items }, { data: po }] = await Promise.all([
      db.from("purchase_return_items").select("*").eq("purchase_return_id", data.id).order("created_at"),
      db.from("purchase_orders").select("*").eq("id", pr.purchase_order_id).maybeSingle(),
    ]);
    const poItemIds = (items ?? []).map((i: any) => i.purchase_order_item_id).filter(Boolean);
    const { data: originalItems } = poItemIds.length
      ? await db.from("purchase_order_items").select("*").in("id", poItemIds)
      : { data: [] };
    return { purchaseReturn: pr, items: items ?? [], purchaseOrder: po ?? null, originalItems: originalItems ?? [] };
  });

// ---- PO items for building return ----
const POItemsSchema = z.object({ purchase_order_id: z.string().uuid() });

export const adminGetPOItemsForReturn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => POItemsSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertPRAdmin(context.userId);
    const [{ data: po }, { data: items }] = await Promise.all([
      db.from("purchase_orders").select("*").eq("id", data.purchase_order_id).maybeSingle(),
      db.from("purchase_order_items").select("*").eq("purchase_order_id", data.purchase_order_id),
    ]);
    if (!po) throw new Error("找不到採購單。");
    // already returned qty per PO item
    const { data: prs } = await db
      .from("purchase_returns")
      .select("id, status")
      .eq("purchase_order_id", data.purchase_order_id)
      .neq("status", "cancelled");
    const prIds = (prs ?? []).map((r: any) => r.id);
    const returnedMap = new Map<string, number>();
    if (prIds.length) {
      const { data: rItems } = await db
        .from("purchase_return_items")
        .select("purchase_order_item_id, quantity")
        .in("purchase_return_id", prIds);
      for (const r of rItems ?? []) {
        const k = r.purchase_order_item_id as string;
        if (!k) continue;
        returnedMap.set(k, (returnedMap.get(k) ?? 0) + asInt(r.quantity));
      }
    }
    return {
      purchaseOrder: po,
      items: (items ?? []).map((i: any) => ({ ...i, returned_quantity: returnedMap.get(i.id) ?? 0 })),
    };
  });

// ---- List PO options ----
export const adminListPurchaseOrdersForReturn = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertPRAdmin(context.userId);
    const { data, error } = await db
      .from("purchase_orders")
      .select("id, po_no, vendor_id, vendor_name, status, total_amount, created_at, company_id")
      .in("status", ["confirmed", "partial", "completed"])
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// ---- Create ----
const CreateItemSchema = z.object({
  purchase_order_item_id: z.string().uuid(),
  quantity: z.number().int().min(1),
  inventory_action: z.enum(INVENTORY_ACTIONS).optional().default("deduct_stock"),
  reason: z.string().trim().max(500).optional(),
  condition_note: z.string().trim().max(500).optional(),
});
const CreateSchema = z.object({
  purchase_order_id: z.string().uuid(),
  reason: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(1000).optional(),
  items: z.array(CreateItemSchema).min(1, "請至少一筆退回明細").max(200),
});

export const adminCreatePurchaseReturn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertPRAdmin(context.userId);
    const { data: po, error: poErr } = await db.from("purchase_orders")
      .select("id, po_no, vendor_id, vendor_name, company_id").eq("id", data.purchase_order_id).maybeSingle();
    if (poErr) throw new Error(poErr.message);
    if (!po) throw new Error("找不到採購單。");

    const ids = Array.from(new Set(data.items.map((i) => i.purchase_order_item_id)));
    const { data: origs } = await db.from("purchase_order_items")
      .select("id, purchase_order_id, product_id, product_name, sku, price, quantity, received_quantity").in("id", ids);
    const om = new Map<string, any>((origs ?? []).map((o: any) => [o.id, o]));

    let subtotal = 0;
    const lines = data.items.map((i) => {
      const o = om.get(i.purchase_order_item_id);
      if (!o) throw new Error("採購明細不存在。");
      if (o.purchase_order_id !== data.purchase_order_id) throw new Error("明細不屬於此採購單。");
      const maxQty = asInt(o.received_quantity);
      if (maxQty > 0 && i.quantity > maxQty) {
        throw new Error(`「${o.product_name}」退回數量不可超過已到貨數量 ${maxQty}。`);
      }
      const unitPrice = asNum(o.price);
      const s = Math.round(i.quantity * unitPrice * 100) / 100;
      subtotal += s;
      return {
        purchase_order_item_id: i.purchase_order_item_id,
        product_id: o.product_id,
        product_name: o.product_name,
        sku: o.sku,
        quantity: i.quantity,
        unit_price: unitPrice,
        subtotal: s,
        inventory_action: i.inventory_action,
        reason: i.reason ?? null,
        condition_note: i.condition_note ?? null,
      };
    });

    let inserted: any = null;
    for (let a = 0; a < 3 && !inserted; a++) {
      const { data: row, error } = await db.from("purchase_returns").insert({
        return_no: makeReturnNo(),
        purchase_order_id: data.purchase_order_id,
        vendor_id: po.vendor_id,
        vendor_name: po.vendor_name,
        company_id: po.company_id,
        status: "draft",
        reason: data.reason ?? null,
        notes: data.notes ?? null,
        subtotal,
        created_by: context.userId,
      }).select("*").single();
      if (!error) inserted = row;
      else if (!String(error.message).includes("duplicate key")) throw new Error(error.message);
    }
    if (!inserted) throw new Error("建立退回單編號失敗，請再試一次。");

    const { error: itemsErr } = await db.from("purchase_return_items")
      .insert(lines.map((l) => ({ ...l, purchase_return_id: inserted.id })));
    if (itemsErr) {
      await db.from("purchase_returns").delete().eq("id", inserted.id);
      throw new Error(itemsErr.message);
    }

    await writeAudit(context.userId, "purchase_return_created", inserted.id, {
      purchase_order_id: data.purchase_order_id, return_no: inserted.return_no, item_count: lines.length, subtotal,
    });
    return { ok: true, purchaseReturn: inserted };
  });

// ---- Status ----
const StatusPatchSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["submitted", "cancelled", "draft"]),
  note: z.string().trim().max(500).optional(),
});
export const adminUpdatePurchaseReturnStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => StatusPatchSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertPRAdmin(context.userId);
    const { data: cur, error: gErr } = await db.from("purchase_returns").select("*").eq("id", data.id).maybeSingle();
    if (gErr) throw new Error(gErr.message);
    if (!cur) throw new Error("找不到進貨退回單。");
    if (cur.status === "completed") throw new Error("已完成的退回單不可再變更狀態。");
    if (cur.status === "cancelled") throw new Error("已取消的退回單不可再變更狀態。");

    const patch: any = { status: data.status };
    if (data.status === "cancelled") { patch.cancelled_by = context.userId; patch.cancelled_at = new Date().toISOString(); }
    if (data.note) patch.notes = cur.notes ? `${cur.notes}\n${data.note}` : data.note;

    const { data: upd, error } = await db.from("purchase_returns").update(patch).eq("id", data.id).select("*").single();
    if (error) throw new Error(error.message);
    await writeAudit(context.userId, "purchase_return_status_updated", data.id, { from: cur.status, to: data.status, note: data.note ?? null });
    return { ok: true, purchaseReturn: upd };
  });

// ---- Apply effects (inventory + payable) ----
const ApplySchema = z.object({ id: z.string().uuid(), note: z.string().trim().max(500).optional() });

export const adminApplyPurchaseReturnEffects = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ApplySchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertPRAdmin(context.userId);

    const { data: pr, error: pErr } = await db.from("purchase_returns").select("*").eq("id", data.id).maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!pr) throw new Error("找不到進貨退回單。");
    if (pr.status === "cancelled") throw new Error("已取消的退回單不可套用效果。");

    const invDone = pr.inventory_status === "processed" || pr.inventory_status === "skipped";
    const payDone = pr.payable_status === "processed" || pr.payable_status === "skipped";
    if (pr.status === "completed" && invDone && payDone) {
      return { ok: true, skipped: "already_applied" };
    }

    const { data: items } = await db.from("purchase_return_items").select("*").eq("purchase_return_id", data.id);

    // Inventory: allow negative stock
    let invStatus = pr.inventory_status;
    const invResults: any[] = [];
    if (!invDone) {
      const deductLines = (items ?? []).filter((i: any) => i.inventory_action === "deduct_stock" && i.product_id);
      for (const it of deductLines) {
        const { data: product, error: prodErr } = await db.from("products")
          .select("id, stock, company_id").eq("id", it.product_id).maybeSingle();
        if (prodErr) throw new Error(prodErr.message);
        if (!product) throw new Error(`找不到商品：${it.product_name}`);
        const before = asInt(product.stock);
        const qty = asInt(it.quantity);
        const after = before - qty; // allow negative
        const { error: uErr } = await db.from("products").update({ stock: after }).eq("id", it.product_id);
        if (uErr) throw new Error(uErr.message);
        const { error: logErr } = await db.from("inventory_logs").insert({
          product_id: it.product_id,
          type: "purchase_return_deduct",
          quantity: -qty,
          before_stock: before,
          after_stock: after,
          reason: `進貨退回 ${pr.return_no}`,
          operator_id: context.userId,
          company_id: product.company_id ?? pr.company_id,
        });
        if (logErr) throw new Error(logErr.message);
        invResults.push({ product_id: it.product_id, before, qty, after });
      }
      invStatus = deductLines.length > 0 ? "processed" : "skipped";
      const { error } = await db.from("purchase_returns").update({ inventory_status: invStatus }).eq("id", data.id);
      if (error) throw new Error(error.message);
    }

    // Payable: reduce existing AP for this PO, else insert negative adjustment
    let payStatus = pr.payable_status;
    let payableAdjustmentId = pr.payable_adjustment_id as string | null;
    const payResult: any = {};
    if (!payDone) {
      const subtotal = asNum(pr.subtotal);
      if (subtotal <= 0) {
        payStatus = "skipped";
      } else {
        const { data: aps } = await db.from("accounts_payable")
          .select("*").eq("reference_po_id", pr.purchase_order_id)
          .order("created_at", { ascending: false });
        const target = (aps ?? []).find((a: any) => asNum(a.total_amount) - asNum(a.paid_amount) > 0 && a.status !== "cancelled");
        if (target) {
          const newTotal = Math.max(0, asNum(target.total_amount) - subtotal);
          const paid = asNum(target.paid_amount);
          const newStatus = newTotal <= 0
            ? "cancelled"
            : paid <= 0 ? target.status : paid >= newTotal ? "paid" : "partial";
          const { data: updAp, error: apErr } = await db.from("accounts_payable")
            .update({
              total_amount: newTotal,
              status: newStatus,
              notes: `${target.notes ? target.notes + "\n" : ""}[退回 ${pr.return_no}] 沖銷 ${subtotal}`,
            })
            .eq("id", target.id).select("*").single();
          if (apErr) throw new Error(apErr.message);
          payableAdjustmentId = updAp.id;
          payResult.mode = "reduce";
          payResult.ap_id = updAp.id;
        } else {
          const { data: newAp, error: apErr } = await db.from("accounts_payable").insert({
            vendor_id: pr.vendor_id,
            vendor_name: pr.vendor_name,
            bill_no: `${pr.return_no}-ADJ`,
            reference_po_id: pr.purchase_order_id,
            total_amount: -subtotal,
            paid_amount: 0,
            status: "adjustment",
            notes: `進貨退回調整 ${pr.return_no}`,
            company_id: pr.company_id,
          }).select("*").single();
          if (apErr) throw new Error(apErr.message);
          payableAdjustmentId = newAp.id;
          payResult.mode = "adjustment";
          payResult.ap_id = newAp.id;
        }
        payStatus = "processed";
      }
      const { error } = await db.from("purchase_returns")
        .update({ payable_status: payStatus, payable_adjustment_id: payableAdjustmentId }).eq("id", data.id);
      if (error) throw new Error(error.message);
    }

    // Mark completed if both terminal
    const finalPatch: any = {};
    if ((invStatus === "processed" || invStatus === "skipped") && (payStatus === "processed" || payStatus === "skipped")) {
      finalPatch.status = "completed";
      finalPatch.completed_by = context.userId;
      finalPatch.completed_at = new Date().toISOString();
      if (data.note) finalPatch.notes = pr.notes ? `${pr.notes}\n${data.note}` : data.note;
      const { error } = await db.from("purchase_returns").update(finalPatch).eq("id", data.id);
      if (error) throw new Error(error.message);
    }

    await writeAudit(context.userId, "purchase_return_applied", data.id, {
      return_no: pr.return_no, inventory: invResults, payable: payResult,
    });

    return { ok: true, inventory: invResults, payable: payResult };
  });
