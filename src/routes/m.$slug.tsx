import { createFileRoute } from "@tanstack/react-router";
import { LoginPage } from "@/components/login-page";

export const Route = createFileRoute("/m/$slug")({
  component: MemberLoginPage,
  head: ({ params }) => {
    const name = decodeURIComponent(params.slug);
    return {
      meta: [
        { title: `${name} 會員登入 — WinERP` },
        { name: "description", content: `${name} 會員專屬入口，可使用行動電話登入` },
        { property: "og:title", content: `${name} 會員登入與電話註冊 — WinERP` },
        { property: "og:description", content: "透過推薦連結電話註冊，建立前確認推薦人姓名。" },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary" },
      ],
    };
  },
});

function MemberLoginPage() {
  const { slug } = Route.useParams();
  return <LoginPage pathSlug={slug} memberMode />;
}
