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
import { resolveLoginEmail } from "@/lib/auth-lookup.functions";

const STAFF_ROLES = ["super_admin", "admin", "finance", "warehouse", "sales", "vendor"];

export const Route = createFileRoute("/admin/login")({ component: AdminLoginPage });

function AdminLoginPage() {
  const { user, loading, roles, rolesLoaded } = useAuth();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading || !user || !rolesLoaded || busy) return;
    if (sessionStorage.getItem("mfa_pending") === user.id) {
      navigate({ to: "/two-factor" });
      return;
    }
    const isStaff = roles.some((r) => STAFF_ROLES.includes(r as string));
    if (!isStaff) {
      (async () => {
        await supabase.auth.signOut();
        toast.error("此頁面僅供管理員登入，請使用會員登入頁", { description: "/login" });
        navigate({ to: "/login" });
      })();
      return;
    }
    navigate({ to: "/admin" });
  }, [user, loading, roles, rolesLoaded, busy, navigate]);


  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
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
      const isStaff = userRoles.some((r) => STAFF_ROLES.includes(r));
      if (!isStaff) {
        await supabase.auth.signOut();
        throw new Error("此頁面僅供管理員登入，請使用會員登入頁 /login");
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
    <div className="admin-light min-h-screen flex items-center justify-center px-4 bg-background text-foreground">
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
            <Label htmlFor="identifier">帳號 (Email 或員工編號)</Label>
            <Input id="identifier" value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">密碼</Label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
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
