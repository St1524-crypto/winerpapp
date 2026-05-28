import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LoginPage } from "./login";
import { isMobileDevice } from "@/lib/device";

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
  const navigate = useNavigate();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    // Allow opt-out: ?desktop=1 stays on the desktop login portal.
    const params = new URLSearchParams(window.location.search);
    const forceDesktop = params.get("desktop") === "1";
    if (!forceDesktop && isMobileDevice()) {
      navigate({ to: "/m/$slug", params: { slug }, replace: true });
      return;
    }
    setChecked(true);
  }, [slug, navigate]);

  if (!checked) return null;
  return <LoginPage pathSlug={slug} />;
}

