import { createFileRoute } from "@tanstack/react-router";
import { ModulePlaceholder } from "@/components/ModulePlaceholder";
export const Route = createFileRoute("/_authenticated/members")({
  component: () => <ModulePlaceholder title="會員管理" description="會員帳號、等級與角色權限指派" />,
});
