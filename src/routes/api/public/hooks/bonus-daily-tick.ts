import { createFileRoute } from "@tanstack/react-router";
import { cronAuthErrorResponse, requireCronSecret } from "@/lib/cron-auth.server";

/**
 * 日結算 / 發放排程入口
 * 由 pg_cron 每天呼叫，內部判斷：
 *  - 是否到下次日結算時間 → 跑 daily settlement
 *  - 是否為自動發放模式 → 跑到期發放
 *  - 是否為月結算日且 mode=auto → 跑當月月結算
 */
export const Route = createFileRoute("/api/public/hooks/bonus-daily-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = requireCronSecret(request);
        if (!auth.ok) return cronAuthErrorResponse(auth);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: s } = await supabaseAdmin
          .from("bonus_settings").select("*").limit(1).maybeSingle();
        if (!s) return new Response(JSON.stringify({ ok: false, reason: "no_settings" }), { status: 500 });

        const now = new Date();
        const today = now.toISOString().slice(0, 10);
        const result: Record<string, any> = { ran_at: now.toISOString() };

        // ── 日結算 ──
        if ((s as any).daily_bonus_auto_enabled && new Date((s as any).daily_next_settlement_at) <= now) {
          try {
            const { data: daily, error: dailyError } = await (supabaseAdmin as any).rpc("settle_daily_bonus", {
              _created_by: null,
              _advance_next: true,
            });
            if (dailyError) throw new Error(dailyError.message);
            result.daily = daily;
          } catch (e: any) {
            result.daily_error = e.message;
          }
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

        if (false && (s as any).reward_release_mode === "auto") {
          try {
            const { data: due } = await supabaseAdmin
              .from("bonus_records")
              .select("id, member_id, bonus_points, bonus_type")
              .eq("status", "waiting_release")
              .lte("release_date", today).limit(2000);
            let released = 0;
            for (const r of (due ?? [])) {
              const pts = Number((r as any).bonus_points ?? 0);
              if (pts > 0) {
                const { data: w0 } = await supabaseAdmin
                  .from("member_points_wallet").select("reward_points")
                  .eq("user_id", (r as any).member_id).maybeSingle();
                if (!w0) {
                  await supabaseAdmin.from("member_points_wallet").insert({ user_id: (r as any).member_id });
                }
                const cur = Number((w0 as any)?.reward_points ?? 0);
                const after = cur + pts;
                await supabaseAdmin.from("member_points_wallet")
                  .update({ reward_points: after, updated_at: now.toISOString() })
                  .eq("user_id", (r as any).member_id);
                await supabaseAdmin.from("point_transactions").insert({
                  user_id: (r as any).member_id,
                  point_type: "reward",
                  amount: pts,
                  balance_after: after,
                  source: `bonus_${(r as any).bonus_type}`,
                  reference_id: (r as any).id,
                  note: `獎金自動發放`,
                });
                await supabaseAdmin.from("reward_wallet_logs").insert({
                  member_id: (r as any).member_id,
                  bonus_record_id: (r as any).id,
                  points: pts,
                  type: "earn",
                  status: "success",
                  description: "auto release",
                });
              }
              await supabaseAdmin.from("bonus_records")
                .update({ status: "released", released_at: now.toISOString() })
                .eq("id", (r as any).id);
              released++;
            }
            result.release = { count: released };
          } catch (e: any) {
            result.release_error = e.message;
          }
        }

        // ── 月結算（auto 模式 + 結算日當天）──
        if ((s as any).monthly_bonus_mode === "auto" && now.getDate() === Number((s as any).monthly_bonus_settlement_day)) {
          // 結算「上個月」
          const prev = new Date(Date.UTC(now.getFullYear(), now.getMonth() - 1, 1));
          const yyyymm = `${prev.getUTCFullYear()}${String(prev.getUTCMonth() + 1).padStart(2, "0")}`;
          result.monthly_target = yyyymm;
          try {
            const { settleMonthlyBonus } = await import("@/lib/monthly-settlement.server");
            result.monthly = await settleMonthlyBonus({ yyyymm, source: "cron" });
          } catch (e: any) {
            result.monthly_error = e.message;
          }
          // 註：實際月結算邏輯較重，由管理員透過後台或下次擴充處理。
        }

        return new Response(JSON.stringify({ ok: true, ...result }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
