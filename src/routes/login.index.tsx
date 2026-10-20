import { createFileRoute } from "@tanstack/react-router";
import { LoginPage } from "@/components/login-page";

export const Route = createFileRoute("/login/")({
  head: () => ({ meta: [
    { title: "會員登入與推薦註冊 — WinERP" },
    { name: "description", content: "WinERP 會員登入與推薦電話註冊入口。" },
    { property: "og:title", content: "會員登入與推薦註冊 — WinERP" },
    { property: "og:description", content: "開啟推薦連結並確認推薦人後建立會員帳號。" },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: () => <LoginPage />,
});
