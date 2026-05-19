import { useEffect, useRef } from "react";
import { Building2, Check, ChevronsUpDown, Loader2, AlertCircle, RotateCw } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { useCurrentCompany } from "@/hooks/use-current-company";
import { toast } from "sonner";

export function CompanySwitcher() {
  const { current, companies, loading, error, refresh, setCurrent } = useCurrentCompany();
  const lastErrorRef = useRef<string | null>(null);

  useEffect(() => {
    if (error && error !== lastErrorRef.current) {
      lastErrorRef.current = error;
      toast.error("公司清單載入失敗", {
        description: error,
        action: {
          label: "重新嘗試",
          onClick: () => {
            lastErrorRef.current = null;
            refresh();
          },
        },
      });
    }
    if (!error) lastErrorRef.current = null;
  }, [error, refresh]);

  if (loading) {
    return (
      <Button variant="outline" size="sm" disabled className="gap-2">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        <span className="hidden sm:inline">載入中...</span>
      </Button>
    );
  }

  if (error) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="gap-2 text-destructive border-destructive/40 hover:bg-destructive/10"
        onClick={() => refresh()}
      >
        <AlertCircle className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">載入失敗</span>
        <RotateCw className="h-3 w-3" />
        <span className="hidden md:inline">重新嘗試</span>
      </Button>
    );
  }

  if (companies.length === 0) {
    return (
      <Button variant="outline" size="sm" disabled className="gap-2 text-muted-foreground">
        <Building2 className="h-3.5 w-3.5" />
        <span className="hidden sm:inline">尚未加入公司</span>
      </Button>
    );
  }

  async function handleSelect(id: string, name: string) {
    try {
      await setCurrent(id);
      toast.success(`已切換至「${name}」`);
    } catch (e: any) {
      toast.error("切換失敗", { description: e.message });
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 max-w-[220px]">
          <Building2 className="h-3.5 w-3.5 shrink-0 text-primary" />
          <span className="truncate text-xs font-medium">
            {current?.company_name ?? "選擇公司"}
          </span>
          <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[240px]">
        <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground">
          切換公司
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {companies.map((c) => (
          <DropdownMenuItem
            key={c.id}
            onClick={() => handleSelect(c.id, c.company_name)}
            className="flex items-start gap-2"
          >
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-muted overflow-hidden">
              {c.logo_url ? (
                <img src={c.logo_url} alt="" className="h-full w-full object-contain" />
              ) : (
                <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{c.company_name}</div>
              <div className="text-[10px] text-muted-foreground">
                {c.role === "admin" ? "管理員" : "成員"}
                {c.status !== "active" && ` · ${c.status}`}
              </div>
            </div>
            {current?.id === c.id && <Check className="h-3.5 w-3.5 text-primary shrink-0 mt-1" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
