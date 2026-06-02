import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// 預設兌換比率：1 NTD = 1 購物點。可日後改為從設定讀取。
const POINTS_PER_NTD = 1;

async function getCashBalance(userId: string): Promise<number> {
  const { data } = await supabaseAdmin
    .from("member_points_wallet")
    .select("cash_balance")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) {
    await supabaseAdmin.from("member_points_wallet").insert({ user_id: userId });
    return 0;
  }
  return Number((data as any).cash_balance ?? 0);
}

async function setCashBalance(userId: string, value: number) {
  await supabaseAdmin
    .from("member_points_wallet")
    .update({ cash_balance: value, updated_at: new Date().toISOString() })
    .eq("user_id", userId);
}

async function addShoppingPoints(userId: string, delta: number, reference_id: string, note: string) {
  const { data: w } = await supabaseAdmin
    .from("member_points_wallet")
    .select("shopping_points")
    .eq("user_id", userId)
    .maybeSingle();
  const cur = Number((w as any)?.shopping_points ?? 0);
  const after = cur + delta;
  await supabaseAdmin
    .from("member_points_wallet")
    .update({ shopping_points: after, updated_at: new Date().toISOString() })
    .eq("user_id", userId);
  await supabaseAdmin.from("point_transactions").insert({
    user_id: userId,
    point_type: "shopping",
    amount: delta,
    balance_after: after,
    source: "cash_buy",
    reference_id,
    note,
  });
  return after;
}

async function isFinanceAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["super_admin", "admin", "finance"]);
  return (data ?? []).length > 0;
}

// ============ 會員查詢 ============
export const getMyCashWallet = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const balance = await getCashBalance(context.userId);
    return { cash_balance: balance };
  });

export const getMyCashLedger = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await supabaseAdmin
      .from("cash_transactions")
      .select("*")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(100);
    return data ?? [];
  });

// ============ 會員：充值申請 ============
const TopupSchema = z.object({
  amount: z.number().positive().max(10_000_000),
  payment_method: z.string().trim().min(1).max(40),
  note: z.string().trim().max(500).optional(),
});

