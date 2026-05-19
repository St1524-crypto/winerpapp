import { createFileRoute } from "@tanstack/react-router";
import { ModulePlaceholder } from "@/components/ModulePlaceholder";
export const Route = createFileRoute("/_authenticated/orders")({
  component: () => <ModulePlaceholder title="訂單管理" description="訂單流程、出貨狀態與金流追蹤" />,
});
