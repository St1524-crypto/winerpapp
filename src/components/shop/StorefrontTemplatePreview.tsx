import { Facebook, Instagram, Youtube, MessageCircle, Calendar, MapPin, Play, ShoppingBag, Star } from "lucide-react";

type Section = {
  type: string;
  title?: string;
  subtitle?: string;
  body?: string;
  ctaText?: string;
  buttonText?: string;
  url?: string;
  date?: string;
  location?: string;
  limit?: number;
  items?: Array<{ title?: string; desc?: string; time?: string; url?: string; video_url?: string }>;
  videos?: Array<{ title?: string; url?: string; video_url?: string }>;
  video_url?: string;
  showFacebook?: boolean;
  showInstagram?: boolean;
  showLine?: boolean;
  showYoutube?: boolean;
};

type Content = {
  layout?: string;
  sections?: Section[];
  gallery?: Array<{ image?: string; caption?: string }>;
};

const URL_RE = /https?:\/\/[^\s]+/gi;
function isUrl(s?: string) { return !!s && /^https?:\/\//i.test(s.trim()); }
function extractUrls(s?: string): string[] {
  if (!s) return [];
  return s.match(URL_RE) ?? [];
}
function toYouTubeEmbed(url: string): string | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, "");
    let id = "";
    if (host === "youtu.be") id = u.pathname.slice(1);
    else if (host.endsWith("youtube.com")) {
      if (u.pathname === "/watch") id = u.searchParams.get("v") ?? "";
      else if (u.pathname.startsWith("/embed/")) id = u.pathname.split("/")[2] ?? "";
      else if (u.pathname.startsWith("/shorts/")) id = u.pathname.split("/")[2] ?? "";
    }
    if (!id) return null;
    return `https://www.youtube.com/embed/${id}`;
  } catch { return null; }
}
function collectVideoUrls(s: Section): string[] {
  const out: string[] = [];
  const push = (v?: string) => { if (v && isUrl(v)) out.push(v.trim()); };
  push(s.url); push(s.video_url);
  if (s.title && isUrl(s.title)) push(s.title);
  extractUrls(s.body).forEach((u) => out.push(u));
  (s.videos ?? []).forEach((v) => { push(v.url); push(v.video_url); if (v.title && isUrl(v.title)) push(v.title); });
  (s.items ?? []).forEach((it) => { push(it.url); push(it.video_url); if (it.title && isUrl(it.title)) push(it.title); extractUrls(it.desc).forEach((u) => out.push(u)); });
  return Array.from(new Set(out));
}

function Hero({ s }: { s: Section }) {
  return (
    <div className="rounded-lg bg-gradient-to-br from-primary/15 via-primary/5 to-background p-8 text-center border">
      {s.subtitle && <div className="text-xs uppercase tracking-wider text-primary mb-2">{s.subtitle}</div>}
      <h3 className="text-2xl font-bold mb-3">{s.title || "標題"}</h3>
      {s.ctaText && (
        <span className="inline-block mt-2 px-5 py-2 rounded-full bg-primary text-primary-foreground text-sm">
          {s.ctaText}
        </span>
      )}
    </div>
  );
}

function Block({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      {title && <h4 className="font-semibold border-l-4 border-primary pl-2">{title}</h4>}
      {children}
    </div>
  );
}

