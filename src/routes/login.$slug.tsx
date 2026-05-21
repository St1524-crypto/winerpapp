import { createFileRoute } from "@tanstack/react-router";
import { LoginPage } from "./login";

export const Route = createFileRoute("/login/$slug")({
  component: LoginSlugPage,
  head: ({ params }) => {
    const name = decodeURIComponent(params.slug);
    return {
      meta: [
        { title: `${name} 登入 — WinERP` },
        { name: "description", content: `${name} 公司專屬登入入口` },
      ],
    };
  },
});

function LoginSlugPage() {
  const { slug } = Route.useParams();
  return <LoginPage pathSlug={slug} />;
}
