import { createFileRoute } from "@tanstack/react-router";
import { Megaphone, Sparkles, Tag } from "lucide-react";

export const Route = createFileRoute("/shop/news")({
  component: NewsPage,
  head: () => ({
    meta: [
      { title: "最新消息 — 源晶商城" },
      { name: "description", content: "源晶商城最新消息：品牌公告、活動資訊、優惠訊息一次掌握。" },
      { property: "og:title", content: "最新消息 — 源晶商城" },
      { property: "og:description", content: "品牌公告、活動資訊、優惠消息。" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function NewsPage() {
  return (
    <div className="container mx-auto px-4 py-10 md:py-16">
      <header className="text-center max-w-2xl mx-auto mb-10 md:mb-14">
        <h1 className="text-3xl md:text-4xl font-bold mb-3">最新消息</h1>
        <p className="text-muted-foreground text-sm md:text-base">
          品牌動態、活動快訊與限時優惠，第一時間在此同步。內容即將上線。
        </p>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 max-w-4xl mx-auto">
        {[
          { icon: Megaphone, title: "品牌公告", desc: "營運與服務相關重要訊息" },
          { icon: Sparkles, title: "活動資訊", desc: "會員活動、線下體驗、講座" },
          { icon: Tag, title: "優惠消息", desc: "限時促銷、VIP 專屬回饋" },
        ].map(({ icon: Icon, title, desc }) => (
          <div key={title} className="rounded-2xl border border-border/60 bg-card p-6 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Icon className="h-6 w-6" />
            </div>
            <div className="font-semibold mb-1">{title}</div>
            <p className="text-xs text-muted-foreground">{desc}</p>
            <div className="mt-4 text-[11px] text-muted-foreground/70">即將上線</div>
          </div>
        ))}
      </div>
    </div>
  );
}
