import { describe, expect, it } from "vitest";
import { computeOrderPaymentTotals } from "./order-payment-totals";

describe("order list outstanding balance", () => {
  it("deducts paid receipts from the order total", () => {
    expect(computeOrderPaymentTotals({
      totalAmount: 133560,
      payments: [{ amount: 50000, payment_status: "paid" }],
      pointPayments: [],
    }).unpaid).toBe(83560);
  });

  it("includes completed cash and applied point offsets, not pending or refunded receipts", () => {
    expect(computeOrderPaymentTotals({
      totalAmount: 1000,
      payments: [
        { amount: 200, payment_status: "completed" },
        { amount: 500, payment_status: "pending" },
        { amount: 100, payment_status: "refunded" },
      ],
      pointPayments: [
        { amount_offset: 300, status: "applied" },
        { amount_offset: 100, status: "cancelled" },
      ],
    }).unpaid).toBe(500);
  });

  it("never shows a negative outstanding balance", () => {
    expect(computeOrderPaymentTotals({
      totalAmount: 1000,
      payments: [{ amount: 1200, payment_status: "paid" }],
      pointPayments: [],
    }).unpaid).toBe(0);
  });
});