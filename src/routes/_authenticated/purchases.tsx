import { createFileRoute } from "@tanstack/react-router";
import { ModulePlaceholder } from "@/components/ModulePlaceholder";
export const Route = createFileRoute("/_authenticated/purchases")({
  component: () => <ModulePlaceholder title="採購管理" description="採購單、廠商與進貨流程" />,
});
