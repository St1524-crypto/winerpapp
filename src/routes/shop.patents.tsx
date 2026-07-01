import { createFileRoute } from "@tanstack/react-router";
import { ShieldCheck, FileCheck2, Award } from "lucide-react";

export const Route = createFileRoute("/shop/patents")({
  component: PatentsPage,
  head: () => ({
    meta: [
      { title: "專利檢驗區 — 源晶商城" },
      { name: "description", content: "源晶商城專利檢驗區：展示產品專利、第三方檢驗報告與國際認證資料。" },
      { property: "og:title", content: "專利檢驗區 — 源晶商城" },
      { property: "og:description", content: "產品專利、檢驗報告、認證資料。" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

function PatentsPage() {
  return (
    <div className="container mx-auto px-4 py-10 md:py-16">
      <header className="text-center max-w-2xl mx-auto mb-10 md:mb-14">
        <h1 className="text-3xl md:text-4xl font-bold mb-3">專利檢驗區</h1>
        <p className="text-muted-foreground text-sm md:text-base">
          我們致力於品質透明化。專利文件、第三方檢驗報告、國際認證資料即將於此上線。
        </p>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 max-w-4xl mx-auto">
        {[
          { icon: Award, title: "產品專利", desc: "核心技術與配方專利證書" },
          { icon: FileCheck2, title: "檢驗報告", desc: "SGS / 第三方公正單位檢驗" },
          { icon: ShieldCheck, title: "國際認證", desc: "GMP / HACCP / ISO 認證資料" },
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
