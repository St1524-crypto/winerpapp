// Lightweight mobile device detection (client-side only).
// Uses UA + pointer/touch heuristics with a width fallback.
export function isMobileDevice(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const uaMobile = /Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(ua);
  // iPadOS reports as Mac; treat touch Macs as mobile too
  const iPadOS = /Macintosh/.test(ua) && typeof navigator.maxTouchPoints === "number" && navigator.maxTouchPoints > 1;
  if (uaMobile || iPadOS) return true;
  try {
    const coarse = window.matchMedia?.("(pointer: coarse)").matches;
    if (coarse && window.innerWidth <= 820) return true;
  } catch {}
  return false;
}
