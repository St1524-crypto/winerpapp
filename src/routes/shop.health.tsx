import { createFileRoute } from "@tanstack/react-router";
import { HeartPulse, BookOpen, FlaskConical } from "lucide-react";

export const Route = createFileRoute("/shop/health")({
  component: HealthPage,
  head: () => ({
    meta: [
      { title: "健康學術 — 源晶商城" },
      { name: "description", content: "源晶商城健康學術專區：健康研究、營養知識、產品應用文獻分享。" },
      { property: "og:title", content: "健康學術 — 源晶商城" },
      { property: "og:description", content: "健康研究、營養知識、產品應用。" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function HealthPage() {
  return (
    <div className="container mx-auto px-4 py-10 md:py-16">
      <header className="text-center max-w-2xl mx-auto mb-10 md:mb-14">
        <h1 className="text-3xl md:text-4xl font-bold mb-3">健康學術</h1>
        <p className="text-muted-foreground text-sm md:text-base">
          以科學為本，分享健康研究、營養知識與產品應用實證。內容即將上線。
        </p>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 max-w-4xl mx-auto">
        {[
          { icon: FlaskConical, title: "健康研究", desc: "國內外研究文獻與趨勢" },
          { icon: BookOpen, title: "營養知識", desc: "日常保健與飲食觀念" },
          { icon: HeartPulse, title: "產品應用", desc: "使用建議與案例分享" },
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