function SectionView({ s, gallery }: { s: Section; gallery?: Content["gallery"] }) {
  switch (s.type) {
    case "hero":
      return <Hero s={s} />;
    case "about":
      return (
        <Block title={s.title || "關於我"}>
          <p className="text-sm text-muted-foreground whitespace-pre-line">{s.body}</p>
        </Block>
      );
    case "services":
      return (
        <Block title={s.title || "服務項目"}>
          <div className="grid sm:grid-cols-2 gap-2">
            {(s.items ?? []).map((it, i) => (
              <div key={i} className="rounded border p-3">
                <div className="font-medium text-sm">{it.title}</div>
                <div className="text-xs text-muted-foreground">{it.desc}</div>
              </div>
            ))}
          </div>
        </Block>
      );
    case "agenda":
      return (
        <Block title={s.title || "活動流程"}>
          <ul className="text-sm space-y-1">
            {(s.items ?? []).map((it, i) => (
              <li key={i} className="flex gap-3 border-b py-1">
                <span className="text-muted-foreground w-20">{it.time || "--:--"}</span>
                <span>{it.title || "項目"}</span>
              </li>
            ))}
          </ul>
        </Block>
      );
    case "featured_products":
      return (
        <Block title={s.title || "精選商品"}>
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: Math.min(s.limit ?? 6, 6) }).map((_, i) => (
              <div key={i} className="aspect-square rounded border bg-muted/40 flex items-center justify-center">
                <ShoppingBag className="w-6 h-6 text-muted-foreground/60" />
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">將依您挑選的商品顯示</p>
        </Block>
      );
    case "custom_products":
      return (
        <Block title={s.title || "獨家推薦"}>
          <div className="grid grid-cols-2 gap-2">
            {[0, 1].map((i) => (
              <div key={i} className="rounded border p-3 flex gap-2 items-center">
                <Star className="w-4 h-4 text-primary" />
                <span className="text-sm text-muted-foreground">自訂商品 {i + 1}</span>
              </div>
            ))}
          </div>
        </Block>
      );
    case "social_links":
      return (
        <Block title={s.title || "我的社群"}>
          <div className="flex gap-3 flex-wrap">
            {s.showFacebook && <Facebook className="w-5 h-5" />}
            {s.showInstagram && <Instagram className="w-5 h-5" />}
            {s.showYoutube && <Youtube className="w-5 h-5" />}
            {s.showLine && <MessageCircle className="w-5 h-5" />}
          </div>
        </Block>
      );
    case "videos": {
      const urls = collectVideoUrls(s);
      const isTitleUrl = s.title && isUrl(s.title);
      return (
        <Block title={isTitleUrl ? "精選影片" : (s.title || "精選影片")}>
          {urls.length > 0 ? (
            <div className="grid sm:grid-cols-2 gap-3">
              {urls.map((u, i) => {
                const embed = toYouTubeEmbed(u);
                return embed ? (
                  <div key={i} className="aspect-video rounded border overflow-hidden bg-black">
                    <iframe
                      src={embed}
                      className="w-full h-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                      title={`video-${i}`}
                    />
                  </div>
                ) : (
                  <a key={i} href={u} target="_blank" rel="noreferrer" className="aspect-video rounded border bg-muted/40 flex items-center justify-center hover:bg-muted">
                    <Play className="w-6 h-6 text-muted-foreground/60" />
                  </a>
                );
              })}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {[0, 1].map((i) => (
                <div key={i} className="aspect-video rounded border bg-muted/40 flex items-center justify-center">
                  <Play className="w-6 h-6 text-muted-foreground/60" />
                </div>
              ))}
            </div>
          )}
        </Block>
      );
    }
    case "event_info":
      return (
        <Block title={s.title || "活動資訊"}>
          <div className="rounded border p-3 space-y-1 text-sm">
            {s.date && (
              <div className="flex items-center gap-2"><Calendar className="w-4 h-4" />{s.date}</div>
            )}
            {s.location && (
              <div className="flex items-center gap-2"><MapPin className="w-4 h-4" />{s.location}</div>
            )}
            {s.body && <p className="text-muted-foreground whitespace-pre-line">{s.body}</p>}
            {!s.date && !s.location && !s.body && <p className="text-muted-foreground">活動詳情</p>}
          </div>
        </Block>
      );
    case "cta":
      return (
        <div className="rounded-lg border-2 border-dashed border-primary/40 p-5 text-center space-y-2">
          <div className="font-semibold">{s.title || "立即行動"}</div>
          <span className="inline-block px-5 py-2 rounded-full bg-primary text-primary-foreground text-sm">
            {s.buttonText || "前往"}
          </span>
        </div>
      );
    case "contact":
      return (
        <Block title={s.title || "聯絡我"}>
          <div className="flex gap-3 flex-wrap">
            {s.showFacebook && <Facebook className="w-5 h-5" />}
            {s.showInstagram && <Instagram className="w-5 h-5" />}
            {s.showYoutube && <Youtube className="w-5 h-5" />}
            {s.showLine && <MessageCircle className="w-5 h-5" />}
          </div>
        </Block>
      );
    default:
      return (
        <Block title={s.title || s.type}>
          <p className="text-xs text-muted-foreground">{s.body || "（自訂區塊）"}</p>
        </Block>
      );
  }
}

export function StorefrontTemplatePreview({ content }: { content: any }) {
  const data: Content = content && typeof content === "object" ? content : {};
  const sections = Array.isArray(data.sections) ? data.sections : [];

  if (!sections.length && !data.gallery?.length) {
    return (
      <div className="text-sm text-muted-foreground p-6 text-center border rounded">
        此版模尚未提供預覽內容。
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {data.layout && (
        <div className="text-xs text-muted-foreground">版型：{data.layout}</div>
      )}
      {data.gallery && data.gallery.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {data.gallery.slice(0, 6).map((g, i) => (
            <div key={i} className="aspect-square rounded border overflow-hidden bg-muted/40">
              {g.image ? (
                <img src={g.image} alt={g.caption ?? ""} className="w-full h-full object-cover" />
              ) : null}
            </div>
          ))}
        </div>
      )}
      {sections.map((s, i) => (
        <SectionView key={i} s={s} gallery={data.gallery} />
      ))}
    </div>
  );
}
