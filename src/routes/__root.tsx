import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet, Link, createRootRouteWithContext, useRouter,
  HeadContent, Scripts,
} from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/hooks/use-auth";
import { BrandingProvider } from "@/hooks/use-branding";
import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold bg-gradient-primary bg-clip-text text-transparent">404</h1>
        <h2 className="mt-4 text-xl font-semibold">頁面不存在</h2>
        <p className="mt-2 text-sm text-muted-foreground">您要查看的頁面可能已被移除或不存在。</p>
        <Link to="/" className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">回到首頁</Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">頁面載入失敗</h1>
        <p className="mt-2 text-sm text-muted-foreground">系統發生錯誤，請重新嘗試。</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button onClick={() => { router.invalidate(); reset(); }}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90">重試</button>
          <a href="/" className="rounded-md border border-input bg-background px-4 py-2 text-sm hover:bg-accent">回到首頁</a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "源晶 ERP 管理系統" },
      { name: "description", content: "源晶 ERP — 企業級電商與營運管理系統，整合商品、庫存、訂單、財務與會員。" },
      { name: "theme-color", content: "#0e1626" },
      { property: "og:title", content: "源晶 ERP 管理系統" },
      { property: "og:description", content: "源晶 ERP — 企業級電商與營運管理系統，整合商品、庫存、訂單、財務與會員。" },
      { property: "og:type", content: "website" },
      { name: "twitter:title", content: "源晶 ERP 管理系統" },
      { name: "twitter:description", content: "源晶 ERP — 企業級電商與營運管理系統，整合商品、庫存、訂單、財務與會員。" },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/1b20b34c-f72a-4cdd-ba7f-22ad1c9cfa42/id-preview-3306ba07--8759c219-ed53-49ec-b52a-60a002da48ec.lovable.app-1779209020249.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/1b20b34c-f72a-4cdd-ba7f-22ad1c9cfa42/id-preview-3306ba07--8759c219-ed53-49ec-b52a-60a002da48ec.lovable.app-1779209020249.png" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant" className="dark">
      <head><HeadContent /></head>
      <body>{children}<Scripts /></body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrandingProvider>
          <Outlet />
          <Toaster richColors position="top-right" />
        </BrandingProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
