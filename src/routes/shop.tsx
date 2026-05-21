import { createFileRoute, Outlet } from "@tanstack/react-router";
import { CartProvider } from "@/hooks/use-cart";
import { StorefrontHeader } from "@/components/shop/StorefrontHeader";
import { StorefrontFooter } from "@/components/shop/StorefrontFooter";
import { MobileBottomNav } from "@/components/shop/MobileBottomNav";
import { CartDrawer } from "@/components/shop/CartDrawer";
import { SupportChatWidget } from "@/components/shop/SupportChatWidget";

export const Route = createFileRoute("/shop")({
  component: ShopLayout,
  head: () => ({
    meta: [
      { title: "源晶商城 — 高端電商平台" },
      { name: "description", content: "源晶商城 — 嚴選品質商品，從供應鏈到消費者一站式服務。" },
      { property: "og:title", content: "源晶商城" },
      { property: "og:description", content: "高端電商，精選好物。" },
    ],
  }),
});

function ShopLayout() {
  return (
    <CartProvider>
      <div className="min-h-screen flex flex-col bg-background">
        <StorefrontHeader />
        <main className="flex-1 pb-24 md:pb-0">
          <Outlet />
        </main>
        <StorefrontFooter />
        <MobileBottomNav />
        <CartDrawer />
        <SupportChatWidget />
      </div>
    </CartProvider>
  );
}
