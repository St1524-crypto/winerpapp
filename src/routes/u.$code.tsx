import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Crown, Share2, Copy, Loader2, ShoppingBag, UserPlus } from "lucide-react";
import { getReferrerPublicProfile } from "@/lib/referral.functions";
import { setReferralCode } from "@/lib/referral-tracking";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

export const Route = createFileRoute("/u/$code")({
  component: VipLandingPage,
  head: ({ params }) => ({
    meta: [
      { title: `${params.code} 的 VIP 推薦頁 — WinERP` },
      { name: "description", content: `透過 ${params.code} 的專屬連結加入會員，享 VIP 優惠` },
      { property: "og:title", content: `${params.code} 邀請您加入 WinERP 會員` },
      { property: "og:description", content: `掃描或點擊專屬連結即可註冊` },
      { property: "og:type", content: "profile" },
    ],
  }),
});

function VipLandingPage() {
  const { code } = Route.useParams();
  const { user } = useAuth();
  const nav = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getReferrerPublicProfile({ data: { code } });
        if (cancelled) return;
        if (res.found && res.referrer.referralCode) {
          // 立刻寫入 cookie，後續無論瀏覽到哪一頁、何時註冊都能保留
          setReferralCode(res.referrer.referralCode);
        }
        setData(res);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [code]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!data?.found) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 text-center space-y-4">
        <p className="text-lg font-medium">找不到此推薦人</p>
        <p className="text-sm text-muted-foreground">連結代碼：{code}</p>
        <Button asChild><Link to="/shop">前往商城</Link></Button>
      </div>
    );
  }

  const r = data.referrer;
  const company = data.company;
  const products = data.products as any[];
  const shareUrl = typeof window !== "undefined" ? window.location.href : "";

  function share() {
    if (navigator.share) {
      navigator.share({ title: `${r.name} 的 VIP 推薦頁`, url: shareUrl }).catch(() => {});
    } else {
      navigator.clipboard.writeText(shareUrl);
      toast.success("連結已複製");
    }
  }
  function copyLink() {
    navigator.clipboard.writeText(shareUrl);
    toast.success("連結已複製");
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 via-background to-background">
      <div className="container mx-auto px-4 py-8 max-w-2xl space-y-6">
        {/* VIP 個人卡 */}
        <Card className="overflow-hidden border-primary/20">
          <div className="h-24 bg-gradient-to-r from-primary/30 via-primary/20 to-primary/10" />
          <CardContent className="-mt-12 space-y-3">
            <div className="flex items-end gap-4">
              <Avatar className="h-24 w-24 ring-4 ring-background">
                <AvatarImage src={r.avatarUrl ?? undefined} />
                <AvatarFallback className="text-2xl bg-primary text-primary-foreground">
                  {r.name?.[0] ?? "V"}
                </AvatarFallback>
              </Avatar>
              <div className="pb-2">
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold">{r.name}</h1>
                  {r.isVip && (
                    <Badge className="gap-1 bg-gradient-to-r from-amber-500 to-amber-600 text-white border-0">
                      <Crown className="h-3 w-3" />VIP
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">會員編號 {r.memberNo}</p>
              </div>
            </div>
            {company && (
              <p className="text-sm text-muted-foreground">所屬：{company.company_name}</p>
            )}
            <div className="flex gap-2 pt-2">
              <Button onClick={share} className="flex-1 gap-2">
                <Share2 className="h-4 w-4" />分享
              </Button>
              <Button onClick={copyLink} variant="outline" className="gap-2">
                <Copy className="h-4 w-4" />複製連結
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* CTA */}
        {!user && (
          <Card className="bg-primary text-primary-foreground">
            <CardContent className="p-5 space-y-3 text-center">
              <UserPlus className="h-8 w-8 mx-auto" />
              <p className="text-sm">透過 {r.name} 的推薦註冊，享專屬會員權益</p>
              <Button
                size="lg"
                variant="secondary"
                className="w-full"
                onClick={() => {
                  const slug = company?.slug;
                  if (slug) {
                    nav({ to: "/m/$slug", params: { slug }, search: { ref: r.referralCode, mode: "signup" } as never });
                  } else {
                    window.location.href = `/login?ref=${r.referralCode}&mode=signup`;
                  }
                }}
              >
                立即加入會員
              </Button>
            </CardContent>
          </Card>
        )}

        {/* 推薦商品 */}
        {products.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ShoppingBag className="h-4 w-4" />推薦商品
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3">
              {products.map((p) => (
                <Link
                  key={p.id}
                  to="/shop/product/$id"
                  params={{ id: p.id }}
                  search={{ ref: r.referralCode } as never}
                  className="group block space-y-2"
                >
                  <div className="aspect-square rounded-lg overflow-hidden bg-muted">
                    {p.image && <img src={p.image} alt={p.name} className="w-full h-full object-cover group-hover:scale-105 transition" />}
                  </div>
                  <div>
                    <p className="text-sm font-medium line-clamp-2">{p.name}</p>
                    <p className="text-sm text-primary font-bold">NT$ {Number(p.price).toLocaleString()}</p>
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>
        )}

        <p className="text-center text-xs text-muted-foreground py-4">
          推薦碼 <span className="font-mono">{r.referralCode}</span> · 註冊後永久綁定
        </p>
      </div>
    </div>
  );
}
