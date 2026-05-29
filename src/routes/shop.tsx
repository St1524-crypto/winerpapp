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
      <div
        className="min-h-screen flex flex-col text-foreground"
        style={{
          // Pingoluck-inspired light cream background with festive red accents
          ['--background' as never]: 'oklch(0.97 0.015 60)',
          ['--foreground' as never]: 'oklch(0.25 0.05 25)',
          ['--card' as never]: 'oklch(1 0 0)',
          ['--card-foreground' as never]: 'oklch(0.25 0.05 25)',
          ['--popover' as never]: 'oklch(1 0 0)',
          ['--popover-foreground' as never]: 'oklch(0.25 0.05 25)',
          ['--muted' as never]: 'oklch(0.94 0.02 60)',
          ['--muted-foreground' as never]: 'oklch(0.50 0.04 30)',
          ['--secondary' as never]: 'oklch(0.94 0.02 60)',
          ['--secondary-foreground' as never]: 'oklch(0.30 0.06 25)',
          ['--border' as never]: 'oklch(0.88 0.03 50)',
          ['--input' as never]: 'oklch(0.92 0.02 60)',
          ['--primary' as never]: 'oklch(0.55 0.22 25)',
          ['--primary-foreground' as never]: 'oklch(0.98 0.02 85)',
          ['--accent' as never]: 'oklch(0.93 0.04 60)',
          ['--accent-foreground' as never]: 'oklch(0.30 0.10 25)',
          ['--ring' as never]: 'oklch(0.55 0.22 25)',
          colorScheme: 'light',
          backgroundColor: 'oklch(0.97 0.015 60)',
          backgroundImage:
            'radial-gradient(ellipse 70% 50% at 0% 0%, oklch(0.95 0.05 35 / 0.9), transparent 60%),' +
            'radial-gradient(ellipse 60% 50% at 100% 10%, oklch(0.94 0.04 50 / 0.8), transparent 65%),' +
            'radial-gradient(ellipse 80% 60% at 50% 100%, oklch(0.96 0.03 70 / 0.7), transparent 70%),' +
            'linear-gradient(180deg, oklch(0.98 0.012 60) 0%, oklch(0.96 0.018 55) 100%)',
          backgroundAttachment: 'fixed',
        }}
      >
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

