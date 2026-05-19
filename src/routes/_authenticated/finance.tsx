import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Wallet, ArrowDownUp, FileMinus, FilePlus, Landmark, LayoutDashboard } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/finance")({ component: FinanceLayout });

const TABS = [
  { to: "/finance", label: "總覽", icon: LayoutDashboard, exact: true },
  { to: "/finance/transactions", label: "收支總帳", icon: ArrowDownUp },
  { to: "/finance/receivable", label: "應收帳款", icon: FilePlus },
  { to: "/finance/payable", label: "應付帳款", icon: FileMinus },
  { to: "/finance/bank-accounts", label: "銀行帳戶", icon: Landmark },
];

function FinanceLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="max-w-[1600px] mx-auto space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-primary/20 ring-1 ring-primary/30">
            <Wallet className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">財務管理中心</h1>
            <p className="text-sm text-muted-foreground mt-1">收支總帳 · 應收應付 · 銀行帳戶 · 對帳追蹤</p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 p-1 rounded-xl bg-muted/40 border border-border/60 w-fit">
        {TABS.map((t) => {
          const active = t.exact ? pathname === t.to : pathname.startsWith(t.to);
          return (
            <Link
              key={t.to}
              to={t.to}
              className={cn(
                "flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all",
                active
                  ? "bg-card text-foreground shadow-elegant ring-1 ring-border"
                  : "text-muted-foreground hover:text-foreground hover:bg-card/60"
              )}
            >
              <t.icon className="h-4 w-4" /> {t.label}
            </Link>
          );
        })}
      </div>

      <Outlet />
    </div>
  );
}
