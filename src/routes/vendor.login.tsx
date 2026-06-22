import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Building2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { signInWithIdentifier } from "@/lib/auth-lookup.functions";
import { recordLoginAttempt, recordSession, getTwoFactorStatus } from "@/lib/security.functions";
import { getPortalRouteForRoles, isVendorPortalRole } from "@/lib/roles";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/vendor/login")({
  component: VendorLoginPage,
});

function VendorLoginPage() {
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
    navigate({ to: getPortalRouteForRoles(roles) });
  }, [user, loading, roles, rolesLoaded, busy, navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      let loginEmail = identifier.trim();
      if (!loginEmail.includes("@")) {
        const res = await resolveLoginEmail({ data: { identifier: loginEmail } }).catch(() => ({ email: null }));
        if (!res.email) throw new Error("Account not found");
        loginEmail = res.email;
      }

      const { data, error } = await supabase.auth.signInWithPassword({ email: loginEmail, password });
      if (error) {
        await recordLoginAttempt({ data: { email: loginEmail, success: false, failureReason: error.message } }).catch(() => {});
        throw error;
      }

      const uid = data.user?.id;
      await recordLoginAttempt({ data: { email: loginEmail, success: true, userId: uid } }).catch(() => {});

      const { data: roleRows } = await supabase.from("user_roles").select("role").eq("user_id", uid!);
      const userRoles = (roleRows ?? []).map((row: { role: string }) => row.role);
      if (!isVendorPortalRole(userRoles)) {
        navigate({ to: getPortalRouteForRoles(userRoles as any) });
        return;
      }

      if (data.session && uid) {
        await recordSession({
          data: {
            sessionToken: data.session.access_token,
            expiresAt: data.session.expires_at ? new Date(data.session.expires_at * 1000).toISOString() : undefined,
          },
        }).catch(() => {});
        const tfa = await getTwoFactorStatus().catch(() => ({ enabled: false }));
        if (tfa.enabled) {
          sessionStorage.setItem("mfa_pending", uid);
          navigate({ to: "/two-factor" });
          return;
        }
      }

      toast.success("Vendor login successful");
      navigate({ to: "/vendor" as any });
    } catch (err: any) {
      toast.error(err.message ?? "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Building2 className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Vendor Portal</h1>
          <p className="mt-2 text-sm text-muted-foreground">Sign in with a vendor account.</p>
        </div>
        <form onSubmit={submit} className="space-y-4 rounded-xl border bg-card p-6 shadow">
          <div className="space-y-2">
            <Label htmlFor="identifier">Email / phone / member no.</Label>
            <Input id="identifier" value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
          </Button>
          <div className="text-center text-xs text-muted-foreground">
            Not a vendor? <Link to="/login" className="text-primary hover:underline">Member login</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
