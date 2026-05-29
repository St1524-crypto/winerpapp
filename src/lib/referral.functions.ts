import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/* ───────────────────────── 公開：VIP 行銷頁資料 ───────────────────────── */
export const getReferrerPublicProfile = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ code: z.string().trim().min(2).max(64) }).parse(d),
  )
  .handler(async ({ data }) => {
    const raw = data.code.trim();
    // 依序嘗試：referral_code / member_no / marketing_slug / phone
    let prof: any = null;
    const upper = raw.toUpperCase();
    const tries: Array<[string, any]> = [
      ["referral_code", upper],
      ["member_no", upper],
      ["marketing_slug", raw],
      ["phone", raw.replace(/[\s-]/g, "")],
    ];
    for (const [col, val] of tries) {
      const q = supabaseAdmin
        .from("profiles")
        .select("id, name, member_no, referral_code, marketing_slug, avatar_url, phone, is_vip, current_company_id")
        .limit(1);
      const { data: row } = col === "marketing_slug"
        ? await q.ilike(col, val).maybeSingle()
        : await q.eq(col, val).maybeSingle();
      if (row) { prof = row; break; }
    }
    if (!prof) return { found: false as const };
    if (!prof.is_vip) {
      // 仍允許顯示，但標註非 VIP（前端可選擇隱藏購買 CTA）
    }

    // 公司資訊
    let company: { id: string; slug: string; company_name: string; logo_url: string | null } | null = null;
    if (prof.current_company_id) {
      const { data: co } = await supabaseAdmin
        .from("companies")
        .select("id, slug, company_name, logo_url")
        .eq("id", prof.current_company_id)
        .maybeSingle();
      company = (co as any) ?? null;
    }

    // 推薦商品（公司商品前 8 個）
    let products: any[] = [];
    if (company) {
      const { data: ps } = await supabaseAdmin
        .from("products")
        .select("id, name, sku, price, wholesale_price, image, status")
        .eq("company_id", company.id)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(8);
      products = ps ?? [];
    }

    return {
      found: true as const,
      referrer: {
        id: prof.id,
        name: prof.name,
        memberNo: prof.member_no,
        referralCode: prof.referral_code,
        marketingSlug: prof.marketing_slug,
        avatarUrl: prof.avatar_url,
        isVip: !!prof.is_vip,
      },
      company,
      products,
    };
  });

/* ───────────────── 註冊後綁定推薦人（永久，僅綁一次） ───────────────── */
export const bindSponsorByCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ code: z.string().trim().min(2).max(64) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const me = context.userId;
    // 已綁定 → 不覆寫
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("referred_by")
      .eq("id", me)
      .maybeSingle();
    if ((prof as any)?.referred_by) return { ok: false, reason: "already_bound" };

    // 解析推薦人
    const raw = data.code.trim();
    const upper = raw.toUpperCase();
    const tries: Array<[string, string]> = [
      ["referral_code", upper],
      ["member_no", upper],
      ["marketing_slug", raw],
      ["phone", raw.replace(/[\s-]/g, "")],
    ];
    let refId: string | null = null;
    for (const [col, val] of tries) {
      const q = supabaseAdmin.from("profiles").select("id").limit(1);
      const { data: r } = col === "marketing_slug"
        ? await q.ilike(col, val).maybeSingle()
        : await q.eq(col, val).maybeSingle();
      if (r?.id) { refId = r.id; break; }
    }
    if (!refId) return { ok: false, reason: "not_found" };
    if (refId === me) return { ok: false, reason: "self" };

    await supabaseAdmin.from("profiles").update({ referred_by: refId }).eq("id", me);
    return { ok: true, sponsor_id: refId };
  });

