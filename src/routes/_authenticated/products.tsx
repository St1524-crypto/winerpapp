import { createFileRoute } from "@tanstack/react-router";
import { ModulePlaceholder } from "@/components/ModulePlaceholder";
export const Route = createFileRoute("/_authenticated/products")({
  component: () => <ModulePlaceholder title="商品管理" description="管理商品 SKU、分類、價格與圖片" />,
});
