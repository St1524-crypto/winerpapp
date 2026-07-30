/** VIP 位階顯示工具：統一由 legacy_rank / vip_tier / current_tier 推導出有效位階代碼與顯示文字。 */

const STAR_CN = ["一", "二", "三", "四", "五", "六", "七"];

export type VipTierSource = {
  legacy_rank?: string | null;
  vip_tier?: string | null;
  current_tier?: string | null;
};

/** 取得有效 VIP 位階代碼（大寫）；無則回傳 null。 */
export function resolveVipTierCode(p: VipTierSource | null | undefined): string | null {
  if (!p) return null;
  const raw = p.legacy_rank ?? p.vip_tier ?? p.current_tier ?? "";
  const code = String(raw).trim().toUpperCase();
  return code || null;
}

/** 位階代碼 → 中文顯示（未知代碼原樣顯示）。 */
export function vipTierLabel(code: string | null | undefined): string {
  if (!code) return "";
  const c = code.trim().toUpperCase();
  const star = /^STAR([1-7])$/.exec(c);
  if (star) return `${c}（${STAR_CN[Number(star[1]) - 1]}星）`;
  if (c === "DIRECTOR") return "DIRECTOR（董事）";
  return c;
}

/** 綜合身分文字：VIP · 位階 / VIP（已到期）/ 經銷商 / 一般。 */
export function vipStatusText(opts: {
  is_vip?: boolean | null;
  is_dealer?: boolean | null;
  tierCode?: string | null;
  vip_expires_at?: string | null;
}): { text: string; tone: "vip" | "expired" | "dealer" | "plain" } {
  const expired =
    !!opts.vip_expires_at && Date.parse(opts.vip_expires_at) < Date.now();
  if (opts.is_vip) {
    const tier = vipTierLabel(opts.tierCode);
    if (expired) return { text: `VIP 已到期${tier ? ` · ${tier}` : ""}`, tone: "expired" };
    return { text: `VIP${tier ? ` · ${tier}` : " · 未設定位階"}`, tone: "vip" };
  }
  if (opts.is_dealer) return { text: "經銷商", tone: "dealer" };
  return { text: "免費會員 / 一般客戶", tone: "plain" };
}
