import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const CreateInput = z.object({
  productId: z.string().uuid(),
  durationDays: z.number().int().min(1).max(30).optional(),
});

const JoinInput = z.object({
  groupBuyId: z.string().uuid(),
  quantity: z.number().int().min(1).max(2),
  paymentMethod: z.enum(["points", "bank_transfer", "mixed"]),
  pointsUsed: z.number().int().min(0).default(0),
});

export const listOpenGroupBuys = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("group_buys")
    .select("id,product_id,initiator_id,unit_price,target_count,current_count,status,started_at,expires_at,products(name,image,sku)")
    .eq("status", "open")
    .order("started_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return { groupBuys: data ?? [] };
});

export const getGroupBuy = createServerFn({ method: "GET" })
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: gb, error } = await supabaseAdmin
      .from("group_buys")
      .select("*,products(id,name,image,sku,description,price)")
      .eq("id", data.id).single();
    if (error || !gb) throw new Error("拼團不存在");
    const { data: orders } = await supabaseAdmin
      .from("group_buy_orders")
      .select("id,user_id,quantity,status,created_at,profiles:user_id(name,member_no)")
      .eq("group_buy_id", data.id)
      .order("created_at");
    return { groupBuy: gb, orders: orders ?? [] };
  });

export const createGroupBuy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles").select("current_company_id,is_vip,vip_expires_at").eq("id", userId).single();
    const isVip = profile?.is_vip && (!profile.vip_expires_at || new Date(profile.vip_expires_at) > new Date());
    if (!isVip) throw new Error("僅 VIP 會員可發起拼團");
    const companyId = profile?.current_company_id;
    if (!companyId) throw new Error("尚未綁定公司");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: settings } = await supabaseAdmin
      .from("group_buy_settings").select("*").eq("company_id", companyId).maybeSingle();
    const days = data.durationDays ?? settings?.default_duration_days ?? 7;
    const targetCount = settings?.target_count ?? 6;
    const { data: product, error: pErr } = await supabaseAdmin
      .from("products").select("id,price,status,company_id").eq("id", data.productId).single();
    if (pErr || !product) throw new Error("商品不存在");
    if (product.status !== "active") throw new Error("商品未上架");

    const { data: gb, error } = await supabaseAdmin.from("group_buys").insert({
      company_id: product.company_id,
      product_id: product.id,
      initiator_id: userId,
      unit_price: product.price,
      target_count: targetCount,
      expires_at: new Date(Date.now() + days * 86400_000).toISOString(),
    }).select().single();
    if (error) throw error;

    const { deliverWebhook } = await import("./webhooks.server");
    deliverWebhook("group_buy.created", gb, product.company_id).catch(() => {});
    return { groupBuy: gb };
  });

export const joinGroupBuy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => JoinInput.parse(d))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: gb, error: gbErr } = await supabaseAdmin
      .from("group_buys").select("*").eq("id", data.groupBuyId).single();
    if (gbErr || !gb) throw new Error("拼團不存在");
    if (gb.status !== "open") throw new Error("拼團已結束");

    const subtotal = Number(gb.unit_price) * data.quantity;
    let pointsUsed = 0;
    let cashAmount = subtotal;
    if (data.paymentMethod === "points") {
      pointsUsed = subtotal; cashAmount = 0;
    } else if (data.paymentMethod === "mixed") {
      pointsUsed = Math.min(data.pointsUsed, subtotal);
      cashAmount = subtotal - pointsUsed;
    }

    if (pointsUsed > 0) {
      const { data: wallet } = await supabaseAdmin
        .from("member_points_wallet").select("shopping_points").eq("user_id", userId).maybeSingle();
      if (!wallet || wallet.shopping_points < pointsUsed) throw new Error("購物點不足");
      await supabaseAdmin
        .from("member_points_wallet")
        .update({ shopping_points: wallet.shopping_points - pointsUsed, updated_at: new Date().toISOString() })
        .eq("user_id", userId);
    }

    // mark paid immediately when fully covered by points; otherwise pending_payment (匯款)
    const status = cashAmount === 0 ? "paid" : "pending_payment";
    const { data: order, error } = await supabaseAdmin.from("group_buy_orders").insert({
      group_buy_id: data.groupBuyId,
      user_id: userId,
      quantity: data.quantity,
      unit_price: gb.unit_price,
      subtotal,
      payment_method: data.paymentMethod,
      points_used: pointsUsed,
      cash_amount: cashAmount,
      status,
      paid_at: status === "paid" ? new Date().toISOString() : null,
    }).select().single();
    if (error) {
      if (pointsUsed > 0) {
        const { data: w } = await supabaseAdmin
          .from("member_points_wallet").select("shopping_points").eq("user_id", userId).maybeSingle();
        if (w) await supabaseAdmin.from("member_points_wallet")
          .update({ shopping_points: w.shopping_points + pointsUsed }).eq("user_id", userId);
      }
      throw error;
    }
    return { order };
  });

export const markGroupBuyOrderPaid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { orderId: string }) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: roles } = await supabase.from("user_roles").select("role");
    const isAdmin = roles?.some((r: any) => ["super_admin", "admin", "finance"].includes(r.role));
    if (!isAdmin) throw new Error("無權限");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("group_buy_orders")
      .update({ status: "paid", paid_at: new Date().toISOString() })
      .eq("id", data.orderId)
      .eq("status", "pending_payment");
    if (error) throw error;
    return { ok: true };
  });

export const expireGroupBuys = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data: roles } = await supabase.from("user_roles").select("role");
    const isAdmin = roles?.some((r: any) => ["super_admin", "admin", "finance"].includes(r.role));
    if (!isAdmin) throw new Error("Unauthorized");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("group_buys")
      .update({ status: "expired" })
      .lt("expires_at", new Date().toISOString())
      .eq("status", "open")
      .select("id");
    if (error) throw error;
    return { expired: data?.length ?? 0 };
  });

export const listMyGroupBuyOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("group_buy_orders")
      .select("*,group_buys(id,status,expires_at,products(name,image))")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return { orders: data ?? [] };
  });
