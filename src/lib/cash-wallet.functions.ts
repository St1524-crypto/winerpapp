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
    // Atomic reserve: lock and deduct in one RPC call to prevent race-based
    // double-withdraw. On approval failure we re-credit via adjust_cash_balance.
    const { data: newBal, error: reserveErr } = await (supabaseAdmin as any).rpc(
      "spend_cash_balance",
      { _user_id: context.userId, _amount: data.amount },
    );
    if (reserveErr) {
      if (String(reserveErr.message).includes("insufficient cash balance")) {
        throw new Error("現金餘額不足");
      }
      throw new Error(reserveErr.message);
    }
    const { error } = await supabaseAdmin.from("cash_transactions").insert({
      user_id: context.userId,
      tx_type: "withdraw",
      amount: data.amount,
      balance_after: newBal,
      status: "pending",
      bank_info: data.bank_info,
      note: data.note ?? null,
      created_by: context.userId,
    });
    if (error) {
      // rollback the reservation
      await (supabaseAdmin as any).rpc("adjust_cash_balance", {
        _user_id: context.userId,
        _delta: data.amount,
      });
      throw new Error(error.message);
    }
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
    const points = Math.floor(data.amount * POINTS_PER_NTD);

    // Atomic cash deduction (row-locked; throws if insufficient)
    const { data: newCash, error: spendErr } = await (supabaseAdmin as any).rpc(
      "spend_cash_balance",
      { _user_id: context.userId, _amount: data.amount },
    );
    if (spendErr) {
      if (String(spendErr.message).includes("insufficient cash balance")) {
        throw new Error("現金餘額不足");
      }
      throw new Error(spendErr.message);
    }

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
    if (txErr) {
      // rollback the cash deduction
      await (supabaseAdmin as any).rpc("adjust_cash_balance", {
        _user_id: context.userId,
        _delta: data.amount,
      });
      throw new Error(txErr.message);
    }

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

    // Atomic balance changes via row-locked RPCs. Withdraw funds were already
    // reserved on request; approval is just a state flip. Reject refunds them.
    if (data.action === "approve") {
      if (t.tx_type === "topup") {
        const { data: after, error: e } = await (supabaseAdmin as any).rpc(
          "adjust_cash_balance",
          { _user_id: t.user_id, _delta: Number(t.amount) },
        );
        if (e) throw new Error(e.message);
        balanceAfter = after;
      } else if (t.tx_type === "withdraw") {
        balanceAfter = await getCashBalance(t.user_id);
      }
    } else if (data.action === "reject" && t.tx_type === "withdraw") {
      const { data: after, error: e } = await (supabaseAdmin as any).rpc(
        "adjust_cash_balance",
        { _user_id: t.user_id, _delta: Number(t.amount) },
      );
      if (e) throw new Error(e.message);
      balanceAfter = after;
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
    // Atomic adjust (row-locked; rejects if result would be negative)
    const { data: after, error: adjErr } = await (supabaseAdmin as any).rpc(
      "adjust_cash_balance",
      { _user_id: data.userId, _delta: data.amount },
    );
    if (adjErr) {
      if (String(adjErr.message).includes("cannot go negative")) {
        throw new Error("餘額不足");
      }
      throw new Error(adjErr.message);
    }
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
    if (error) {
      // rollback
      await (supabaseAdmin as any).rpc("adjust_cash_balance", {
        _user_id: data.userId,
        _delta: -data.amount,
      });
      throw new Error(error.message);
    }
    return { balance_after: after };
  });


// ============ 管理員：會員現金 / 點數餘額查詢 ============
const AdminWalletListSchema = z.object({
  query: z.string().trim().max(80).optional().default(""),
  limit: z.number().int().min(1).max(200).optional().default(100),
});

export const adminListMemberCashWallets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => AdminWalletListSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    if (!(await isFinanceAdmin(context.userId))) throw new Error("沒有權限");

    let profilesQuery = supabaseAdmin
      .from("profiles")
      .select("id, name, member_no, email, phone, is_vip, vip_expires_at")
      .order("created_at", { ascending: false })
      .limit(data.limit);

    const keyword = data.query.trim();
    if (keyword) {
      const escaped = keyword.replace(/[%_]/g, "\\$&");
      profilesQuery = profilesQuery.or(
        `name.ilike.%${escaped}%,email.ilike.%${escaped}%,phone.ilike.%${escaped}%,member_no.ilike.%${escaped}%`,
      );
    }

    const { data: profiles, error: profilesError } = await profilesQuery;
    if (profilesError) throw new Error(profilesError.message);

    const ids = (profiles ?? []).map((profile: any) => profile.id);
    let wallets: any[] = [];
    if (ids.length > 0) {
      const { data: walletRows, error: walletError } = await supabaseAdmin
        .from("member_points_wallet")
        .select("user_id, cash_balance, shopping_points, reward_points, discount_points, updated_at")
        .in("user_id", ids);
      if (walletError) throw new Error(walletError.message);
      wallets = walletRows ?? [];
    }

    const walletMap = new Map(wallets.map((wallet: any) => [wallet.user_id, wallet]));
    return {
      members: (profiles ?? []).map((profile: any) => ({
        ...profile,
        wallet: walletMap.get(profile.id) ?? {
          user_id: profile.id,
          cash_balance: 0,
          shopping_points: 0,
          reward_points: 0,
          discount_points: 0,
          updated_at: null,
        },
      })),
    };
  });

// ============ 管理員：代會員用現金錢包購買購物點 ============
const AdminBuyPointsSchema = z.object({
  userId: z.string().uuid(),
  amount: z.number().positive().max(10_000_000),
  note: z.string().trim().max(500).optional(),
});

export const adminBuyShoppingPointsWithCash = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => AdminBuyPointsSchema.parse(d))
  .handler(async ({ data, context }) => {
    if (!(await isFinanceAdmin(context.userId))) throw new Error("沒有權限");
    const { data: result, error } = await (supabaseAdmin as any).rpc(
      "admin_buy_shopping_points_with_cash",
      {
        _member_id: data.userId,
        _amount: data.amount,
        _note: data.note ?? null,
      },
    );
    if (error) throw new Error(error.message);
    return result;
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