/* ───────────── 訂單付款後 → 計算推薦人獎勵點（單一訂單只能結算一次） ───────────── */
async function applyPoints(userId: string, amount: number, source: string, orderId: string, note: string) {
  const { data: w0 } = await supabaseAdmin
    .from("member_points_wallet")
    .select("user_id, reward_points")
    .eq("user_id", userId)
    .maybeSingle();
  let current = 0;
  if (!w0) {
    await supabaseAdmin.from("member_points_wallet").insert({ user_id: userId });
  } else {
    current = Number((w0 as any).reward_points ?? 0);
  }
  const after = current + amount;
  await supabaseAdmin.from("member_points_wallet")
    .update({ reward_points: after, updated_at: new Date().toISOString() })
    .eq("user_id", userId);
  await supabaseAdmin.from("point_transactions").insert({
    user_id: userId,
    point_type: "reward",
    amount,
    balance_after: after,
    source,
    reference_id: orderId,
    note,
  });
}

export const processOrderCommission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // 權限：管理員 / 財務 / 業務 才能手動觸發
    const { data: roles } = await supabaseAdmin
      .from("user_roles").select("role").eq("user_id", context.userId);
    const roleList = (roles ?? []).map((r: any) => r.role);
    const isAdmin = roleList.some((r) => ["super_admin", "admin", "finance", "sales"].includes(r));
    if (!isAdmin) throw new Error("沒有權限結算佣金");

    const { data: order } = await supabaseAdmin
      .from("sales_orders")
      .select("id, order_no, user_id, referrer_id, subtotal, payment_status")
      .eq("id", data.orderId)
      .maybeSingle();
    if (!order) throw new Error("訂單不存在");
    if ((order as any).payment_status !== "paid") {
      throw new Error("訂單尚未付款，無法結算佣金");
    }
    if (!(order as any).referrer_id) {
      throw new Error("此訂單無推薦人");
    }
    if ((order as any).referrer_id === (order as any).user_id) {
      throw new Error("禁止自己推薦自己");
    }

    // 防止重複：referral_logs.order_id UNIQUE
    const { data: existing } = await supabaseAdmin
      .from("referral_logs").select("id").eq("order_id", (order as any).id).maybeSingle();
    if (existing) throw new Error("此訂單佣金已結算");

    // 確認推薦人仍是 VIP
    const { data: refProf } = await supabaseAdmin
      .from("profiles")
      .select("id, name, is_vip, vip_expires_at")
      .eq("id", (order as any).referrer_id)
      .maybeSingle();
    if (!refProf || !(refProf as any).is_vip) {
      throw new Error("推薦人非 VIP，不發放佣金");
    }
    const exp = (refProf as any).vip_expires_at;
    if (exp && new Date(exp) <= new Date()) {
      throw new Error("推薦人 VIP 已過期");
    }

    // 取最新 VIP 方案的 referral_rate_percent
    const { data: vipMem } = await supabaseAdmin
      .from("vip_memberships")
      .select("plan_id, expires_at")
      .eq("user_id", (refProf as any).id)
      .order("expires_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    let rate = 0;
    if (vipMem?.plan_id) {
      const { data: plan } = await supabaseAdmin
        .from("vip_plans").select("referral_rate_percent").eq("id", vipMem.plan_id).maybeSingle();
      rate = Number((plan as any)?.referral_rate_percent ?? 0);
    }
    const base = Number((order as any).subtotal ?? 0);
    const points = Math.floor(base * rate / 100);

    await supabaseAdmin.from("referral_logs").insert({
      order_id: (order as any).id,
      referrer_id: (refProf as any).id,
      buyer_id: (order as any).user_id,
      base_amount: base,
      rate_percent: rate,
      points,
      status: points > 0 ? "granted" : "skipped",
      note: `訂單 ${(order as any).order_no} 佣金結算`,
    });

    if (points > 0) {
      await applyPoints(
        (refProf as any).id,
        points,
        "referral_commission",
        (order as any).id,
        `訂單 ${(order as any).order_no} 推薦佣金 (${rate}%)`,
      );
    }

    return { ok: true, points, rate };
  });

