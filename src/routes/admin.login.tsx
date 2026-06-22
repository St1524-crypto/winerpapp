import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2, ShieldCheck } from "lucide-react";
import { recordLoginAttempt, recordSession, getTwoFactorStatus } from "@/lib/security.functions";
import { signInWithIdentifier } from "@/lib/auth-lookup.functions";
import { getPortalRouteForRoles, isAdminPortalRole } from "@/lib/roles";

export const Route = createFileRoute("/admin/login")({ component: AdminLoginPage });

type PublicCompany = { id: string; slug: string; company_name: string; logo_url: string | null };

function findCompanyByCode(code: string, companies: PublicCompany[]) {
  const normalized = code.trim().toLowerCase();
  if (!normalized || normalized === "st") return null;
  if (normalized === "st0985") {
    const sourceCompany = companies.find((company) => {
      const slug = company.slug.toLowerCase();
      return company.company_name.includes("源晶") || slug.includes("source") || slug.includes("st0985");
    });
    if (sourceCompany) return sourceCompany;
  }
  return companies.find((company) => {
    const slug = company.slug.toLowerCase();
    const name = company.company_name.toLowerCase();
    return slug === normalized || slug.includes(normalized) || normalized.includes(slug) || name.includes(normalized);
  }) ?? null;
}

function AdminLoginPage() {
  const { user, loading, roles, rolesLoaded } = useAuth();
  const navigate = useNavigate();
  const [websiteId, setWebsiteId] = useState("ST0985");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [companies, setCompanies] = useState<PublicCompany[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.rpc("get_public_companies");
      if (!cancelled) setCompanies((data ?? []) as PublicCompany[]);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (loading || !user || !rolesLoaded || busy) return;
    if (sessionStorage.getItem("mfa_pending") === user.id) {
      navigate({ to: "/two-factor" });
      return;
    }
    if (!isAdminPortalRole(roles)) {
      navigate({ to: getPortalRouteForRoles(roles) });
      return;
    }
    navigate({ to: "/admin" });
  }, [user, loading, roles, rolesLoaded, busy, navigate]);


  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const targetCompany = findCompanyByCode(websiteId, companies);
      if (!targetCompany) {
        throw new Error("官網ID 填入錯誤，請輸入正確的官網ID，例如 ST0985。");
      }
      let loginEmail = identifier.trim();
      if (!loginEmail.includes("@")) {
        const res = await resolveLoginEmail({ data: { identifier: loginEmail } }).catch(() => ({ email: null }));
        if (!res.email) throw new Error("找不到對應帳號");
        loginEmail = res.email;
      }

      const { data, error } = await supabase.auth.signInWithPassword({ email: loginEmail, password });
      if (error) {
        await recordLoginAttempt({ data: { email: loginEmail, success: false, failureReason: error.message } }).catch(() => {});
        throw error;
      }
      const uid = data.user?.id;
      await recordLoginAttempt({ data: { email: loginEmail, success: true, userId: uid } }).catch(() => {});

      // 角色驗證 (server-side)
      const { data: rolesRows } = await supabase.from("user_roles").select("role").eq("user_id", uid!);
      const userRoles = (rolesRows ?? []).map((r: { role: string }) => r.role);
      if (!isAdminPortalRole(userRoles)) {
        navigate({ to: getPortalRouteForRoles(userRoles as any) });
        return;
      }

      // 切換到指定的公司租戶
      if (uid) {
        await supabase.from("profiles").update({ current_company_id: targetCompany.id }).eq("id", uid);
      }


      const session = data.session;
      if (session && uid) {
        await recordSession({
          data: {
            sessionToken: session.access_token,
            expiresAt: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : undefined,
          },
        }).catch(() => {});
        const tfa = await getTwoFactorStatus().catch(() => ({ enabled: false }));
        if (tfa.enabled) {
          sessionStorage.setItem("mfa_pending", uid);
          toast.success("請完成二階段驗證");
          navigate({ to: "/two-factor" });
          return;
        }
      }
      toast.success("管理員登入成功");
      navigate({ to: "/admin" });
    } catch (err: any) {
      toast.error(err.message ?? "登入失敗");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="admin-light min-h-screen flex items-center justify-center px-4 bg-background"
      style={{ color: "oklch(0.22 0.02 260)" }}
    >
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 mb-4">
            <ShieldCheck className="h-7 w-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">管理員登入</h1>
          <p className="text-sm text-muted-foreground mt-2">後台系統入口，僅供授權人員使用</p>
        </div>
        <form onSubmit={submit} className="rounded-xl border bg-card p-6 shadow-elegant space-y-4">
          <div className="space-y-2">
            <Label htmlFor="websiteId">官網ID</Label>
            <Input
              id="websiteId"
              value={websiteId}
              onChange={(e) => setWebsiteId(e.target.value)}
              placeholder="ST0985"
              required
              style={{ color: "oklch(0.22 0.02 260)" }}
            />
            <p className="text-[11px] text-muted-foreground">預設：ST0985 → 源晶管理介面；其它公司請改為自己的官網ID</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="identifier">帳號 (Email 或員工編號)</Label>
            <Input
              id="identifier"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              autoComplete="username"
              required
              style={{ color: "oklch(0.22 0.02 260)" }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">密碼</Label>
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
              style={{ color: "oklch(0.22 0.02 260)" }}
            />
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={showPassword}
                onChange={(event) => setShowPassword(event.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              顯示密碼
            </label>
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "登入後台"}
          </Button>
          <div className="text-center text-xs text-muted-foreground pt-2">
            不是管理員？<Link to="/login" className="text-primary hover:underline">前往會員登入</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
