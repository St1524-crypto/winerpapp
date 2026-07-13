import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/admin/bonuses")({
  component: BonusesLayout,
});

function BonusesLayout() {
  return <Outlet />;
}
