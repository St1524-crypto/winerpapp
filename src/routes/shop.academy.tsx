import { createFileRoute } from "@tanstack/react-router";
import { GraduationCap, Brain, Rocket, Users } from "lucide-react";
import { ShopContentList } from "@/components/shop/ShopContentList";

export const Route = createFileRoute("/shop/academy")({
  component: AcademyPage,
  head: () => ({
    meta: [
      { title: "源晶 AI 商學院 — 招生課程 — 源晶商城" },
      {
        name: "description",
        content:
          "源晶 AI 商學院招生課程列表：AI 行銷、AI 業務、AI 電商、AI 領導力訓練，最新開課資訊與報名。",
      },
      { property: "og:title", content: "源晶 AI 商學院 — 招生課程" },
      { property: "og:description", content: "AI 時代的商業實戰課程，源晶專業講師陣容線上 / 線下開課中。" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

const HIGHLIGHTS = [
  { icon: Brain, title: "AI 應用實戰", desc: "從 Prompt 到工作流，落地企業真實場景" },
  { icon: Rocket, title: "業績加速", desc: "AI 行銷、AI 銷售、AI 電商完整攻略" },
  { icon: Users, title: "領導力進化", desc: "打造 AI 時代的高效團隊與組織文化" },
  { icon: GraduationCap, title: "系統化認證", desc: "分階培訓 + 完訓認證 + 業師輔導" },
];

function AcademyPage() {
  return (
    <div className="container mx-auto px-4 py-10 md:py-16">
      <header className="text-center max-w-2xl mx-auto mb-10 md:mb-14">
        <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-medium mb-4">
          <GraduationCap className="h-3.5 w-3.5" /> 源晶 AI 商學院
        </div>
        <h1 className="text-3xl md:text-4xl font-bold mb-3">招生課程列表</h1>
        <p className="text-muted-foreground text-sm md:text-base">
          攜手 AI，重塑你的商業競爭力。查看各期招生課程、報名資訊與講師陣容。
        </p>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 max-w-4xl mx-auto mb-10">
        {HIGHLIGHTS.map(({ icon: Icon, title, desc }) => (
          <div key={title} className="rounded-2xl border border-border/60 bg-card p-4 md:p-5 text-center">
            <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Icon className="h-5 w-5" />
            </div>
            <div className="font-semibold text-sm mb-1">{title}</div>
            <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
          </div>
        ))}
      </div>

      <ShopContentList sectionType="academy" />
    </div>
  );
}
