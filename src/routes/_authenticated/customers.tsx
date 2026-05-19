import { createFileRoute } from "@tanstack/react-router";
import { ModulePlaceholder } from "@/components/ModulePlaceholder";
export const Route = createFileRoute("/_authenticated/customers")({
  component: () => <ModulePlaceholder title="客戶管理" description="B2B 客戶資料、聯絡窗口與交易紀錄" />,
});
