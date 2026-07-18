import { createFileRoute } from "@tanstack/react-router";
import { cronAuthErrorResponse, requireAnyCronSecret } from "@/lib/cron-auth.server";

/**
 * 日結算 / 發放排程入口
 * 由 pg_cron 每天呼叫，內部判斷：
 *  - 是否到下次日結算時間 → 跑 daily settlement + 營業分紅 + VIP 共享池 + 全國分紅
 *  - 是否為自動發放模式 → 跑到期發放
 *  - 是否為月結算日且 mode=auto → 跑當月月結算
 */
export const Route = createFileRoute("/api/public/hooks/bonus-daily-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = requireAnyCronSecret(request, "BONUS_DAILY_TICK_CRON_TOKEN");
        if (!auth.ok) return cronAuthErrorResponse(auth);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: s } = await supabaseAdmin
          .from("bonus_settings").select("*").limit(1).maybeSingle();
        if (!s) return new Response(JSON.stringify({ ok: false, reason: "no_settings" }), { status: 500 });

        const now = new Date();
        // settle_daily_bonus 內部以 Asia/Taipei 的今天為 settlement_date
        const twNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
        const settlementDate = twNow.toISOString().slice(0, 10);
        const result: Record<string, any> = { ran_at: now.toISOString(), settlement_date: settlementDate };

        // ── 日結算 ──
        let dailyOk = false;
        // 容忍 60 秒排程秒差：pg_cron 可能於 19:00:00 觸發，但 daily_next_settlement_at 為 19:00:05
        const dailyDueAt = new Date((s as any).daily_next_settlement_at);
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

        // ── 日結算成功後：計算 daily_total_reward_points 並執行 營業分紅 / VIP 共享池 / 全國分紅 ──
        if (dailyOk) {
          // daily_total_reward_points 定義：當日 referral + repurchase 之 bonus_points 合計
          // 狀態限 waiting_release / released (剛完成日結後皆為 waiting_release)
          let dailyTotalRewardPoints = 0;
          try {
            const { data: rows, error: sumError } = await (supabaseAdmin as any)
              .from("bonus_records")
              .select("bonus_points")
              .eq("settlement_date", settlementDate)
              .in("bonus_type", ["referral", "repurchase"])
              .in("status", ["waiting_release", "released"]);
            if (sumError) throw new Error(sumError.message);
            dailyTotalRewardPoints = (rows ?? []).reduce(
              (acc: number, r: any) => acc + Number(r.bonus_points ?? 0),
              0,
            );
            result.daily_total_reward_points = dailyTotalRewardPoints;
          } catch (e: any) {
            result.daily_total_reward_points_error = e.message;
          }

          // (1) 營業分紅
          try {
            const { data: revenue, error: revErr } = await (supabaseAdmin as any).rpc(
              "distribute_daily_revenue_bonus",
              { _date: settlementDate },
            );
            if (revErr) throw new Error(revErr.message);
            result.daily_revenue_bonus = Array.isArray(revenue) ? revenue[0] : revenue;
          } catch (e: any) {
            result.daily_revenue_bonus_error = e.message;
          }

          // (2) VIP 共享池：對每個 active pool 呼叫
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
                    _settlement_date: settlementDate,
                    _daily_total_reward_points: dailyTotalRewardPoints,
                  },
                );
                if (payErr) throw new Error(payErr.message);
                poolResults.push({ pool_id: (pool as any).id, code: (pool as any).code, result: Array.isArray(payout) ? payout[0] : payout });
              } catch (e: any) {
                poolResults.push({ pool_id: (pool as any).id, code: (pool as any).code, error: e.message });
              }
            }
            result.vip_bonus_pools = poolResults;
          } catch (e: any) {
            result.vip_bonus_pools_error = e.message;
          }

          // (3) 全國分紅：依新獎金制度改為月結執行，日結不再呼叫 distribute_national_bonus_v2。
          //     Batch 3 會於 settle_monthly_bonus 觸發全國分紅發放。
          result.national_bonus_skipped = "moved_to_monthly_settlement";
        }




        // ── 自動發放 ──
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

        // ── 月結算（auto 模式 + 結算日當天）──
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
