import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { AdminMobileNav } from "@/components/AdminMobileNav";
import { AdminSidebar } from "@/components/AdminSidebar";
import { AppHeader } from "@/components/AppHeader";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentCompany } from "@/hooks/use-current-company";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentSessionStatus } from "@/lib/security.functions";
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

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [user, loading, navigate]);

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

  if (loading || !user || !mfaChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const inAdmin = pathname.startsWith("/admin") && roles.includes("super_admin");

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        {inAdmin ? <AdminSidebar /> : <AppSidebar />}
        <div className="flex-1 flex flex-col min-w-0">
          <AppHeader />
          <main className="flex-1 p-4 md:p-6 lg:p-8 pb-20 md:pb-8 animate-in fade-in duration-300">
            <Outlet />
          </main>
          <AdminMobileNav />
        </div>
      </div>
    </SidebarProvider>
  );
}
