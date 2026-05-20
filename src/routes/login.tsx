import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useBranding } from "@/hooks/use-branding";
import { recordLoginAttempt, recordSession, getTwoFactorStatus } from "@/lib/security.functions";
import { resolveLoginEmail } from "@/lib/auth-lookup.functions";

export const Route = createFileRoute("/login")({ component: LoginPage });

function LoginPage() {
  const { user, loading, roles } = useAuth();
  const { logoUrl } = useBranding();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [signupType, setSignupType] = useState<"email" | "phone">("email");
  const [identifier, setIdentifier] = useState(""); // signin: email/phone/member_no
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);


  useEffect(() => {
    if (!loading && user) {
      if (sessionStorage.getItem("mfa_pending") === user.id) {
        navigate({ to: "/two-factor" });
      } else {
        navigate({ to: roles.includes("super_admin") ? "/admin" : "/dashboard" });
      }
    }
  }, [user, loading, roles, navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signin") {
        // Allow login with email / phone / member_no
        let loginEmail = identifier.trim();
        if (!loginEmail.includes("@")) {
          const res = await resolveLoginEmail({ data: { identifier: loginEmail } }).catch(() => ({ email: null }));
          if (!res.email) throw new Error("找不到對應帳號，請確認電話號碼 / 會員編號 / Email");
          loginEmail = res.email;
        }

        const { data, error } = await supabase.auth.signInWithPassword({ email: loginEmail, password });
        if (error) {
          await recordLoginAttempt({ data: { email: loginEmail, success: false, failureReason: error.message } }).catch(() => {});
          throw error;
        }
        const session = data.session;
        const uid = data.user?.id;

        await recordLoginAttempt({ data: { email: loginEmail, success: true, userId: uid } }).catch(() => {});

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

        toast.success("登入成功");
      } else if (mode === "signup") {
        // Phone-based signup creates a synthetic email <phone>@phone.local
        // so we can keep email+password as the auth primitive while letting
        // members log in by phone (resolved via profiles.phone -> email).
        let signupEmail = email.trim();
        const cleanPhone = phone.trim().replace(/[\s-]/g, "");
        if (signupType === "phone") {
          if (!/^\+?\d{8,15}$/.test(cleanPhone)) throw new Error("請輸入有效的電話號碼");
          signupEmail = `${cleanPhone.replace(/^\+/, "")}@phone.local`;
        }
        const { error } = await supabase.auth.signUp({
          email: signupEmail,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard`,
            data: {
              name,
              phone: signupType === "phone" ? cleanPhone : undefined,
            },
          },
        });
        if (error) throw error;
        toast.success(
          signupType === "phone"
            ? "註冊成功，您的會員編號已建立，可使用電話號碼登入"
            : "註冊成功，請查收驗證信",
        );
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        toast.success("密碼重設信已寄出");
        setMode("signin");
      }
    } catch (err: any) {
      toast.error(err.message ?? "操作失敗");
    } finally {
      setBusy(false);
    }
  }


  return (
    <div className="relative min-h-screen flex items-center justify-center px-4 overflow-hidden">
      <div className="absolute inset-0 bg-[var(--gradient-glow)] pointer-events-none" />
      <div className="absolute inset-0 opacity-[0.04] pointer-events-none"
        style={{ backgroundImage: "linear-gradient(var(--color-border) 1px, transparent 1px), linear-gradient(90deg, var(--color-border) 1px, transparent 1px)", backgroundSize: "40px 40px" }} />

      <div className="relative w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex h-20 w-20 items-center justify-center rounded-2xl bg-white shadow-glow mb-4 overflow-hidden ring-1 ring-primary/30">
            <img src={logoUrl} alt="源倍力 Logo" className="h-full w-full object-contain" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">源倍力 ERP</h1>
          <p className="text-sm text-muted-foreground mt-1">Enterprise Resource Platform</p>
        </div>

        <div className="rounded-2xl border bg-card/80 backdrop-blur-xl shadow-elegant p-8">
          <div className="flex gap-2 mb-6">
            <button onClick={() => setMode("signin")}
              className={`flex-1 py-2 text-sm rounded-lg transition-colors ${mode === "signin" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>登入</button>
            <button onClick={() => setMode("signup")}
              className={`flex-1 py-2 text-sm rounded-lg transition-colors ${mode === "signup" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>註冊</button>
          </div>

          <form onSubmit={submit} className="space-y-4">
            {mode === "signup" && (
              <>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setSignupType("email")}
                    className={`flex-1 py-1.5 text-xs rounded-md border ${signupType === "email" ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground"}`}>Email 註冊</button>
                  <button type="button" onClick={() => setSignupType("phone")}
                    className={`flex-1 py-1.5 text-xs rounded-md border ${signupType === "phone" ? "bg-primary text-primary-foreground border-primary" : "text-muted-foreground"}`}>電話註冊</button>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="name">姓名</Label>
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="王小明" />
                </div>
              </>
            )}

            {mode === "signin" && (
              <div className="space-y-2">
                <Label htmlFor="identifier">Email / 電話 / 會員編號</Label>
                <Input id="identifier" value={identifier} onChange={(e) => setIdentifier(e.target.value)} required placeholder="admin@yuanjing.com 或 0912345678 或 M000001" />
              </div>
            )}

            {mode === "signup" && signupType === "email" && (
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@example.com" />
              </div>
            )}

            {mode === "signup" && signupType === "phone" && (
              <div className="space-y-2">
                <Label htmlFor="phone">電話號碼</Label>
                <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required placeholder="0912345678" />
                <p className="text-[11px] text-muted-foreground">註冊後系統將自動產生會員編號 (M000001 起)，可使用電話號碼直接登入。</p>
              </div>
            )}

            {mode === "forgot" && (
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@example.com" />
              </div>
            )}

            {mode !== "forgot" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">密碼</Label>
                  {mode === "signin" && (
                    <button type="button" onClick={() => setMode("forgot")} className="text-xs text-primary hover:underline">忘記密碼？</button>
                  )}
                </div>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} placeholder="••••••••" />
              </div>
            )}

            <Button type="submit" disabled={busy} className="w-full bg-gradient-primary hover:opacity-90 text-primary-foreground shadow-glow">
              {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {mode === "signin" ? "登入系統" : mode === "signup" ? "建立帳號" : "寄送重設信"}
            </Button>
            {mode === "forgot" && (
              <Button type="button" variant="ghost" className="w-full" onClick={() => setMode("signin")}>返回登入</Button>
            )}
          </form>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          © {new Date().getFullYear()} 源晶科技 · 企業級 ERP 平台
        </p>
      </div>
    </div>
  );
}
