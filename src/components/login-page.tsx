import { useNavigate, Link } from "@tanstack/react-router";
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
import { bindSponsorByCode } from "@/lib/referral.functions";
import { getReferralCode, clearReferralCode } from "@/lib/referral-tracking";
import { getPortalRouteForRoles } from "@/lib/roles";

type PublicCompany = { id: string; slug: string; company_name: string; logo_url: string | null };

export function LoginPage({ pathSlug, memberMode = false }: { pathSlug?: string; memberMode?: boolean } = {}) {

  const { user, loading, roles, rolesLoaded } = useAuth();
  const { logoUrl } = useBranding();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [signupType, setSignupType] = useState<"email" | "phone">(memberMode ? "phone" : "email");
  const [websiteId, setWebsiteId] = useState("ST0985");
  const [identifier, setIdentifier] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
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
      const ref = params.get("ref") || getReferralCode(); // 優先網址，其次 cookie
      const m = params.get("mode");
      if (ref) { setRefCode(ref.toUpperCase()); }
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
    if (!loading && user && rolesLoaded) {
      if (sessionStorage.getItem("mfa_pending") === user.id) {
        navigate({ to: "/two-factor" });
        return;
      }
      navigate({ to: getPortalRouteForRoles(roles) });
    }
  }, [user, loading, roles, rolesLoaded, navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const activeCompany = selectedCompany ?? findCompanyByCode(websiteId, companies);

    if (mode === "signup" && !activeCompany) {
      toast.error("官網ID 填入錯誤，請確認公司官網ID後再註冊。");
      return;
    }
    setBusy(true);
    try {
      if (mode === "signin") {
        let loginEmail = identifier.trim();
        if (!loginEmail.includes("@")) {
          if (!activeCompany) {
            throw new Error("官網ID 填入錯誤，請輸入正確的官網ID，例如 ST0985。");
          }
          const res = await resolveLoginEmail({
            data: { identifier: loginEmail, companyId: activeCompany.id },
          }).catch(() => ({ email: null }));
          if (!res.email) {
            throw new Error(`會員ID 填入錯誤，${activeCompany.company_name} 查無此會員ID或行銷網址代稱。`);
          }
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
        if (uid && activeCompany) {
          const userMeta = data.user?.app_metadata ?? {};
          const isSuper = Array.isArray((userMeta as any).roles)
            ? (userMeta as any).roles.includes("super_admin")
            : false;
          if (!isSuper) {
            const { companyId } = await getUserCompany({ data: { userId: uid } }).catch(() => ({ companyId: null }));
            if (companyId && companyId !== activeCompany.id) {
              await supabase.auth.signOut();
              throw new Error(`此帳號不屬於 ${activeCompany.company_name}，請使用正確的公司入口`);
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

        toast.success(activeCompany ? `已登入 ${activeCompany.company_name}` : "登入成功");
      } else if (mode === "signup" && activeCompany) {
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
            emailRedirectTo: `${window.location.origin}/dashboard?company=${activeCompany.slug}`,
            data: {
              name,
              phone: signupType === "phone" ? cleanPhone : undefined,
              company_slug: activeCompany.slug,
            },
          },
        });
        if (error) throw error;
        if (refCode && signUpData.session) {
          await handleReferralSignup({ data: { referralCode: refCode } }).catch(() => {});
          await bindSponsorByCode({ data: { code: refCode } }).catch(() => {});
          clearReferralCode();
        }
        toast.success(`已於 ${activeCompany.company_name} 完成註冊` + (signupType === "phone" ? "，可使用電話號碼登入" : "，請查收驗證信"));
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        toast.success("密碼重設信已寄出");
        setMode("signin");
      }
    } catch (err: any) {
      toast.error(getLoginErrorMessage(err, mode));
    } finally {
      setBusy(false);
    }
  }


  // Generic login entry requires an explicit company code.
  if (!selectedCompany) {
    return (
      <CompanyCodeRequired
        logoUrl={logoUrl}
        websiteId={websiteId}
        setWebsiteId={setWebsiteId}
        identifier={identifier}
        setIdentifier={setIdentifier}
        password={password}
        setPassword={setPassword}
        showPassword={showPassword}
        setShowPassword={setShowPassword}
        busy={busy}
        onSubmit={submit}
        onSignup={() => {
          const code = websiteId.trim();
          if (!code || code.toUpperCase() === "ST") {
            toast.error("官網ID 填入錯誤，請輸入完整官網ID，例如 ST0985。");
            return;
          }
          window.location.href = `/m/${encodeURIComponent(code)}?mode=signup`;
        }}
      />
    );
  }

  if (!selectedCompany) {
    return (
      <div className="relative min-h-screen overflow-hidden">
        <div className="absolute inset-0 bg-[var(--gradient-glow)] pointer-events-none" />
        <div className="relative grid md:grid-cols-[340px_1fr] min-h-screen">
          {/* 左側：合作廠商 */}
          <aside className="border-r bg-card/70 backdrop-blur-xl p-5 md:p-6 flex flex-col">
            <div className="flex items-center gap-3 mb-5">
              <CompanyLogo src={logoUrl} alt="WinERP" size="md" className="bg-white ring-1 ring-primary/30" />
              <div>
                <div className="text-sm font-bold leading-tight">WinERP</div>
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider">合作廠商入口</div>
              </div>
            </div>
            <div className="text-xs font-semibold text-muted-foreground mb-3 px-1">合作廠商</div>
            <div className="flex-1 overflow-auto -mx-1 px-1 space-y-1.5">
              {companies.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-8">目前尚無合作廠商</p>
              ) : (
                companies.map((c) => (
                  <Link
                    key={c.id}
                    to="/c/$slug"
                    params={{ slug: c.slug }}
                    className="flex items-center gap-3 px-2.5 py-2 rounded-lg border border-transparent hover:border-border hover:bg-accent transition-colors group"
                  >
                    <div className="h-9 w-9 shrink-0 rounded bg-muted overflow-hidden flex items-center justify-center">
                      {c.logo_url ? (
                        <img src={c.logo_url} alt="" className="h-full w-full object-contain" />
                      ) : (
                        <span className="text-sm font-bold text-muted-foreground">{c.company_name.slice(0, 1)}</span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{c.company_name}</div>
                      <div className="text-[10px] font-mono text-muted-foreground truncate">/c/{c.slug}</div>
                    </div>
                    <span className="text-[10px] text-primary opacity-0 group-hover:opacity-100 shrink-0">前往 →</span>
                  </Link>
                ))
              )}
            </div>
            <Link to="/shop" className="mt-4 text-xs text-center text-muted-foreground hover:text-primary">回商城首頁</Link>
          </aside>

          {/* 右側：引導 */}
          <main className="flex items-center justify-center p-6">
            <div className="w-full max-w-md text-center">
              <div className="inline-flex items-center justify-center mb-6">
                <CompanyLogo src={logoUrl} alt="WinERP" size="xl" className="shadow-glow ring-1 ring-primary/30 bg-white" />
              </div>
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight mb-3">歡迎使用 WinERP</h1>
              <p className="text-sm text-muted-foreground mb-8 leading-relaxed">
                登入與註冊請從左側「合作廠商」選擇您的公司入口，
                <br className="hidden md:block" />
                前往公司專屬頁面後即可登入或免費註冊。
              </p>
              <div className="rounded-xl border bg-card/80 backdrop-blur-xl shadow-elegant p-5 text-left text-sm space-y-3">
                <div className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">1</span>
                  <span>於左側清單點選您所屬的合作廠商</span>
                </div>
                <div className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">2</span>
                  <span>進入該公司專屬首頁 <code className="font-mono text-xs">/c/&#123;slug&#125;</code></span>
                </div>
                <div className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">3</span>
                  <span>選擇「登入」或「免費註冊」完成帳號操作</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-6">
                若您是系統超級管理員，請直接以管理員帳號於任一公司入口登入。
              </p>
            </div>
          </main>
        </div>
      </div>
    );
  }


  // ===== 已選擇公司 → 顯示登入/註冊表單 =====
  return (
    <div className="login-light relative min-h-screen flex items-center justify-center px-4 overflow-hidden">
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
                  <Label htmlFor="name" className="text-primary">姓名</Label>
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="王小明" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="refCode" className="text-primary">推薦碼（選填）</Label>
                  <Input id="refCode" value={refCode} onChange={(e) => setRefCode(e.target.value.toUpperCase())} placeholder="例：A1B2C3D4" className="font-mono" />
                </div>
              </>
            )}

            {mode === "signin" && (
              <div className="space-y-2">
                <Label htmlFor="identifier" className="text-primary">{memberMode ? "行動電話 / 會員編號" : "Email / 電話 / 會員編號"}</Label>
                <Input id="identifier" value={identifier} onChange={(e) => setIdentifier(e.target.value)} required placeholder={memberMode ? "例：0912345678" : "僅限本公司帳號"} inputMode={memberMode ? "tel" : undefined} />
                {memberMode && (
                  <p className="text-[11px] text-foreground/70">會員可使用註冊時的行動電話或系統會員編號 (M 開頭) 登入。</p>
                )}
              </div>
            )}

            {mode === "signup" && signupType === "email" && (
              <div className="space-y-2">
                <Label htmlFor="email" className="text-primary">Email</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@example.com" />
              </div>
            )}

            {mode === "signup" && signupType === "phone" && (
              <div className="space-y-2">
                <Label htmlFor="phone" className="text-primary">電話號碼</Label>
                <Input id="phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required placeholder="0912345678" />
                <p className="text-[11px] text-foreground/70">註冊後系統將自動產生會員編號，可使用電話號碼直接登入。</p>
              </div>
            )}

            {mode === "forgot" && (
              <div className="space-y-2">
                <Label htmlFor="email" className="text-primary">Email</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@example.com" />
              </div>
            )}

            {mode !== "forgot" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password" className="text-primary">密碼</Label>
                  {mode === "signin" && (
                    <button type="button" onClick={() => setMode("forgot")} className="text-xs text-primary hover:underline">忘記密碼？</button>
                  )}
                </div>
                <Input id="password" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} placeholder="••••••••" />
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
            )}

            <Button type="submit" disabled={busy} className="w-full bg-primary hover:opacity-90 text-primary-foreground shadow-glow">
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

