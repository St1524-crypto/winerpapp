import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ExternalLink, Loader2 } from "lucide-react";
import { listPublicShopContentPages } from "@/lib/shop-content.functions";

type Props = {
  sectionType: "wholesale" | "patent" | "news" | "health" | "academy";
  emptyText?: string;
};

export function ShopContentList({ sectionType, emptyText = "內容即將上線" }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["shop-content-public", sectionType],
    queryFn: () => listPublicShopContentPages({ data: { section_type: sectionType, limit: 50 } }),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const pages = (data?.pages ?? []) as any[];
  if (pages.length === 0) {
    return (
      <div className="text-center text-sm text-muted-foreground py-10">{emptyText}</div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6 max-w-6xl mx-auto">
      {pages.map((p) => {
        const isExternal = !!p.external_url;
        const commonInner = (
          <>
            {p.cover_image && (
              <div className="aspect-[16/9] overflow-hidden bg-muted">
                <img
                  src={p.cover_image}
                  alt={p.title}
                  loading="lazy"
                  className="h-full w-full object-cover group-hover:scale-105 transition-transform"
                />
              </div>
            )}
            <div className="p-5">
              <div className="font-semibold mb-2 group-hover:text-primary flex items-center gap-1.5">
                {p.title}
                {isExternal && <ExternalLink className="h-3.5 w-3.5 opacity-60" />}
              </div>
              {p.summary && (
                <p className="text-xs text-muted-foreground line-clamp-3 whitespace-pre-wrap">{p.summary}</p>
              )}
              {p.published_at && (
                <div className="mt-3 text-[11px] text-muted-foreground/70">
                  {new Date(p.published_at).toLocaleDateString("zh-TW")}
                </div>
              )}
            </div>
          </>
        );
        const className = "group rounded-2xl border border-border/60 bg-card overflow-hidden hover:shadow-lg transition-shadow block";
        return isExternal ? (
          <a key={p.id} href={p.external_url} target="_blank" rel="noopener noreferrer" className={className}>
            {commonInner}
          </a>
        ) : (
          <Link key={p.id} to="/shop/content/$slug" params={{ slug: p.slug }} className={className}>
            {commonInner}
          </Link>
        );
      })}
    </div>
  );
}
