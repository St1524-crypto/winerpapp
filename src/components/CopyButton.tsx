import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export interface CopyButtonProps {
  /** 要複製到剪貼簿的文字 */
  value: string;
  /** 顯示在 Toast 中的項目名稱（例如「統編」「電話」） */
  label?: string;
  /** 按鈕額外 className */
  className?: string;
  /** 圖示尺寸（預設 h-3.5 w-3.5） */
  iconSize?: number;
  /** 按鈕尺寸（對應 Button size prop） */
  size?: "default" | "sm" | "icon" | "lg";
  /** 複製成功提示語系 */
  successMessage?: string;
  /** 複製失敗提示語系 */
  errorMessage?: string;
  /** 是否阻止事件冒泡（預設 true，避免觸發父層 Collapsible 等） */
  stopPropagation?: boolean;
}

export function CopyButton({
  value,
  label,
  className,
  iconSize = 3.5,
  size = "icon",
  successMessage,
  errorMessage = "複製失敗",
  stopPropagation = true,
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    if (stopPropagation) {
      e.stopPropagation();
    }
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success(successMessage ?? (label ? `已複製${label}` : "已複製"));
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error(errorMessage);
    }
  };

  return (
    <Button
      type="button"
      size={size}
      variant="ghost"
      className={cn("h-6 w-6 shrink-0", className)}
      onClick={handleCopy}
      aria-label={label ? `複製${label}` : "複製"}
    >
      {copied ? (
        <Check
          className="text-emerald-600"
          style={{ width: iconSize * 4, height: iconSize * 4 }}
        />
      ) : (
        <Copy
          className="text-muted-foreground"
          style={{ width: iconSize * 4, height: iconSize * 4 }}
        />
      )}
    </Button>
  );
}
