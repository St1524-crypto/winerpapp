import { ChevronRight, ChevronLeft } from "lucide-react";
import {
  useAdminFabsHidden,
  useIsAdminRoute,
  setAdminFabsHidden,
} from "@/hooks/use-admin-fabs";

/**
 * 後台專用：一鍵收合／展開右下角的 LINE 客服與 AI 行政助理浮動按鈕。
 * 收合後只保留一顆極小的箭頭 tab，避免遮擋功能鍵。
 */
export function AdminFabToggle() {
  const isAdmin = useIsAdminRoute();
  const hidden = useAdminFabsHidden();
  if (!isAdmin) return null;

  return (
    <button
      type="button"
      aria-label={hidden ? "展開浮動按鈕" : "收合浮動按鈕"}
      title={hidden ? "展開浮動按鈕" : "收合浮動按鈕"}
      onClick={() => setAdminFabsHidden(!hidden)}
      className="fixed z-[70] flex items-center justify-center rounded-l-md border bg-background/80 hover:bg-background text-muted-foreground hover:text-foreground shadow-sm transition
                 h-6 w-5 right-0 bottom-14 print:hidden"
    >
      {hidden ? (
        <ChevronLeft className="h-3.5 w-3.5" />
      ) : (
        <ChevronRight className="h-3.5 w-3.5" />
      )}
    </button>
  );
}
