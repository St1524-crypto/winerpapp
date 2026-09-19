import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const ANNUAL_FEE_AMOUNT = 1500;
export const ANNUAL_FEE_DAYS = 365;

async function ensureWallet(userId: string) {
  const { data } = await supabaseAdmin
    .from("member_points_wallet")
    .select("user_id, cash_balance, shopping_points")
    .eq("user_id", userId)
    .maybeSingle();
  if (data) return data as any;
  const { data: created } = await supabaseAdmin
    .from("member_points_wallet")
    .insert({ user_id: userId })
    .select("user_id, cash_balance, shopping_points")
    .single();
  return created as any;
}

export const getMyRenewalInfo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const wallet = await ensureWallet(context.userId);
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("is_vip, vip_expires_at")
      .eq("id", context.userId)
      .maybeSingle();
    const expires = (prof as any)?.vip_expires_at as string | null;
    return {
      fee: ANNUAL_FEE_AMOUNT,
      days: ANNUAL_FEE_DAYS,
      cash_balance: Number(wallet?.cash_balance ?? 0),
      shopping_points: Number(wallet?.shopping_points ?? 0),
      is_vip: !!(prof as any)?.is_vip && (!expires || new Date(expires) > new Date()),
      vip_expires_at: expires,
    };
  });

const RenewSchema = z.object({ method: z.enum(["cash", "shopping"]) });

export const renewAnnualFee = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => RenewSchema.parse(d))
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    const amount = ANNUAL_FEE_AMOUNT;
    await ensureWallet(userId);

    let rollback: (() => Promise<void>) | null = null;

    if (data.method === "cash") {
      const { data: newCash, error } = await (supabaseAdmin as any).rpc("spend_cash_balance", {
        _user_id: userId,
        _amount: amount,
      });
      if (error) {
        if (String(error.message).includes("insufficient cash balance")) throw new Error("現金餘額不足");
        throw new Error(error.message);
      }
      const { error: txErr } = await supabaseAdmin.from("cash_transactions").insert({
        user_id: userId,
        tx_type: "adjust",
        amount: -amount,
        balance_after: newCash,
        status: "completed",
        note: `VIP 年費續約 NT$${amount}（${ANNUAL_FEE_DAYS} 天）`,
        created_by: userId,
        processed_by: userId,
        processed_at: new Date().toISOString(),
      });
      if (txErr) {
        await (supabaseAdmin as any).rpc("adjust_cash_balance", { _user_id: userId, _delta: amount });
        throw new Error(txErr.message);
      }
      rollback = async () => {
        await (supabaseAdmin as any).rpc("adjust_cash_balance", { _user_id: userId, _delta: amount });
      };
    } else {
      const wallet = await ensureWallet(userId);
      const current = Number(wallet?.shopping_points ?? 0);
      if (current < amount) throw new Error("購物點餘額不足");
      const after = current - amount;
      const { error: uErr } = await supabaseAdmin
        .from("member_points_wallet")
        .update({ shopping_points: after, updated_at: new Date().toISOString() })
        .eq("user_id", userId);
      if (uErr) throw new Error(uErr.message);
      await supabaseAdmin.from("point_transactions").insert({
        user_id: userId,
        point_type: "shopping",
        amount: -amount,
        balance_after: after,
        source: "vip_renewal",
        note: `VIP 年費續約（${ANNUAL_FEE_DAYS} 天）`,
        created_by: userId,
      });
      rollback = async () => {
        await supabaseAdmin
          .from("member_points_wallet")
          .update({ shopping_points: current, updated_at: new Date().toISOString() })
          .eq("user_id", userId);
      };
    }

    try {
      const { data: prof } = await supabaseAdmin
        .from("profiles")
        .select("vip_expires_at")
        .eq("id", userId)
        .maybeSingle();
      const cur = (prof as any)?.vip_expires_at ? new Date((prof as any).vip_expires_at) : null;
      const base = cur && cur > new Date() ? cur : new Date();
      const newExpires = new Date(base.getTime() + ANNUAL_FEE_DAYS * 86400000);

      const { error: pErr } = await supabaseAdmin
        .from("profiles")
        .update({ is_vip: true, vip_expires_at: newExpires.toISOString() })
        .eq("id", userId);
      if (pErr) throw new Error(pErr.message);

      await supabaseAdmin.from("vip_memberships").insert({
        user_id: userId,
        expires_at: newExpires.toISOString(),
        amount_paid: amount,
        source: data.method === "cash" ? "cash_wallet" : "shopping_points",
        notes: `會員自助年費續約（${data.method === "cash" ? "現金錢包" : "購物錢包"}）`,
      });

      return { ok: true, vip_expires_at: newExpires.toISOString() };
    } catch (e: any) {
      if (rollback) await rollback();
      throw new Error(e?.message ?? "續約失敗，已退回扣款");
    }
  });
