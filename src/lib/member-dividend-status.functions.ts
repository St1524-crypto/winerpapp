import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type DividendPoolStatus = {
  kind: "consumption" | "business";
  label: string;
  eligible: boolean;
  status: "active" | "stopped";
  statusLabel: string;
  reasons: string[];
  cap: number;
  totalEarnings: number;
  remaining: number | null;
  capReached: boolean;
  startsOn: string | null;
  endsOn: string | null;
  task: { deadline: string | null; text: string; progress: string } | null;
};

const CONSUMPTION_TIERS = new Set(["E", "A"]);
const BUSINESS_TIERS = new Set(["STAR1", "STAR2", "STAR3", "STAR4", "STAR5", "STAR6", "STAR7", "DIRECTOR"]);

function twToday() {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Taipei" })).toISOString().slice(0, 10);
}

function zhDate(d: string | null) {
  if (!d) return "—";
  const [, m, day] = d.split("-");
  return `${Number(m)}月${Number(day)}日`;
}

/** 會員自己的分紅資格狀態（消費分紅 / 營業分紅）：是否分紅中、停止原因、領獎上限、續領任務 */
export const getMyDividendStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const userId = (context as any).userId as string;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as any;
    const { computeMemberEarnings, resolveTierCode } = await import("@/lib/member-earnings.server");
    const today = twToday();
    const ym = Number(today.slice(0, 4) + today.slice(5, 7));

    const [{ data: profile }, { data: grants }, { data: tiers }, earnings] = await Promise.all([
      admin.from("profiles").select("id, legacy_rank, vip_tier, is_vip, vip_expires_at").eq("id", userId).maybeSingle(),
      admin
        .from("member_bonus_eligibility_grants")
        .select("pool_kind, starts_on, ends_on")
        .eq("user_id", userId),
      admin.from("vip_tiers").select("code, business_bonus_cap_amount, upgrade_bonus_cap_amount"),
      computeMemberEarnings(admin, [userId]),
    ]);

    const tierCode = resolveTierCode(profile ?? null);
    const tierRow = (tiers ?? []).find((t: any) => t.code === tierCode) ?? null;
    const total = earnings.get(userId)?.total ?? 0;
    const vipExpired = !!profile?.vip_expires_at && Date.parse(profile.vip_expires_at) < Date.now();

    // 續領條件進度
    const [{ data: referredVips }, { data: monthly }] = await Promise.all([
      admin.from("profiles").select("id, is_vip, legacy_rank, vip_tier, created_at").eq("referred_by", userId),
      admin.from("monthly_responsibility_points").select("points").eq("member_id", userId).eq("ym", ym).maybeSingle(),
    ]);
    const refs = (referredVips ?? []) as any[];
    const monthlyPoints = Number(monthly?.points ?? 0);

    const build = (kind: "consumption" | "business"): DividendPoolStatus => {
      const isConsumption = kind === "consumption";
      const label = isConsumption ? "消費分紅" : "營業分紅";
      const grant = (grants ?? []).find((g: any) => g.pool_kind === kind) ?? null;
      const cap = Number(
        (isConsumption ? tierRow?.business_bonus_cap_amount : tierRow?.upgrade_bonus_cap_amount) ?? 0,
      );
      const capReached = cap > 0 && total >= cap;
      const tierOk = tierCode ? (isConsumption ? CONSUMPTION_TIERS : BUSINESS_TIERS).has(tierCode) : false;
      const inPeriod = !!grant && String(grant.starts_on) <= today && String(grant.ends_on) >= today;

      const reasons: string[] = [];
      if (!tierOk) {
        reasons.push(
          isConsumption
            ? `目前位階 ${tierCode ?? "未設定"} 不符合消費分紅資格（限 E／A 級）`
            : `目前位階 ${tierCode ?? "未設定"} 不符合營業分紅資格（限一星以上）`,
        );
      }
      if (tierOk && !grant) reasons.push(`未列入${label}合格名單`);
      if (tierOk && grant && !inPeriod) {
        reasons.push(
          String(grant.ends_on) < today
            ? `合格期間已於 ${grant.ends_on} 到期，須重新達成續領條件`
            : `合格期間自 ${grant.starts_on} 起生效`,
        );
      }
      if (capReached) reasons.push(`已領完上限 ${cap.toLocaleString()}`);
      if (vipExpired) reasons.push("VIP 年費已到期，續約後才可繼續領取");

      const vipRefCount = refs.filter((r) => r.is_vip).length;
      const eRefCount = refs.filter((r) => {
        const code = String(r.legacy_rank ?? r.vip_tier ?? "").trim();
        return code === "E代理商" || code.toUpperCase() === "E";
      }).length;

      const task = grant
        ? isConsumption
          ? {
              deadline: grant.ends_on as string,
              text: `${zhDate(grant.ends_on)}前須推薦 1 位 VIP，才可續領消費分紅`,
              progress: `目前已推薦 VIP：${vipRefCount} 位`,
            }
          : {
              deadline: grant.ends_on as string,
              text: `${zhDate(grant.ends_on)}前須達成復購 200 點，並培養 1 位 E 級會員，才可續領營業分紅`,
              progress: `本月復購 ${monthlyPoints} / 200 點 · E 級會員 ${eRefCount} / 1 位`,
            }
        : null;

      const active = reasons.length === 0 && inPeriod;
      return {
        kind,
        label,
        eligible: tierOk,
        status: active ? "active" : "stopped",
        statusLabel: active ? `${label}中` : "停止分紅",
        reasons,
        cap,
        totalEarnings: total,
        remaining: cap > 0 ? Math.max(0, cap - total) : null,
        capReached,
        startsOn: grant?.starts_on ?? null,
        endsOn: grant?.ends_on ?? null,
        task,
      };
    };

    return { today, tierCode, pools: [build("consumption"), build("business")] };
  });
