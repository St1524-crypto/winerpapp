import { MessageCircle } from "lucide-react";
import { useRouterState } from "@tanstack/react-router";

export const LINE_OA_ID = "@win8799999";
export const LINE_OA_URL = "https://line.me/R/ti/p/%40win8799999";

/**
 * Global sticky LINE OA / customer service button.
 * Visible to guests and members across the whole site (shop / cooperation / home).
 * 後台管理路徑（/admin*、/vendor*）自動縮小為 icon 模式，避免遮擋功能鍵。
 */
export function LineContactButton() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const compact = /^\/(admin|vendor)(\/|$)/.test(pathname);

  if (compact) {
    return (
      <a
        href={LINE_OA_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`加入 LINE 官方帳號 ${LINE_OA_ID} 洽詢客服`}
        title="LINE 客服"
        className="fixed z-40 flex items-center justify-center rounded-full bg-[#06C755]/85 hover:bg-[#06C755] text-white shadow-md hover:scale-105 active:scale-95 transition
                   h-8 w-8 bottom-2 right-2 md:h-9 md:w-9 md:bottom-3 md:right-3 print:hidden"
      >
        <MessageCircle className="h-4 w-4" strokeWidth={2.5} />
        <span className="sr-only">LINE 客服</span>
      </a>
    );
  }

  return (
    <a
      href={LINE_OA_URL}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`加入 LINE 官方帳號 ${LINE_OA_ID} 洽詢客服`}
      title="加入 LINE 客服 — 促銷、商品、福利即時諮詢"
      className="fixed z-50 flex items-center gap-2 rounded-full bg-[#06C755] px-4 py-3 text-white shadow-xl shadow-[#06C755]/40 hover:scale-105 active:scale-95 transition
                 bottom-44 right-4 md:bottom-24 md:right-6"
    >
      <MessageCircle className="h-5 w-5" strokeWidth={2.5} />
      <span className="text-sm font-semibold whitespace-nowrap">LINE 客服</span>
      <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-white ring-2 ring-[#06C755]" />
    </a>
  );
}

/** Inline LINE quick-action button, e.g. for the login page. */
export function LineQuickButton({ className = "" }: { className?: string }) {
  return (
    <a
      href={LINE_OA_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex w-full items-center justify-center gap-2 rounded-md bg-[#06C755] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 transition ${className}`}
    >
      <MessageCircle className="h-4 w-4" strokeWidth={2.5} />
      加入 LINE 客服 {LINE_OA_ID}
    </a>
  );
}