export const requestTopup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => TopupSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await supabaseAdmin.from("cash_transactions").insert({
      user_id: context.userId,
      tx_type: "topup",
      amount: data.amount,
      status: "pending",
      payment_method: data.payment_method,
      note: data.note ?? null,
      created_by: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ 會員：提現申請 ============
const WithdrawSchema = z.object({
  amount: z.number().positive().max(10_000_000),
  bank_info: z.string().trim().min(1).max(255),
  note: z.string().trim().max(500).optional(),
});

export const requestWithdraw = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => WithdrawSchema.parse(d))
  .handler(async ({ data, context }) => {
    const bal = await getCashBalance(context.userId);
    if (data.amount > bal) throw new Error(`現金餘額不足（目前 ${bal}）`);
    const { error } = await supabaseAdmin.from("cash_transactions").insert({
      user_id: context.userId,
      tx_type: "withdraw",
      amount: data.amount,
      status: "pending",
      bank_info: data.bank_info,
      note: data.note ?? null,
      created_by: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============ 會員：用現金購買購物點（即時完成） ============
const BuyPointsSchema = z.object({
  amount: z.number().positive().max(10_000_000),
});

export const buyShoppingPoints = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => BuyPointsSchema.parse(d))
  .handler(async ({ data, context }) => {
    const bal = await getCashBalance(context.userId);
    if (data.amount > bal) throw new Error(`現金餘額不足（目前 ${bal}）`);
    const newCash = Number((bal - data.amount).toFixed(2));
    const points = Math.floor(data.amount * POINTS_PER_NTD);

    await setCashBalance(context.userId, newCash);

    const { data: tx, error: txErr } = await supabaseAdmin
      .from("cash_transactions")
      .insert({
        user_id: context.userId,
        tx_type: "buy_points",
        amount: -data.amount,
        balance_after: newCash,
        status: "completed",
        related_point_amount: points,
        note: `購買購物點 ${points} 點`,
        created_by: context.userId,
        processed_by: context.userId,
        processed_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (txErr) throw new Error(txErr.message);

    const newPoints = await addShoppingPoints(
      context.userId,
      points,
      (tx as any).id,
      `現金購點 NT$${data.amount}`,
    );
    return { cash_balance: newCash, shopping_points: newPoints, points_added: points };
  });

// ============ 管理員：核准 / 拒絕 ============
const ProcessSchema = z.object({
  txId: z.string().uuid(),
  action: z.enum(["approve", "reject"]),
  note: z.string().trim().max(500).optional(),
});

export const adminProcessCashTx = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ProcessSchema.parse(d))
  .handler(async ({ data, context }) => {
    if (!(await isFinanceAdmin(context.userId))) throw new Error("沒有權限");
    const { data: tx, error: getErr } = await supabaseAdmin
      .from("cash_transactions")
      .select("*")
      .eq("id", data.txId)
      .maybeSingle();
    if (getErr || !tx) throw new Error(getErr?.message ?? "找不到交易");
    if ((tx as any).status !== "pending") throw new Error(`交易狀態為「${(tx as any).status}」，無法再次處理`);

    const t = tx as any;
    let balanceAfter: number | null = null;

    if (data.action === "approve") {
      const bal = await getCashBalance(t.user_id);
      if (t.tx_type === "topup") {
        balanceAfter = Number((bal + Number(t.amount)).toFixed(2));
        await setCashBalance(t.user_id, balanceAfter);
      } else if (t.tx_type === "withdraw") {
        if (Number(t.amount) > bal) throw new Error(`會員餘額不足（目前 ${bal}）`);
        balanceAfter = Number((bal - Number(t.amount)).toFixed(2));
        await setCashBalance(t.user_id, balanceAfter);
      }
    }

    const { error: updErr } = await supabaseAdmin
      .from("cash_transactions")
      .update({
        status: data.action === "approve" ? "approved" : "rejected",
        balance_after: balanceAfter,
        processed_by: context.userId,
        processed_at: new Date().toISOString(),
        note: data.note ? `${t.note ? t.note + " | " : ""}${data.note}` : t.note,
      })
      .eq("id", data.txId);
    if (updErr) throw new Error(updErr.message);

    return { ok: true, balance_after: balanceAfter };
  });

// ============ 管理員：直接調整現金 ============
const AdjustSchema = z.object({
  userId: z.string().uuid(),
  amount: z.number(), // 正：加值；負：扣除
  note: z.string().trim().max(500).optional(),
});

export const adminAdjustCash = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => AdjustSchema.parse(d))
  .handler(async ({ data, context }) => {
    if (!(await isFinanceAdmin(context.userId))) throw new Error("沒有權限");
    const bal = await getCashBalance(data.userId);
    const after = Number((bal + data.amount).toFixed(2));
    if (after < 0) throw new Error(`餘額不足（目前 ${bal}）`);
    await setCashBalance(data.userId, after);
    const { error } = await supabaseAdmin.from("cash_transactions").insert({
      user_id: data.userId,
      tx_type: "adjust",
      amount: data.amount,
      balance_after: after,
      status: "completed",
      note: data.note ?? "管理員調整",
      created_by: context.userId,
      processed_by: context.userId,
      processed_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    return { balance_after: after };
  });

// ============ 管理員：列表 ============
export const adminListCashTx = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ status: z.enum(["pending", "approved", "rejected", "completed", "all"]).default("pending") }).parse(d),
  )
  .handler(async ({ data, context }) => {
    if (!(await isFinanceAdmin(context.userId))) throw new Error("沒有權限");
    let q = supabaseAdmin
      .from("cash_transactions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const ids = Array.from(new Set((rows ?? []).map((r: any) => r.user_id)));
    const { data: profs } = await supabaseAdmin
      .from("profiles")
      .select("id, name, member_no, email, phone")
      .in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
    const map = new Map((profs ?? []).map((p: any) => [p.id, p]));
    return (rows ?? []).map((r: any) => ({ ...r, member: map.get(r.user_id) ?? null }));
  });
