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
      ],
    };
  },
});

function MemberLoginPage() {
  const { slug } = Route.useParams();
  return <LoginPage pathSlug={slug} memberMode />;
}
