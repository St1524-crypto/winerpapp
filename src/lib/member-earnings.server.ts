/**
 * 會員「累計總收益」計算（與會員中心「獎金明細」同一定義）：
 * 匯入累計獎金（profiles.legacy_bonus_total） + 新增獎金
 * 新增獎金 = 點數異動中屬於獎金來源的正向金額 + 現金錢包「獎金發放」入帳
 */
export type MemberEarnings = { legacy: number; bonus: number; total: number };

const BONUS_SOURCES = new Set(["vip_bonus", "referral_commission"]);

export async function computeMemberEarnings(
  admin: any,
  ids: string[],
): Promise<Map<string, MemberEarnings>> {
  const map = new Map<string, MemberEarnings>();
  if (!ids.length) return map;
  ids.forEach((id) => map.set(id, { legacy: 0, bonus: 0, total: 0 }));

  const [{ data: profiles }, { data: pts }, { data: cash }] = await Promise.all([
    admin.from("profiles").select("id, legacy_bonus_total").in("id", ids),
    admin.from("point_transactions").select("user_id, amount, source").in("user_id", ids),
    admin.from("cash_transactions").select("user_id, amount, status, note").in("user_id", ids),
  ]);

  (profiles ?? []).forEach((p: any) => {
    const e = map.get(p.id);
    if (e) e.legacy = Number(p.legacy_bonus_total ?? 0);
  });

  (pts ?? []).forEach((t: any) => {
    const amount = Number(t.amount ?? 0);
    const src = String(t.source ?? "");
    if (amount <= 0) return;
    if (!(src.startsWith("bonus") || BONUS_SOURCES.has(src))) return;
    const e = map.get(t.user_id);
    if (e) e.bonus += amount;
  });

  (cash ?? []).forEach((c: any) => {
    const amount = Number(c.amount ?? 0);
    if (amount <= 0) return;
    if (!["completed", "approved"].includes(String(c.status))) return;
    if (!String(c.note ?? "").startsWith("獎金發放")) return;
    const e = map.get(c.user_id);
    if (e) e.bonus += amount;
  });

  map.forEach((e) => {
    e.total = e.legacy + e.bonus;
  });
  return map;
}

/** 舊制中文位階（legacy_rank）→ vip_tiers.code */
const LEGACY_TIER_MAP: Record<string, string> = {
  VIP會員: "V",
  S經銷商: "S",
  T代理商: "T",
  E代理商: "E",
  A代理商: "A",
  一星代理: "STAR1",
  二星代理: "STAR2",
  三星代理: "STAR3",
  四星代理: "STAR4",
  五星代理: "STAR5",
  六星代理: "STAR6",
  七星代理: "STAR7",
  董事: "DIRECTOR",
};

/** 由 legacy_rank / vip_tier 解析 vip_tiers.code（V1~V8 亦對應 STAR1~DIRECTOR） */
export function resolveTierCode(p: { legacy_rank?: string | null; vip_tier?: string | null } | null): string | null {
  if (!p) return null;
  const legacy = String(p.legacy_rank ?? "").trim();
  if (legacy && LEGACY_TIER_MAP[legacy]) return LEGACY_TIER_MAP[legacy]!;
  const raw = String(p.vip_tier ?? legacy).trim().toUpperCase();
  if (!raw) return null;
  const v = /^V([1-8])$/.exec(raw);
  if (v) return v[1] === "8" ? "DIRECTOR" : `STAR${v[1]}`;
  return raw;
}
