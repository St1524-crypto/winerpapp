import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { resolveReferrerByPhone } from "@/lib/auth-lookup.functions";
import { isMobileDevice } from "@/lib/device";

export const Route = createFileRoute("/r/$phone")({
  component: ReferralLandingPage,
  head: ({ params }) => ({
    meta: [
      { title: `推薦註冊 ${params.phone} — WinERP` },
      { name: "description", content: `透過推薦人 ${params.phone} 註冊會員專屬入口` },
    ],
  }),
});

function ReferralLandingPage() {
  const { phone } = Route.useParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await resolveReferrerByPhone({ data: { phone } });
        if (cancelled) return;
        if (!res.found) {
          setError(`找不到電話 ${phone} 對應的推薦人`);
          return;
        }
        const ref = res.referralCode || res.memberNo || "";
        const slug = res.companySlug;
        if (slug) {
          const target = isMobileDevice() ? "/m/$slug" : "/login/$slug";
          navigate({
            to: target,
            params: { slug },
            search: { ref, mode: "signup" } as never,
            replace: true,
          });
        } else {
          // Referrer has no company — fall back to generic login with ref
          window.location.replace(`/login?ref=${encodeURIComponent(ref)}&mode=signup`);
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "解析推薦連結失敗");
      }
    })();
    return () => { cancelled = true; };
  }, [phone, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center space-y-3">
        {error ? (
          <>
            <p className="text-sm text-destructive">{error}</p>
            <Link to="/login" className="text-sm text-primary hover:underline">前往一般登入</Link>
          </>
        ) : (
          <>
            <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
            <p className="text-sm text-muted-foreground">正在帶您前往推薦人專屬註冊頁…</p>
          </>
        )}
      </div>
    </div>
  );
}
