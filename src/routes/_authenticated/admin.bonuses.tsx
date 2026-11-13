import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/admin/bonuses")({
  component: BonusesLayout,
});

function BonusesLayout() {
  return (
    <>
      <div className="mx-4 mt-4 rounded-md border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-medium text-foreground">
        ※ 系統獎金金額一律以「獎勵點」計算（非新台幣）；發放時 80% 入現金錢包、20% 入貢獻點。
      </div>
      <Outlet />
    </>
  );
}
