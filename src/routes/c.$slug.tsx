import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Building2, Loader2, LogIn, UserPlus, Store } from "lucide-react";

type PublicCompany = { id: string; slug: string; company_name: string; logo_url: string | null };

export const Route = createFileRoute("/c/$slug")({
  component: CompanyPortal,
  head: ({ params }) => ({
    meta: [
      { title: `${params.slug} · 公司入口 — WinERP` },
      { name: "description", content: `${params.slug} 公司專屬登入與註冊入口。` },
      { property: "og:title", content: `${params.slug} · 公司入口` },
      { property: "og:description", content: `${params.slug} 公司專屬登入與註冊入口。` },
      { property: "og:url", content: `https://winerp.app/c/${params.slug}` },
    ],
    links: [{ rel: "canonical", href: `https://winerp.app/c/${params.slug}` }],
  }),
});

function CompanyPortal() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();
  const [company, setCompany] = useState<PublicCompany | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.rpc("get_company_by_slug", { _slug: slug });
      const row = (data as PublicCompany[] | null)?.[0] ?? null;
      if (error || !row) setNotFound(true);
      else setCompany(row);
      setLoading(false);
    })();
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (notFound || !company) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 text-center">
        <Building2 className="h-12 w-12 text-muted-foreground mb-4" />
        <h1 className="text-2xl font-bold">找不到此公司入口</h1>
        <p className="text-sm text-muted-foreground mt-2">網址 <code className="font-mono">/c/{slug}</code> 不存在或公司已停用。</p>
        <Link to="/login" className="mt-6 text-primary hover:underline text-sm">回到登入頁選擇公司</Link>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center px-4 overflow-hidden">
      <div className="absolute inset-0 bg-[var(--gradient-glow)] pointer-events-none" />
      <div
        className="absolute inset-0 opacity-[0.04] pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(var(--color-border) 1px, transparent 1px), linear-gradient(90deg, var(--color-border) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />
      <div className="relative w-full max-w-lg">
        <div className="text-center mb-8">
          <div className="inline-flex h-28 w-28 items-center justify-center rounded-3xl bg-white shadow-glow mb-5 overflow-hidden ring-1 ring-primary/30">
            {company.logo_url ? (
              <img src={company.logo_url} alt={company.company_name} className="h-full w-full object-contain" />
            ) : (
              <Building2 className="h-12 w-12 text-muted-foreground" />
            )}
          </div>
          <h1 className="text-3xl font-bold tracking-tight">{company.company_name}</h1>
          <p className="text-sm text-muted-foreground mt-2">
            專屬公司入口 · <span className="font-mono">/c/{company.slug}</span>
          </p>
        </div>

        <div className="rounded-2xl border bg-card/80 backdrop-blur-xl shadow-elegant p-6 space-y-3">
          <Button
            className="w-full bg-gradient-primary hover:opacity-90 text-primary-foreground shadow-glow h-12"
            onClick={() => navigate({ to: "/login", search: { company: company.slug } as any })}
          >
            <LogIn className="h-4 w-4 mr-2" />
            登入 {company.company_name}
          </Button>
          <Button
            variant="outline"
            className="w-full h-12"
            onClick={() => {
              const url = new URL(window.location.origin + "/login");
              url.searchParams.set("company", company.slug);
              url.searchParams.set("mode", "signup");
              window.location.href = url.toString();
            }}
          >
            <UserPlus className="h-4 w-4 mr-2" />
            註冊新帳號
          </Button>
          <Button variant="ghost" className="w-full h-12" onClick={() => navigate({ to: "/shop" })}>
            <Store className="h-4 w-4 mr-2" />
            前往商店
          </Button>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-6">
          © {new Date().getFullYear()} {company.company_name} · 由 WinERP 提供技術支援
        </p>
        <div className="text-center mt-2">
          <Link to="/login" className="text-xs text-muted-foreground hover:text-primary">切換其他公司入口</Link>
        </div>
      </div>
    </div>
  );
}
