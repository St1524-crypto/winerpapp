import { createFileRoute } from "@tanstack/react-router";
import { ModulePlaceholder } from "@/components/ModulePlaceholder";
export const Route = createFileRoute("/_authenticated/inventory")({
  component: () => <ModulePlaceholder title="庫存管理" description="庫存進出異動、即時數量與盤點" />,
});
