import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface Props {
  title: string;
  value: string;
  delta?: number;
  icon: LucideIcon;
  accent?: "primary" | "success" | "warning" | "chart-2";
}

export function StatCard({ title, value, delta, icon: Icon, accent = "primary" }: Props) {
  const accentMap = {
    primary: "from-primary/20 to-primary/0 text-primary",
    success: "from-success/20 to-success/0 text-success",
    warning: "from-warning/20 to-warning/0 text-warning",
    "chart-2": "from-chart-2/20 to-chart-2/0 text-chart-2",
  } as const;

  return (
    <Card className="relative overflow-hidden group hover:shadow-elegant transition-all duration-300 hover:-translate-y-0.5">
      <div className={cn("absolute inset-0 bg-gradient-to-br opacity-60 pointer-events-none", accentMap[accent])} />
      <CardHeader className="relative flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</CardTitle>
        <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg bg-background/40 backdrop-blur", accentMap[accent].split(" ")[2])}>
          <Icon className="h-4 w-4" />
        </div>
      </CardHeader>
      <CardContent className="relative">
        <div className="text-2xl font-bold tracking-tight">{value}</div>
        {delta !== undefined && (
          <div className="flex items-center gap-1 mt-1 text-xs">
            {delta >= 0 ? (
              <TrendingUp className="h-3 w-3 text-success" />
            ) : (
              <TrendingDown className="h-3 w-3 text-destructive" />
            )}
            <span className={delta >= 0 ? "text-success" : "text-destructive"}>
              {delta >= 0 ? "+" : ""}{delta}%
            </span>
            <span className="text-muted-foreground">較昨日</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
