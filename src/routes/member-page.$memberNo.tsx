import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Crown, Facebook, Instagram, Loader2, MessageCircle, Play, ShoppingBag, Sparkles, UserPlus, Youtube } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ProductCard } from "@/components/shop/ProductCard";
import { getMemberStorefront } from "@/lib/member-storefront.functions";
import type { Product } from "@/types/product";

export const Route = createFileRoute("/member-page/$memberNo")({
  component: MemberStorefrontPage,
  head: ({ params }) => ({
    meta: [
      { title: `${params.memberNo} 的個人品牌頁 — 源晶ERP` },
      { name: "description", content: "會員個人品牌首頁、精選商品、影片展示與 VIP 招募。" },
    ],
  }),
});

function MemberStorefrontPage() {
  const { memberNo } = Route.useParams();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const result = await getMemberStorefront({ data: { memberNo } });
        if (!cancelled) setData(result);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [memberNo]);

  const profile = data?.found ? data.profile : null;
  const ref = profile?.id ?? "";
  const displayName = profile?.brand_name || profile?.display_name || profile?.name || profile?.member_no || "源晶會員";
  const avatar = profile?.profile_avatar || profile?.avatar_url || "";
  const template = profile?.page_template || "A";
  const templateClass = useMemo(() => {
    if (template === "B") return "from-emerald-950 via-slate-900 to-zinc-950";
    if (template === "C") return "from-amber-950 via-red-950 to-stone-950";
    if (template === "D") return "from-indigo-950 via-slate-950 to-fuchsia-950";
    return "from-blue-600 via-blue-700 to-blue-900";
  }, [template]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!data?.found || !profile) {
    return (
      <div className="container mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-4 text-center">
        <h1 className="text-2xl font-bold">找不到這個個人品牌頁</h1>
        <p className="mt-2 text-sm text-muted-foreground">請確認會員編號或品牌網址是否正確。</p>
        <Button asChild className="mt-6">
          <Link to="/shop">回到商城</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <section className={`relative overflow-hidden bg-gradient-to-br ${templateClass} text-white`}>
        {profile.profile_cover ? (
          <img src={profile.profile_cover} alt={`${displayName} 封面`} className="absolute inset-0 h-full w-full object-cover opacity-40" />
        ) : null}
        <div className="absolute inset-0 bg-black/35" />
        <div className="relative container mx-auto grid gap-6 px-4 py-8 md:min-h-[520px] md:gap-8 md:py-14 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div className="max-w-3xl space-y-4 md:space-y-6">
            <Badge className="border-white/20 bg-white/15 text-white hover:bg-white/20">Personal Storefront</Badge>
            <div className="flex items-center gap-3 md:gap-4">
              <Avatar className="h-16 w-16 shrink-0 border-2 border-white/60 md:h-20 md:w-20">
                {avatar && <AvatarImage src={avatar} />}
                <AvatarFallback>{displayName.charAt(0)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <p className="text-xs text-white/70 md:text-sm">{profile.member_no}</p>
                <h1 className="truncate text-2xl font-bold tracking-tight md:text-5xl">{displayName}</h1>
              </div>
            </div>
            <p className="max-w-2xl text-sm leading-6 text-white/80 md:text-lg md:leading-7">
              {profile.brand_intro || "歡迎來到我的源晶個人品牌頁，這裡整理了我的精選商品、影片與 VIP 拼購主招募資訊。"}
            </p>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:gap-3">
              <Button asChild size="lg" className="rounded-full">
                <a href={`/login?mode=signup&ref=${encodeURIComponent(ref)}`}>
                  免費註冊 <UserPlus className="ml-2 h-4 w-4" />
                </a>
              </Button>
              <Button asChild size="lg" variant="outline" className="rounded-full border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white">
                <a href={`/shop/vip?ref=${encodeURIComponent(ref)}`}>
                  VIP升級 <Crown className="ml-2 h-4 w-4" />
                </a>
              </Button>
            </div>
            <SocialLinks profile={profile} />
          </div>

          <Card className="border-white/15 bg-white/10 text-white backdrop-blur">
            <CardHeader className="pb-3 md:pb-6">
              <CardTitle className="text-lg md:text-xl">立即加入好處多多樂拼購</CardTitle>
              <CardDescription className="text-sm text-white/70">免費註冊會員，升級 VIP 拼購主，打造自己的個人品牌與團隊收益。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 md:space-y-3">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-1">
                {["分享拼購", "推廣獎勵", "團購收益", "分店招募", "個人品牌頁"].map((item) => (
                  <div key={item} className="flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2">
                    <Sparkles className="h-4 w-4 shrink-0 text-primary" />
                    <span className="truncate text-sm">{item}</span>
                  </div>
                ))}
              </div>
              <Button asChild className="mt-3 w-full">
                <a href={`/shop/vip?ref=${encodeURIComponent(ref)}`}>
                  立即升級VIP <ArrowRight className="ml-2 h-4 w-4" />
                </a>
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>

      <main className="container mx-auto space-y-8 px-4 py-8 md:space-y-12 md:py-10">
        <section>
          <SectionTitle icon={ShoppingBag} title="精選商品" desc="會員親自推薦的源晶商城商品" />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            {(data.featuredProducts ?? []).length ? (
              data.featuredProducts.map((product: Product) => <ProductCard key={product.id} product={product} />)
            ) : (
              <EmptyState text="尚未設定精選商品" />
            )}
          </div>
        </section>

        <section>
          <SectionTitle icon={Sparkles} title="自訂商品展示" desc="會員自售或外部連結商品" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(data.customProducts ?? []).length ? (
              data.customProducts.map((item: any) => <CustomProductCard key={item.id} item={item} />)
            ) : (
              <EmptyState text="尚未新增自訂商品" />
            )}
          </div>
        </section>

        <section>
          <SectionTitle icon={Play} title="影片展示" desc="YouTube、TikTok、Facebook Reel、Shorts 都可分享" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(data.videos ?? []).length ? (
              data.videos.map((video: any) => (
                <Card key={video.id}>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">{video.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <VideoEmbed url={video.video_url} title={video.title} />
                    <a href={video.video_url} target="_blank" rel="noreferrer" className="inline-flex items-center text-sm text-primary hover:underline">
                      開啟影片 <ArrowRight className="ml-1 h-4 w-4" />
                    </a>
                  </CardContent>
                </Card>
              ))
            ) : (
              <EmptyState text="尚未新增影片" />
            )}
          </div>
        </section>
      </main>
    </div>
  );
}


