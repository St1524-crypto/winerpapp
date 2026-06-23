import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/shop/account/storefront")({
  component: StorefrontLayout,
});

function StorefrontLayout() {
  return <Outlet />;
}