function getLoginErrorMessage(error: any, mode: "signin" | "signup" | "forgot") {
  const raw = String(error?.message ?? "");
  const code = String(error?.code ?? "");
  const detail = String(error?.detail ?? "");
  const all = `${raw} ${detail} ${code}`.toLowerCase();

  if (mode === "signin") {
    if (/[\u4e00-\u9fff]/.test(raw)) return raw;
    if (/invalid login credentials|email not confirmed|invalid credentials/i.test(raw)) {
      return "登入失敗：官網ID、會員ID或密碼填入錯誤，請重新確認。";
    }
    return "登入失敗：請確認官網ID、會員ID與密碼是否填寫正確。";
  }

  if (mode === "signup") {
    if (code === "23505" || all.includes("duplicate") || all.includes("already exists") || all.includes("already registered") || all.includes("user already")) {
      if (all.includes("phone")) return "免費註冊失敗：此電話號碼已註冊過，請改用登入或更換電話號碼。";
      if (all.includes("email")) return "免費註冊失敗：此 Email 已註冊過，請改用登入或更換 Email。";
      if (all.includes("marketing_slug") || all.includes("member_no")) return "免費註冊失敗：會員編號或行銷代稱已被使用。";
      return "免費註冊失敗：此帳號已存在，請改用登入。";
    }
    if (all.includes("password")) return "免費註冊失敗：密碼不符合規則（至少 6 碼）。";
    if (all.includes("rate limit")) return "免費註冊失敗：嘗試次數過多，請稍後再試。";
    if (/[\u4e00-\u9fff]/.test(raw)) return raw;
    return "免費註冊失敗：請確認必填欄位是否填寫正確。";
  }

  if (/[\u4e00-\u9fff]/.test(raw)) return raw;
  return "操作失敗：請確認 Email 欄位是否填寫正確。";
}

