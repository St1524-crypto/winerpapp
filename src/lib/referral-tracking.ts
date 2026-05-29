/**
 * VIP 推薦追蹤 cookie / localStorage
 * 訪客點 /u/{code} 或 /r/{phone} 進站後，保留 90 天，
 * 註冊時自動寫入 profiles.referred_by，下單時自動寫入 sales_orders.referrer_id。
 */
const KEY = "winerp_ref_code";
const TTL_DAYS = 90;

export function setReferralCode(code: string) {
  if (typeof document === "undefined") return;
  const c = code.trim().toUpperCase();
  if (!c) return;
  const maxAge = TTL_DAYS * 86400;
  document.cookie = `${KEY}=${encodeURIComponent(c)}; path=/; max-age=${maxAge}; SameSite=Lax`;
  try { localStorage.setItem(KEY, c); } catch {}
  try { localStorage.setItem(`${KEY}_ts`, Date.now().toString()); } catch {}
}

export function getReferralCode(): string | null {
  if (typeof document === "undefined") return null;
  // cookie 優先
  const m = document.cookie.match(new RegExp(`(?:^|;\\s*)${KEY}=([^;]+)`));
  if (m) return decodeURIComponent(m[1]);
  // localStorage 後備（檢查 TTL）
  try {
    const code = localStorage.getItem(KEY);
    const ts = Number(localStorage.getItem(`${KEY}_ts`) ?? 0);
    if (code && ts && Date.now() - ts < TTL_DAYS * 86400 * 1000) return code;
  } catch {}
  return null;
}

export function clearReferralCode() {
  if (typeof document === "undefined") return;
  document.cookie = `${KEY}=; path=/; max-age=0`;
  try { localStorage.removeItem(KEY); localStorage.removeItem(`${KEY}_ts`); } catch {}
}
