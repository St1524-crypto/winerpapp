import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { useBranding } from "@/hooks/use-branding";
import { CompanyLogo } from "@/components/company-logo";
import { recordLoginAttempt, recordSession, getTwoFactorStatus } from "@/lib/security.functions";
import { resolveLoginEmail, getUserCompany } from "@/lib/auth-lookup.functions";
import { handleReferralSignup } from "@/lib/points.functions";

export const Route = createFileRoute("/login")({ component: () => <LoginPage /> });

type PublicCompany = { id: string; slug: string; company_name: string; logo_url: string | null };

export function LoginPage({ pathSlug, memberMode = false }: { pathSlug?: string; memberMode?: boolean } = {}) {
  const { user, loading, roles } = useAuth();
  const { logoUrl } = useBranding();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [signupType, setSignupType] = useState<"email" | "phone">(memberMode ? "phone" : "email");
  const [identifier, setIdentifier] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [refCode, setRefCode] = useState("");
  const [busy, setBusy] = useState(false);

  const [companies, setCompanies] = useState<PublicCompany[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string>("");

  const selectedCompany = useMemo(
    () => companies.find((c) => c.slug === selectedSlug) ?? null,
    [companies, selectedSlug],
  );

  // 載入公司清單 + 解析 URL ?company=slug 或路徑 /login/:slug
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.rpc("get_public_companies");
      if (cancelled) return;
      const list = (data ?? []) as PublicCompany[];
      setCompanies(list);

      const params = new URLSearchParams(window.location.search);
      const slugFromQuery = params.get("company");
      const ref = params.get("ref");
      const m = params.get("mode");
      if (ref) { setRefCode(ref.toUpperCase()); setMode("signup"); }
      if (m === "signup" || m === "signin" || m === "forgot") setMode(m);

      const targetSlug = pathSlug || slugFromQuery || "";
      if (targetSlug) {
        const exact = list.find((c) => c.slug === targetSlug);
        const fuzzy =
          exact ||
          list.find(
            (c) =>
              c.slug.includes(targetSlug) ||
              targetSlug.includes(c.slug) ||
              c.company_name.includes(targetSlug) ||
              targetSlug.includes(c.company_name),
          );
        if (fuzzy) setSelectedSlug(fuzzy.slug);
        else if (list.length === 1) setSelectedSlug(list[0].slug);
      } else if (list.length === 1) {
        setSelectedSlug(list[0].slug);
      }
    })();
    return () => { cancelled = true; };
  }, [pathSlug]);

  // 將選擇的公司同步到網址，方便分享
  useEffect(() => {
    if (typeof window === "undefined") return;
    // 若是透過路徑進入 (/login/:slug)，由路由本身決定網址，不再覆寫
    if (pathSlug) return;
    const url = new URL(window.location.href);
    if (selectedSlug) url.searchParams.set("company", selectedSlug);
    else url.searchParams.delete("company");
    window.history.replaceState({}, "", url.toString());
  }, [selectedSlug, pathSlug]);

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
    if (mode === "signup" && !selectedCompany) {
      toast.error("註冊請使用公司專屬入口 /login/{公司名}");
      return;
    }
    setBusy(true);
    try {
      if (mode === "signin") {
        let loginEmail = identifier.trim();
        if (!loginEmail.includes("@")) {
          const res = await resolveLoginEmail({
            data: { identifier: loginEmail, companyId: selectedCompany?.id },
          }).catch(() => ({ email: null }));
          if (!res.email) throw new Error(
            selectedCompany
              ? `此公司入口 (${selectedCompany.company_name}) 找不到對應帳號`
              : "找不到對應帳號",
          );
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

        // 若由公司入口進入，驗證使用者是否屬於該公司（super_admin 例外）
        if (uid && selectedCompany) {
          const userMeta = data.user?.app_metadata ?? {};
          const isSuper = Array.isArray((userMeta as any).roles)
            ? (userMeta as any).roles.includes("super_admin")
            : false;
          if (!isSuper) {
            const { companyId } = await getUserCompany({ data: { userId: uid } }).catch(() => ({ companyId: null }));
            if (companyId && companyId !== selectedCompany.id) {
              await supabase.auth.signOut();
              throw new Error(`此帳號不屬於 ${selectedCompany.company_name}，請使用正確的公司入口`);
            }
          }
        }

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

        toast.success(selectedCompany ? `已登入 ${selectedCompany.company_name}` : "登入成功");
      } else if (mode === "signup" && selectedCompany) {
        let signupEmail = email.trim();
        const cleanPhone = phone.trim().replace(/[\s-]/g, "");
        if (signupType === "phone") {
          if (!/^\+?\d{8,15}$/.test(cleanPhone)) throw new Error("請輸入有效的電話號碼");
          signupEmail = `${cleanPhone.replace(/^\+/, "")}@phone.local`;
        }
        const { data: signUpData, error } = await supabase.auth.signUp({
          email: signupEmail,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard?company=${selectedCompany.slug}`,
            data: {
              name,
              phone: signupType === "phone" ? cleanPhone : undefined,
              company_slug: selectedCompany.slug,
            },
          },
        });
        if (error) throw error;
        if (refCode && signUpData.session) {
          await handleReferralSignup({ data: { referralCode: refCode } }).catch(() => {});
        }
        toast.success(`已於 ${selectedCompany.company_name} 完成註冊` + (signupType === "phone" ? "，可使用電話號碼登入" : "，請查收驗證信"));
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


  // ===== 無公司入口 → 顯示通用登入表單 =====
  if (!selectedCompany) {
    return (
      <div className="relative min-h-screen flex items-center justify-center px-4 overflow-hidden">
        <div className="absolute inset-0 bg-[var(--gradient-glow)] pointer-events-none" />
        <div className="relative w-full max-w-md">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center mb-4">
              <CompanyLogo src={logoUrl} alt="WinERP" size="xl" className="shadow-glow ring-1 ring-primary/30 bg-white" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">登入 WinERP</h1>
          </div>
          <div className="rounded-2xl border bg-card/80 backdrop-blur-xl shadow-elegant p-8">
            <form onSubmit={submit} className="space-y-4">
              {mode === "signin" && (
                <div className="space-y-2">
                  <Label htmlFor="identifier">Email / 電話 / 會員編號</Label>
                  <Input id="identifier" value={identifier} onChange={(e) => setIdentifier(e.target.value)} required />
                </div>
              )}
              {mode === "forgot" && (
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
              )}
              {mode === "signin" && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">密碼</Label>
                    <button type="button" onClick={() => setMode("forgot")} className="text-xs text-primary hover:underline">忘記密碼？</button>
                  </div>
                  <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
                </div>
              )}
              <Button type="submit" disabled={busy} className="w-full bg-gradient-primary hover:opacity-90 text-primary-foreground shadow-glow">
                {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                {mode === "signin" ? "登入" : "寄送重設信"}
              </Button>
              {mode === "forgot" && (
                <Button type="button" variant="ghost" className="w-full" onClick={() => setMode("signin")}>返回登入</Button>
              )}
            </form>
          </div>
          <div className="text-center mt-4">
            <Link to="/shop" className="text-sm text-primary hover:underline">回首頁</Link>
          </div>
        </div>
      </div>
    );
  }


  // ===== 已選擇公司 → 顯示登入/註冊表單 =====
  return (
    <div className="relative min-h-screen flex items-center justify-center px-4 overflow-hidden">
      <div className="absolute inset-0 bg-[var(--gradient-glow)] pointer-events-none" />
      <div className="absolute inset-0 opacity-[0.04] pointer-events-none"
        style={{ backgroundImage: "linear-gradient(var(--color-border) 1px, transparent 1px), linear-gradient(90deg, var(--color-border) 1px, transparent 1px)", backgroundSize: "40px 40px" }} />

      <div className="relative w-full max-w-md">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center mb-4">
            <CompanyLogo
              src={selectedCompany.logo_url || logoUrl}
              alt={selectedCompany.company_name}
              fallbackInitial={selectedCompany.company_name.charAt(0)}
              size="xl"
              className="shadow-glow ring-1 ring-primary/30 bg-white"
            />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">{selectedCompany.company_name}{memberMode ? " · 會員入口" : ""}</h1>
          <p className="text-xs text-muted-foreground mt-1 font-mono">{memberMode ? `/m/${selectedCompany.slug}` : `/login/${selectedCompany.slug}`}</p>
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
                <div className="rounded-md bg-primary/5 border border-primary/20 px-3 py-2 text-xs text-foreground">
                  您將在 <span className="font-semibold">{selectedCompany.company_name}</span> 公司入口註冊新帳號
                </div>
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
                <div className="space-y-2">
                  <Label htmlFor="refCode">推薦碼（選填）</Label>
                  <Input id="refCode" value={refCode} onChange={(e) => setRefCode(e.target.value.toUpperCase())} placeholder="例：A1B2C3D4" className="font-mono" />
                </div>
              </>
            )}

            {mode === "signin" && (
              <div className="space-y-2">
                <Label htmlFor="identifier">{memberMode ? "行動電話 / 會員編號" : "Email / 電話 / 會員編號"}</Label>
                <Input id="identifier" value={identifier} onChange={(e) => setIdentifier(e.target.value)} required placeholder={memberMode ? "例：0912345678" : "僅限本公司帳號"} inputMode={memberMode ? "tel" : undefined} />
                {memberMode && (
                  <p className="text-[11px] text-muted-foreground">會員可使用註冊時的行動電話或系統會員編號 (M 開頭) 登入。</p>
                )}
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
                <p className="text-[11px] text-muted-foreground">註冊後系統將自動產生會員編號，可使用電話號碼直接登入。</p>
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
              {mode === "signin" ? `登入 ${selectedCompany.company_name}` : mode === "signup" ? "建立帳號" : "寄送重設信"}
            </Button>
            {mode === "forgot" && (
              <Button type="button" variant="ghost" className="w-full" onClick={() => setMode("signin")}>返回登入</Button>
            )}
          </form>
        </div>

        <div className="text-center mt-4">
          <Link to="/shop" className="text-sm text-primary hover:underline">回首頁</Link>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-4">
          © {new Date().getFullYear()} {selectedCompany.company_name} · 企業級 ERP 平台
        </p>
      </div>
    </div>
  );
}
