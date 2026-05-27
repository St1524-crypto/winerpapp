import { useState } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface CompanyLogoProps {
  src?: string | null;
  alt: string;
  fallbackInitial?: string;
  className?: string;
  imgClassName?: string;
  fallbackClassName?: string;
  size?: "sm" | "md" | "lg" | "xl";
}

const sizeMap = {
  sm: "h-6 w-6 text-[10px]",
  md: "h-9 w-9 text-sm",
  lg: "h-14 w-14 text-lg",
  xl: "h-20 w-20 text-2xl",
};

export function CompanyLogo({
  src,
  alt,
  fallbackInitial,
  className,
  imgClassName,
  fallbackClassName,
  size = "md",
}: CompanyLogoProps) {
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");

  const initial = fallbackInitial ?? alt.charAt(0);
  const hasSrc = typeof src === "string" && src.trim().length > 0;

  return (
    <div
      className={cn(
        "relative inline-flex items-center justify-center rounded-xl overflow-hidden shrink-0",
        sizeMap[size],
        className,
      )}
    >
      {/* Loading spinner */}
      {hasSrc && status === "loading" && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-muted/40">
          <Loader2 className="h-1/2 w-1/2 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Actual image */}
      {hasSrc && status !== "error" && (
        <img
          src={src}
          alt={alt}
          onLoad={() => setStatus("loaded")}
          onError={() => setStatus("error")}
          className={cn("h-full w-full object-contain", imgClassName)}
        />
      )}

      {/* Fallback: gradient initial letter */}
      {(!hasSrc || status === "error") && (
        <div
          className={cn(
            "h-full w-full bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center",
            fallbackClassName,
          )}
        >
          <span className="text-primary-foreground font-bold select-none">{initial}</span>
        </div>
      )}
    </div>
  );
}