function CompanyCodeRequired({
  logoUrl,
  websiteId,
  setWebsiteId,
  identifier,
  setIdentifier,
  password,
  setPassword,
  showPassword,
  setShowPassword,
  busy,
  onSubmit,
  onSignup,
}: {
  logoUrl?: string | null;
  websiteId: string;
  setWebsiteId: (value: string) => void;
  identifier: string;
  setIdentifier: (value: string) => void;
  password: string;
  setPassword: (value: string) => void;
  showPassword: boolean;
  setShowPassword: (value: boolean) => void;
  busy: boolean;
  onSubmit: (event: React.FormEvent) => void;
  onSignup: () => void;
}) {
  return (
    <div className="login-light relative min-h-screen overflow-hidden">
      <div className="absolute inset-0 bg-[var(--gradient-glow)] pointer-events-none" />
      <main className="relative flex min-h-screen items-center justify-center px-4 py-10">
        <div className="w-full max-w-md rounded-2xl border bg-card/85 p-8 shadow-elegant backdrop-blur-xl">
          <div className="mb-5 inline-flex items-center justify-center">
            <CompanyLogo src={logoUrl} alt="WinERP" size="xl" className="bg-white shadow-glow ring-1 ring-primary/30" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight text-primary">會員登入</h1>
            <p className="mt-2 text-sm leading-6 text-foreground/80">
              請輸入公司官網ID與會員ID登入。官網ID 預設為 ST0985，其它公司可自行更改。
            </p>
          </div>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="websiteId">官網ID</Label>
              <Input
                id="websiteId"
                value={websiteId}
                onChange={(event) => setWebsiteId(event.target.value.toUpperCase())}
                required
                placeholder="ST0985"
                autoComplete="organization"
                className="font-mono"
              />
              <p className="text-[11px] text-muted-foreground">預設：ST0985；其它公司請改為自己的官網ID</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="identifier">會員ID</Label>
              <Input
                id="identifier"
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                required
                placeholder="會員編號或行銷網址代稱"
                autoComplete="username"
              />
              <p className="text-[11px] text-muted-foreground">可輸入會員編號，或個人品牌頁的行銷網址代稱。</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">密碼</Label>
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={6}
                placeholder="請輸入密碼"
                autoComplete="current-password"
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

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Button type="submit" disabled={busy} className="bg-primary hover:opacity-90 text-primary-foreground shadow-glow">
                {busy && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                登入
              </Button>
              <Button type="button" variant="outline" onClick={onSignup}>
                免費註冊
              </Button>
            </div>
          </form>

          <div className="mt-5 flex items-center justify-between text-xs">
            <Link to="/admin/login" className="text-primary hover:underline">管理員登入</Link>
            <Link to="/shop" className="text-muted-foreground hover:text-primary">返回商城</Link>
          </div>
        </div>
      </main>
    </div>
  );
}
