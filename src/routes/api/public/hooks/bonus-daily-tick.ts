import { createFileRoute } from "@tanstack/react-router";
import { cronAuthErrorResponse, requireAnyCronSecret } from "@/lib/cron-auth.server";

const DAY_MS = 24 * 60 * 60 * 1000;
const toDateOnly = (date: Date) => date.toISOString().slice(0, 10);

/**
 * 每日獎金排程入口。
 *
 * pg_cron 在台灣時間 03:00 呼叫，執行的是前一個營業日的池分紅。
 * 因此營業分紅與消費分紅都必須用「來源訂單的台灣日期」作為日基準，
 * 不可直接使用凌晨執行當天的 settlement_date。
 */
export const Route = createFileRoute("/api/public/hooks/bonus-daily-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = requireAnyCronSecret(request, "BONUS_DAILY_TICK_CRON_TOKEN");
        if (!auth.ok) return cronAuthErrorResponse(auth);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: s } = await supabaseAdmin
          .from("bonus_settings")
          .select("*")
          .limit(1)
          .maybeSingle();
        if (!s) return new Response(JSON.stringify({ ok: false, reason: "no_settings" }), { status: 500 });

        const now = new Date();
        const twNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
        const settlementDate = toDateOnly(twNow);
        const dailyDueAt = new Date((s as any).daily_next_settlement_at);
        const fallbackPoolSourceDate = toDateOnly(new Date(twNow.getTime() - DAY_MS));
        const poolSourceDate = Number.isNaN(dailyDueAt.getTime())
          ? fallbackPoolSourceDate
          : toDateOnly(dailyDueAt);
        const result: Record<string, any> = {
          ran_at: now.toISOString(),
          settlement_date: settlementDate,
          pool_source_date: poolSourceDate,
        };

        let dailyOk = false;
        // 60 秒容忍窗避免 pg_cron 整點觸發時早於 daily_next_settlement_at 幾秒而略過。
        const dailyTolerance = new Date(now.getTime() + 60 * 1000);
        if ((s as any).daily_bonus_auto_enabled && dailyDueAt <= dailyTolerance) {
          try {
            const { data: daily, error: dailyError } = await (supabaseAdmin as any).rpc("settle_daily_bonus", {
              _created_by: null,
              _advance_next: true,
            });
            if (dailyError) throw new Error(dailyError.message);
            result.daily = daily;
            dailyOk = true;
          } catch (e: any) {
            result.daily_error = e.message;
          }
        }

        if (dailyOk) {
          // 池分紅日基準：來源訂單台灣日期 = poolSourceDate；
          // 以每張來源訂單去重後的 base_amount 加總，避免多代獎金重複計入。
          let dailyTotalRewardPoints = 0;
          try {
            const { data: poolBase, error: sumError } = await (supabaseAdmin as any).rpc(
              "calculate_daily_order_reward_points_by_source_date",
              { _source_date: poolSourceDate },
            );
            if (sumError) throw new Error(sumError.message);
            dailyTotalRewardPoints = Number(poolBase ?? 0);
            result.daily_total_reward_points = dailyTotalRewardPoints;
            result.daily_total_reward_points_basis = "source_order_tw_date_distinct_order_base_amount";
          } catch (e: any) {
            result.daily_total_reward_points_error = e.message;
          }

          // 營業分紅：一星以上 VIP，依同一來源訂單日基準平均分配。
          try {
            const { data: revenue, error: revErr } = await (supabaseAdmin as any).rpc(
              "distribute_daily_revenue_bonus",
              { _date: poolSourceDate },
            );
            if (revErr) throw new Error(revErr.message);
            result.daily_revenue_bonus = Array.isArray(revenue) ? revenue[0] : revenue;
          } catch (e: any) {
            result.daily_revenue_bonus_error = e.message;
          }

          // 消費分紅：V/S/T/E/A active pool，依同一來源訂單日基準平均分配。
          try {
            const { data: pools, error: poolErr } = await (supabaseAdmin as any)
              .from("vip_bonus_pools")
              .select("id, code, status")
              .eq("status", "active");
            if (poolErr) throw new Error(poolErr.message);
            const poolResults: any[] = [];
            for (const pool of pools ?? []) {
              try {
                const { data: payout, error: payErr } = await (supabaseAdmin as any).rpc(
                  "distribute_vip_bonus_pool_daily",
                  {
                    _pool_id: (pool as any).id,
                    _settlement_date: poolSourceDate,
                    _daily_total_reward_points: dailyTotalRewardPoints,
                  },
                );
                if (payErr) throw new Error(payErr.message);
                poolResults.push({
                  pool_id: (pool as any).id,
                  code: (pool as any).code,
                  result: Array.isArray(payout) ? payout[0] : payout,
                });
              } catch (e: any) {
                poolResults.push({ pool_id: (pool as any).id, code: (pool as any).code, error: e.message });
              }
            }
            result.vip_bonus_pools = poolResults;
          } catch (e: any) {
            result.vip_bonus_pools_error = e.message;
          }

          result.national_bonus_skipped = "moved_to_monthly_settlement";
        }

        if ((s as any).reward_release_mode === "auto") {
          try {
            const { data: release, error: releaseError } = await (supabaseAdmin as any).rpc("release_bonus_rewards", {
              _record_ids: null,
              _limit: 2000,
            });
            if (releaseError) throw new Error(releaseError.message);
            result.release = release;
          } catch (e: any) {
            result.release_error = e.message;
          }
        }

        if ((s as any).monthly_bonus_mode === "auto" && now.getDate() === Number((s as any).monthly_bonus_settlement_day)) {
          const prev = new Date(Date.UTC(now.getFullYear(), now.getMonth() - 1, 1));
          const yyyymm = `${prev.getUTCFullYear()}${String(prev.getUTCMonth() + 1).padStart(2, "0")}`;
          result.monthly_target = yyyymm;
          try {
            const { settleMonthlyBonus } = await import("@/lib/monthly-settlement.server");
            result.monthly = await settleMonthlyBonus({ yyyymm, source: "cron" });
          } catch (e: any) {
            result.monthly_error = e.message;
          }
        }

        return new Response(JSON.stringify({ ok: true, ...result }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
