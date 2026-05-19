import { SidebarTrigger } from "@/components/ui/sidebar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Search, Bell, LogOut, User, Shield, LayoutDashboard } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { ROLE_LABELS } from "@/lib/nav";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { toast } from "sonner";
import { CompanySwitcher } from "@/components/CompanySwitcher";

export function AppHeader() {
  const { user, roles, signOut } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const initial = user?.email?.[0]?.toUpperCase() ?? "U";
  const isSuperAdmin = roles.includes("super_admin");
  const inAdmin = pathname.startsWith("/admin");

  async function handleSignOut() {
    await signOut();
    toast.success("已登出");
    navigate({ to: "/login" });
  }

  function toggleAdmin() {
    if (inAdmin) {
      navigate({ to: "/dashboard" });
      toast.success("已切換至營運模式");
    } else {
      navigate({ to: "/admin" });
      toast.success("已切換至管理員模式");
    }
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-background/80 backdrop-blur-xl px-4 md:px-6">
      <SidebarTrigger />
      <div className="hidden md:flex relative flex-1 max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="搜尋商品、訂單、客戶..." className="pl-9 bg-muted/40 border-muted" />
      </div>
      <div className="flex-1 md:hidden" />
      <CompanySwitcher />
      {isSuperAdmin && (
        <Button
          variant={inAdmin ? "default" : "outline"}
          size="sm"
          onClick={toggleAdmin}
          className={inAdmin ? "bg-gradient-primary gap-2" : "gap-2"}
        >
          {inAdmin ? <LayoutDashboard className="h-4 w-4" /> : <Shield className="h-4 w-4" />}
          <span className="hidden sm:inline">{inAdmin ? "營運模式" : "管理員模式"}</span>
        </Button>
      )}
      <Button variant="ghost" size="icon" className="relative">
        <Bell className="h-4 w-4" />
        <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-primary shadow-glow" />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-accent transition-colors">
            <Avatar className="h-8 w-8 ring-2 ring-primary/30">
              <AvatarFallback className="bg-gradient-primary text-primary-foreground text-xs font-semibold">{initial}</AvatarFallback>
            </Avatar>
            <div className="hidden md:block text-left">
              <div className="text-xs font-medium leading-tight">{user?.email?.split("@")[0]}</div>
              <div className="text-[10px] text-muted-foreground">{
                isSuperAdmin
                  ? (inAdmin ? ROLE_LABELS["super_admin"] : (ROLE_LABELS[roles.find((r) => r !== "super_admin" && r !== "member") ?? roles[0] ?? "member"]))
                  : (roles[0] ? ROLE_LABELS[roles[0]] : "—")
              }</div>
            </div>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>
            <div className="font-normal text-xs text-muted-foreground">登入身分</div>
            <div className="truncate text-sm">{user?.email}</div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem><User className="h-4 w-4 mr-2" />個人資料</DropdownMenuItem>
          {isSuperAdmin && (
            <DropdownMenuItem onClick={toggleAdmin}>
              {inAdmin ? <LayoutDashboard className="h-4 w-4 mr-2" /> : <Shield className="h-4 w-4 mr-2" />}
              切換至{inAdmin ? "營運模式" : "管理員模式"}
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleSignOut} className="text-destructive focus:text-destructive">
            <LogOut className="h-4 w-4 mr-2" />登出
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
