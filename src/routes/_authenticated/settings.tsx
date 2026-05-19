import { createFileRoute } from "@tanstack/react-router";
import { ModulePlaceholder } from "@/components/ModulePlaceholder";
export const Route = createFileRoute("/_authenticated/settings")({
  component: () => <ModulePlaceholder title="系統設定" description="公司資料、權限規則與整合設定" />,
});
