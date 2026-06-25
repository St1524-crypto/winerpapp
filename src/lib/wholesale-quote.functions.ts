import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { getRequestHeader } from "@tanstack/react-start/server";
import type { Database } from "@/integrations/supabase/types";

/**
 * Server-trusted line quote for wholesale / VIP tier pricing.
 *
 * - 完全在 server 重新計價，前端送來的 unit_price 一律忽略
 * - 透過 RPC `quote_wholesale_price` 以呼叫者身分（VIP/dealer/anon）判斷可見階梯
 * - 回傳每行的單價、獎勵點與小計，供購物車顯示與下單校驗
 */
const Input = z.object({
  lines: z
    .array(
      z.object({
        product_id: z.string().uuid(),
        quantity: z.number().int().min(1).max(9999),
      }),
    )
    .min(1)
    .max(100),
});

export type QuoteCartLine = {
  product_id: string;
  quantity: number;
  unit_price: number;
  unit_reward_points: number;
  line_subtotal: number;
  line_reward_points: number;
  tier_applied: boolean;
  tier_min_qty: number | null;
  tier_max_qty: number | null;
  visibility: string;
};

export const quoteCartLines = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => Input.parse(d))
  .handler(async ({ data }) => {
    // Use caller's bearer token (if any) so the RPC sees the correct identity.
    const authHeader = getRequestHeader("authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const client = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      {
        auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
        global: token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
      },
    );

    const results: QuoteCartLine[] = [];
    let total = 0;
    let totalReward = 0;

    for (const line of data.lines) {
      const { data: row, error } = await client.rpc("quote_wholesale_price" as any, {
        _product_id: line.product_id,
        _qty: line.quantity,
      });
      if (error) {
        return { ok: false as const, error: "quote_failed" as const };
      }
      const first = Array.isArray(row) ? row[0] : row;
      if (!first) {
        return { ok: false as const, error: "product_unavailable" as const, product_id: line.product_id };
      }
      const unit = Number(first.unit_price) || 0;
      const reward = Number(first.unit_reward_points) || 0;
      const subtotal = unit * line.quantity;
      const rewardSum = reward * line.quantity;
      total += subtotal;
      totalReward += rewardSum;
      results.push({
        product_id: line.product_id,
        quantity: line.quantity,
        unit_price: unit,
        unit_reward_points: reward,
        line_subtotal: subtotal,
        line_reward_points: rewardSum,
        tier_applied: Boolean(first.applied),
        tier_min_qty: first.tier_min_qty ?? null,
        tier_max_qty: first.tier_max_qty ?? null,
        visibility: first.visibility ?? "none",
      });
    }

    return {
      ok: true as const,
      lines: results,
      subtotal: total,
      total_reward_points: totalReward,
    };
  });
