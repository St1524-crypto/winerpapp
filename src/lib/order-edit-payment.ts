import { computeOrderPaymentTotals, type PaymentRecord, type PointPaymentRecord } from "./order-payment-totals";

export function previewOrderEditPayment(input: {
  totalAmount: number;
  payments: PaymentRecord[];
  pointPayments: PointPaymentRecord[];
  amount: string;
}) {
  const amount = Number(input.amount || 0);
  const before = computeOrderPaymentTotals(input);
  if (!Number.isFinite(amount) || amount < 0) throw new Error("本次付款需為有效的非負金額");
  if (amount > before.unpaid) throw new Error("本次付款不可大於未收款");
  const after = computeOrderPaymentTotals({
    ...input,
    payments: [...input.payments, { amount, payment_status: "completed" }],
  });
  return { amount, before, after, paymentStatus: after.isSettled ? "paid" as const : after.totalReceived > 0 ? "partial" as const : "unpaid" as const };
}