function VideoEmbed({ url, title }: { url?: string | null; title?: string }) {
  const embedUrl = getVideoEmbedUrl(url);

  if (!embedUrl) {
    return (
      <div className="mb-3 flex aspect-video items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Play className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="mb-3 overflow-hidden rounded-md bg-muted">
      <iframe
        src={embedUrl}
        title={title || "影片展示"}
        className="aspect-video w-full"
        loading="lazy"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
      />
    </div>
  );
}

function getVideoEmbedUrl(value?: string | null) {
  if (!value) return "";

  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, "");

    if (host === "youtu.be") {
      const videoId = url.pathname.split("/").filter(Boolean)[0];
      return videoId ? `https://www.youtube.com/embed/${videoId}` : "";
    }

    if (host === "youtube.com" || host === "m.youtube.com") {
      if (url.pathname.startsWith("/shorts/")) {
        const videoId = url.pathname.split("/").filter(Boolean)[1];
        return videoId ? `https://www.youtube.com/embed/${videoId}` : "";
      }
      if (url.pathname.startsWith("/embed/")) return value;
      const videoId = url.searchParams.get("v");
      return videoId ? `https://www.youtube.com/embed/${videoId}` : "";
    }

    if (host === "facebook.com" || host === "m.facebook.com" || host === "fb.watch") {
      return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(value)}&show_text=false&width=560`;
    }

    if (host === "tiktok.com" || host.endsWith(".tiktok.com")) {
      const parts = url.pathname.split("/").filter(Boolean);
      const videoIndex = parts.indexOf("video");
      const videoId = videoIndex >= 0 ? parts[videoIndex + 1] : "";
      return videoId ? `https://www.tiktok.com/embed/v2/${videoId}` : "";
    }
  } catch {
    return "";
  }

  return "";
}

function SocialLinks({ profile }: { profile: any }) {
  const links = [
    { href: profile.line_url, label: "LINE", icon: MessageCircle },
    { href: profile.facebook_url, label: "Facebook", icon: Facebook },
    { href: profile.instagram_url, label: "Instagram", icon: Instagram },
    { href: profile.youtube_url, label: "Youtube", icon: Youtube },
  ].filter((item) => item.href);

  if (!links.length) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {links.map((item) => (
        <Button key={item.label} asChild variant="outline" size="sm" className="rounded-full border-white/25 bg-white/10 text-white hover:bg-white/20 hover:text-white">
          <a href={item.href} target="_blank" rel="noreferrer">
            <item.icon className="mr-2 h-4 w-4" />
            {item.label}
          </a>
        </Button>
      ))}
    </div>
  );
}

function SectionTitle({ icon: Icon, title, desc }: { icon: any; title: string; desc: string }) {
  return (
    <div className="mb-4">
      <h2 className="flex items-center gap-2 text-2xl font-bold">
        <Icon className="h-5 w-5 text-primary" />
        {title}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}

function CustomProductCard({ item }: { item: any }) {
  return (
    <Card className="overflow-hidden">
      <div className="aspect-video bg-muted">
        {item.image_url ? (
          <img src={item.image_url} alt={item.title} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">無圖片</div>
        )}
      </div>
      <CardHeader>
        <CardTitle className="text-base">{item.title}</CardTitle>
        {item.description && <CardDescription>{item.description}</CardDescription>}
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {item.purchase_url && (
          <Button asChild size="sm">
            <a href={item.purchase_url} target="_blank" rel="noreferrer">前往購買</a>
          </Button>
        )}
        {item.video_url && (
          <Button asChild size="sm" variant="outline">
            <a href={item.video_url} target="_blank" rel="noreferrer">觀看影片</a>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="col-span-full rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">{text}</p>;
}