/* ───────────── VIP 自己的收益儀表板 ───────────── */
export const getMyVipEarnings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const me = context.userId;
    const { data: logs } = await supabaseAdmin
      .from("referral_logs")
      .select("id, order_id, buyer_id, base_amount, rate_percent, points, status, note, created_at")
      .eq("referrer_id", me)
      .order("created_at", { ascending: false })
      .limit(500);

    // 取被推薦人名單
    const { data: team } = await supabaseAdmin
      .from("profiles")
      .select("id, name, member_no, phone, created_at, is_vip")
      .eq("referred_by", me)
      .order("created_at", { ascending: false });

    const buyerIds = Array.from(new Set((logs ?? []).map((l: any) => l.buyer_id).filter(Boolean)));
    let buyerMap = new Map<string, any>();
    if (buyerIds.length) {
      const { data: bs } = await supabaseAdmin
        .from("profiles").select("id, name, member_no").in("id", buyerIds);
      buyerMap = new Map((bs ?? []).map((b: any) => [b.id, b]));
    }

    const now = Date.now();
    const today = (logs ?? []).filter((l: any) => now - new Date(l.created_at).getTime() < 86400000);
    const month = (logs ?? []).filter((l: any) => now - new Date(l.created_at).getTime() < 30 * 86400000);
    const sum = (arr: any[]) => arr.reduce((s, x) => s + Number(x.points ?? 0), 0);

    return {
      stats: {
        today_points: sum(today),
        month_points: sum(month),
        total_points: sum(logs ?? []),
        team_count: team?.length ?? 0,
        order_count: (logs ?? []).length,
      },
      team: team ?? [],
      logs: (logs ?? []).map((l: any) => ({
        ...l,
        buyer_name: buyerMap.get(l.buyer_id)?.name ?? "—",
        buyer_no: buyerMap.get(l.buyer_id)?.member_no ?? "",
      })),
    };
  });

/* ───────────── 管理員：所有推薦排行與紀錄 ───────────── */
export const adminListReferralOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: roles } = await supabaseAdmin
      .from("user_roles").select("role").eq("user_id", context.userId);
    const isAdmin = (roles ?? []).some((r: any) =>
      ["super_admin", "admin", "finance", "sales"].includes(r.role),
    );
    if (!isAdmin) throw new Error("沒有權限");

    const { data: logs } = await supabaseAdmin
      .from("referral_logs")
      .select("referrer_id, points, base_amount, created_at")
      .order("created_at", { ascending: false });

    const byRef = new Map<string, { total_points: number; total_base: number; count: number }>();
    for (const l of logs ?? []) {
      const r = (l as any).referrer_id;
      const cur = byRef.get(r) ?? { total_points: 0, total_base: 0, count: 0 };
      cur.total_points += Number((l as any).points ?? 0);
      cur.total_base += Number((l as any).base_amount ?? 0);
      cur.count += 1;
      byRef.set(r, cur);
    }
    const ids = Array.from(byRef.keys());
    let profMap = new Map<string, any>();
    if (ids.length) {
      const { data: ps } = await supabaseAdmin
        .from("profiles").select("id, name, member_no, phone, is_vip").in("id", ids);
      profMap = new Map((ps ?? []).map((p: any) => [p.id, p]));
    }
    const ranking = ids.map((id) => ({
      id,
      ...profMap.get(id),
      ...byRef.get(id)!,
    })).sort((a, b) => b.total_points - a.total_points);

    // 最近 200 筆紀錄
    const { data: recent } = await supabaseAdmin
      .from("referral_logs")
      .select("id, order_id, referrer_id, buyer_id, base_amount, rate_percent, points, status, created_at")
      .order("created_at", { ascending: false })
      .limit(200);

    return { ranking, recent: recent ?? [] };
  });

/* ───────────── 管理員：調整推薦歸屬 ───────────── */
export const adminUpdateSponsor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      userId: z.string().uuid(),
      sponsorId: z.string().uuid().nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: roles } = await supabaseAdmin
      .from("user_roles").select("role").eq("user_id", context.userId);
    const isAdmin = (roles ?? []).some((r: any) =>
      ["super_admin", "admin"].includes(r.role),
    );
    if (!isAdmin) throw new Error("沒有權限");
    if (data.sponsorId === data.userId) throw new Error("不可指定自己為推薦人");

    await supabaseAdmin.from("profiles")
      .update({ referred_by: data.sponsorId })
      .eq("id", data.userId);
    return { ok: true };
  });
