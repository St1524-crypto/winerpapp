import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { ArrowLeft, ExternalLink, Loader2 } from "lucide-react";
import { getPublicShopContentPage } from "@/lib/shop-content.functions";
import { Button } from "@/components/ui/button";
import { ShopContentQuestions } from "@/components/shop/ShopContentQuestions";



const SECTION_LABELS: Record<string, { label: string; href: string }> = {
  wholesale: { label: "批發專區", href: "/shop/wholesale" },
  patent: { label: "專利檢驗區", href: "/shop/patents" },
  news: { label: "最新消息", href: "/shop/news" },
  health: { label: "健康學術", href: "/shop/health" },
  academy: { label: "源晶 AI 商學院", href: "/shop/academy" },
};

export const Route = createFileRoute("/shop/content/$slug")({
  component: ContentDetailPage,
  head: () => ({
    meta: [
      { title: "內容 — 源晶商城" },
      { name: "description", content: "源晶商城內容專區文章。" },
    ],
  }),
  errorComponent: ({ error }) => (
    <div className="container mx-auto px-4 py-16 text-center text-sm text-muted-foreground">
      {error.message}
    </div>
  ),
  notFoundComponent: () => (
    <div className="container mx-auto px-4 py-16 text-center text-sm text-muted-foreground">
      找不到內容。
    </div>
  ),
});

function ContentDetailPage() {
  const { slug } = Route.useParams();
  const router = useRouter();
  const { data, isLoading, error } = useQuery({
    queryKey: ["shop-content-page", slug],
    queryFn: () => getPublicShopContentPage({ data: { slug } }),
  });

  const externalUrl = (data?.page as any)?.external_url as string | undefined;
  const hasBody = !!(data?.page as any)?.content_html || (Array.isArray((data?.page as any)?.images) && (data?.page as any).images.length > 0);
  useEffect(() => {
    if (externalUrl && !hasBody) {
      window.location.replace(externalUrl);
    }
  }, [externalUrl, hasBody]);


  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !data?.page) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <p className="text-sm text-muted-foreground mb-4">
          {(error as Error)?.message || "找不到內容"}
        </p>
        <Button variant="outline" onClick={() => router.history.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" /> 返回
        </Button>
      </div>
    );
  }

  const p = data.page as any;
  const section = SECTION_LABELS[p.section_type] ?? { label: "內容", href: "/shop" };
  const images: string[] = Array.isArray(p.images) ? p.images : [];

  return (
    <article className="container mx-auto px-4 py-10 md:py-14 max-w-3xl">
      <div className="mb-6 text-sm text-muted-foreground flex items-center gap-2">
        <Link to={section.href as any} className="hover:text-primary">
          ← {section.label}
        </Link>
      </div>

      <header className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold mb-3">{p.title}</h1>
        {p.published_at && (
          <div className="text-xs text-muted-foreground">
            {new Date(p.published_at).toLocaleDateString("zh-TW")}
          </div>
        )}
        {p.summary && (
          <p className="mt-4 text-muted-foreground whitespace-pre-wrap">{p.summary}</p>
        )}
      </header>

      {p.cover_image && (
        <img
          src={p.cover_image}
          alt={p.title}
          className="w-full rounded-2xl mb-6 object-cover"
        />
      )}

      {p.content_html && (
        <div
          className="prose prose-sm md:prose-base max-w-none whitespace-pre-wrap"
          dangerouslySetInnerHTML={{ __html: p.content_html }}
        />
      )}

      {images.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-6">
          {images.map((url, i) => (
            <img
              key={i}
              src={url}
              alt={`${p.title} ${i + 1}`}
              loading="lazy"
              className="w-full rounded-xl object-cover"
            />
          ))}
        </div>
      )}

      {p.external_url && (
        <div className="mt-8">
          <Button asChild>
            <a href={p.external_url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" /> 開啟外部連結
            </a>
          </Button>
        </div>
      )}

      <ShopContentQuestions pageId={p.id} />
    </article>
  );
}

