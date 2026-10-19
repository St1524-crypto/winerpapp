import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [
    { title: "源晶商城 — 源晶 ERP" },
    { name: "description", content: "源晶商城商品與會員服務入口。" },
    { property: "og:title", content: "源晶商城 — 源晶 ERP" },
    { property: "og:description", content: "源晶商城商品與會員服務入口。" },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  beforeLoad: () => { throw redirect({ to: "/shop" }); },
});
