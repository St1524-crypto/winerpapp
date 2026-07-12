import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { AdminMobileNav } from "@/components/AdminMobileNav";
import { AdminSidebar } from "@/components/AdminSidebar";
import { AdminAIAssistantWidget } from "@/components/AdminAIAssistantWidget";
import { AppHeader } from "@/components/AppHeader";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentCompany } from "@/hooks/use-current-company";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentSessionStatus } from "@/lib/security.functions";
import { writeClientAuditLog } from "@/lib/audit.functions";
import { getPortalRouteForRoles, isAdminPortalRole } from "@/lib/roles";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated")({ component: AuthLayout });

function AuthLayout() {
  const { user, loading, roles, signOut } = useAuth();
  const {
    companies,
    current,
    currentCompanyId,
    loading: companyLoading,
    setCurrent,
  } = useCurrentCompany();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [mfaChecked, setMfaChecked] = useState(false);
  const [companyChecked, setCompanyChecked] = useState(false);

  const isAdminPortal = isAdminPortalRole(roles);
  const inAdminPath = pathname.startsWith("/admin");

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate({ to: inAdminPath ? "/admin/login" : "/login" });
      return;
    }
    // 角色已載入後再判斷 (避免角色清單尚未抓回)
    if (roles.length === 0) return;
    if (inAdminPath && !isAdminPortal) {
      toast.error("您沒有權限進入後台");
      navigate({ to: getPortalRouteForRoles(roles) });
      return;
    }
    if (!inAdminPath && isAdminPortal && (pathname.startsWith("/shop/account") || pathname === "/shop/account")) {
      toast.error("管理員帳號不可進入會員中心，請使用一般會員帳號");
      navigate({ to: "/admin" });
      return;
    }
  }, [user, loading, navigate, inAdminPath, isAdminPortal, roles, pathname]);

  // Enforce 2FA verification before showing any protected content
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) return;
        const status = await getCurrentSessionStatus({ data: { sessionToken: token } });
        if (cancelled) return;
        if (status.requires2FA && !status.mfaVerified) {
          sessionStorage.setItem("mfa_pending", user.id);
          navigate({ to: "/two-factor" });
          return;
        }
        sessionStorage.removeItem("mfa_pending");
      } catch {
        // ignore; allow render if status check fails
      } finally {
        if (!cancelled) setMfaChecked(true);
      }
    })();
    return () => { cancelled = true; };
  }, [user, navigate]);

  // 公司啟用狀態守門：若使用者所有公司都被停用 → 強制登出。
  // 若目前公司被停用但仍有其他啟用中的公司 → 自動切換到第一個啟用中的。
  // super_admin 不受此限制。
  useEffect(() => {
    if (!user || loading || companyLoading) return;
    const isSuperAdmin = roles.includes("super_admin");
    if (isSuperAdmin) { setCompanyChecked(true); return; }
    // 沒有任何公司歸屬：保留現況（讓使用者進入有限頁面）
    if (companies.length === 0) { setCompanyChecked(true); return; }

    const activeCompanies = companies.filter((c) => c.status === "active");
    if (activeCompanies.length === 0) {
      toast.error("您所屬的公司已被停用，無法登入", {
        description: "請聯絡系統管理員啟用公司後再試。",
      });
      (async () => {
        // 寫入稽核紀錄：因公司停用而被拒絕進入後台
        try {
          await writeClientAuditLog({
            data: {
              action: "blocked_inactive_company",
              entity: "companies",
              entity_id: companies[0]?.id ?? null,
              metadata: {
                reason: "all_companies_inactive",
                email: user.email ?? null,
                path: pathname,
                company_ids: companies.map((c) => c.id),
                company_names: companies.map((c) => c.company_name),
                user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
                occurred_at: new Date().toISOString(),
              },
            },
          });
        } catch {
          // 紀錄失敗不阻擋登出
        }
        await signOut();
        navigate({ to: inAdminPath ? "/admin/login" : "/login" });
      })();
      return;
    }

    if (current && current.status !== "active") {
      const next = activeCompanies[0];
      toast.warning(`公司「${current.company_name}」已停用，已切換至「${next.company_name}」`);
      // 寫入稽核紀錄：目前公司停用，自動切換
      supabase
        .from("audit_logs")
        .insert({
          user_id: user.id,
          action: "auto_switched_inactive_company",
          entity: "companies",
          entity_id: current.id,
          metadata: {
            reason: "current_company_inactive",
            email: user.email ?? null,
            from_company_id: current.id,
            from_company_name: current.company_name,
            to_company_id: next.id,
            to_company_name: next.company_name,
            occurred_at: new Date().toISOString(),
          },
        })
        .then(() => {});
      setCurrent(next.id).catch(() => {});
      return;
    }

    if (!currentCompanyId && activeCompanies.length > 0) {
      setCurrent(activeCompanies[0].id).catch(() => {});
      return;
    }

    setCompanyChecked(true);
  }, [user, loading, companyLoading, companies, current, currentCompanyId, roles, signOut, setCurrent, navigate, pathname]);

  if (loading || !user || !mfaChecked || !companyChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const inAdmin = inAdminPath && isAdminPortal;

  return (
    <SidebarProvider>
      <div className="admin-light min-h-screen flex w-full bg-background text-foreground">
        {inAdmin ? <AdminSidebar /> : <AppSidebar />}
        <div className="flex-1 flex flex-col min-w-0">
          <AppHeader />
          <main className="flex-1 p-3 sm:p-4 md:p-6 lg:p-8 pb-20 md:pb-8 animate-in fade-in duration-300">
            <Outlet />
          </main>
          <AdminMobileNav />
        </div>
        {inAdmin && <AdminAIAssistantWidget />}
      </div>
    </SidebarProvider>
  );
}
