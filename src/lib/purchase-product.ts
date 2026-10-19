/** Purchase intake creates a catalog draft; publishing remains a separate action. */
export function buildPurchaseProduct(input: {
  companyId: string;
  name: string;
  sku: string;
  price: number;
}) {
  return {
    company_id: input.companyId,
    name: input.name,
    sku: input.sku,
    price: input.price,
    stock: 0,
    status: "draft" as const,
  };
}