import { createFileRoute } from "@tanstack/react-router";
import { ModulePlaceholder } from "@/components/ModulePlaceholder";
export const Route = createFileRoute("/_authenticated/finance")({
  component: () => <ModulePlaceholder title="財務管理" description="應收應付、收支記錄與財務報表" />,
});
