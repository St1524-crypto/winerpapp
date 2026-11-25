import { describe, expect, it } from "vitest";
import { previewOrderEditPayment } from "./order-edit-payment";

describe("editing an order with an additional payment", () => {
  const input = { totalAmount: 127200, payments: [{ amount: 50000, payment_status: "paid" }], pointPayments: [], amount: "20000" };
  it("adds this payment to existing receipts instead of replacing them", () => {
    const result = previewOrderEditPayment(input);
    expect(result.after.cashPaid).toBe(70000);
    expect(result.after.unpaid).toBe(57200);
    expect(result.paymentStatus).toBe("partial");
  });
  it("marks exact settlement paid, including point offsets", () => {
    const result = previewOrderEditPayment({ ...input, pointPayments: [{ amount_offset: 10000, status: "applied" }], amount: "67200" });
    expect(result.after.unpaid).toBe(0);
    expect(result.paymentStatus).toBe("paid");
  });
  it("rejects payments above the edited order's outstanding amount", () => {
    expect(() => previewOrderEditPayment({ ...input, totalAmount: 60000 })).toThrow();
  });
  it.each(["-1", "NaN", "Infinity"])("rejects invalid payment %s", (amount) => {
    expect(() => previewOrderEditPayment({ ...input, amount })).toThrow();
  });
  it("allows saving without an additional receipt", () => {
    const result = previewOrderEditPayment({ ...input, amount: "" });
    expect(result.amount).toBe(0);
    expect(result.after.cashPaid).toBe(50000);
  });
});