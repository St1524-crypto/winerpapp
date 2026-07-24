import { MessageCircle } from "lucide-react";
export const _iconRef = MessageCircle; // keep re-export chain; LineQuickButton below uses it

export const LINE_OA_ID = "@win8799999";
export const LINE_OA_URL = "https://line.me/R/ti/p/%40win8799999";

/**
 * 全站 LINE 客服入口：
 * - 後台不再顯示浮動 LINE 按鈕（改為任務小幫手）。
 * - 前台不顯示浮動按鈕，改由 footer「聯絡我們」下方入口取代。
 */
export function LineContactButton() {
  return null;
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
