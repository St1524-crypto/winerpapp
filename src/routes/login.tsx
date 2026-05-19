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

export const Route = createFileRoute("/login")({ component: LoginPage });

function LoginPage() {
  const { user, loading, roles } = useAuth();
  const { logoUrl } = useBranding();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      navigate({ to: roles.includes("super_admin") ? "/admin" : "/dashboard" });
    }
  }, [user, loading, roles, navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("登入成功");
      } else if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: `${window.location.origin}/dashboard`, data: { name } },
        });
        if (error) throw error;
        toast.success("註冊成功，請查收驗證信");
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
              <div className="space-y-2">
                <Label htmlFor="name">姓名</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="王小明" />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="admin@yuanjing.com" />
            </div>
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
