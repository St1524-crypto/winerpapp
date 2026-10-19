import { describe, expect, it } from "vitest";
import { buildPurchaseProduct } from "./purchase-product";

describe("purchase product intake", () => {
  it.each([0, 1500])("creates a draft rather than publishing, even at price %s", (price) => {
    const product = buildPurchaseProduct({ companyId: "company-1", name: "採購商品", sku: "GEN-1", price });
    expect(product.status).toBe("draft");
    expect(product.price).toBe(price);
    expect(product.company_id).toBe("company-1");
  });

  it("starts with zero stock before receiving", () => {
    expect(buildPurchaseProduct({ companyId: "company-1", name: "採購商品", sku: "GEN-1", price: 0 }).stock).toBe(0);
  });
});