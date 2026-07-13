// Shared helper to compute order payment totals consistently across
// backend validation and frontend display. Keep this pure so both the
// server function (`createSalesOrderWithPointPayments`) and the order
// detail dialog (`orders.tsx`) agree on paidTotal / unpaid / pointOffset.

export interface PaymentRecord {
  amount: number | string | null | undefined;
  payment_status?: string | null;
}

export interface PointPaymentRecord {
  amount_offset: number | string | null | undefined;
  status?: string | null;
}

export interface OrderPaymentTotals {
  cashPaid: number;          // sum of completed cash payments
  cashPending: number;       // sum of non-completed cash payments
  pointOffsetApplied: number; // sum of applied/completed point offsets
  totalReceived: number;     // cashPaid + pointOffsetApplied
  unpaid: number;            // max(0, totalAmount - totalReceived)
  isSettled: boolean;        // totalReceived >= totalAmount
  overpaid: number;          // max(0, totalReceived - totalAmount)
}

const toNumber = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

const PAID_CASH_STATUS = new Set(["completed", "paid"]);
const APPLIED_POINT_STATUS = new Set(["applied", "completed"]);

export function computeOrderPaymentTotals(input: {
  totalAmount: number | string;
  payments: PaymentRecord[];
  pointPayments: PointPaymentRecord[];
}): OrderPaymentTotals {
  const total = toNumber(input.totalAmount);
  let cashPaid = 0;
  let cashPending = 0;
  for (const p of input.payments ?? []) {
    const amt = toNumber(p.amount);
    if (PAID_CASH_STATUS.has(String(p.payment_status ?? "completed"))) cashPaid += amt;
    else cashPending += amt;
  }
  let pointOffsetApplied = 0;
  for (const pp of input.pointPayments ?? []) {
    if (APPLIED_POINT_STATUS.has(String(pp.status ?? "applied"))) {
      pointOffsetApplied += toNumber(pp.amount_offset);
    }
  }
  const totalReceived = cashPaid + pointOffsetApplied;
  const unpaid = Math.max(0, total - totalReceived);
  const overpaid = Math.max(0, totalReceived - total);
  return {
    cashPaid,
    cashPending,
    pointOffsetApplied,
    totalReceived,
    unpaid,
    overpaid,
    isSettled: totalReceived >= total,
  };
}

/**
 * Backend-side validation. Throws with a Chinese message on failure so the
 * user sees a clear error on the checkout page.
 * - Ensures line items add up to `subtotal + shipping - discount = total`
 * - Ensures point offsets + cash payments never exceed the order total
 * - When the order is marked paid, requires exact settlement
 */
export function assertOrderTotalsInvariant(input: {
  orderTotal: number;
  subtotal?: number;
  shippingFee?: number;
  discountAmount?: number;
  taxAmount?: number;
  paymentsTotal: number;
  pointOffsetTotal: number;
  paymentStatus?: string;
}) {
  const {
    orderTotal,
    subtotal,
    shippingFee = 0,
    discountAmount = 0,
    taxAmount = 0,
    paymentsTotal,
    pointOffsetTotal,
    paymentStatus,
  } = input;

  if (subtotal !== undefined) {
    // 正規語意：訂單總額 = 小計 + 運費 + 稅額 − 折扣
    const expected = subtotal + shippingFee + taxAmount - discountAmount;
    // 相容 shop 前台歷史行為：checkout 將點數折抵值寫入 discount_amount，
    // 但 total_amount 不會減去該值（點數折抵透過 pointPayments 收款覆蓋）。
    // 因此在 discountAmount 剛好等於 pointOffsetTotal 時，orderTotal 允許等於
    // subtotal + shipping + tax（不扣 discount）。
    const expectedIgnoringPointDiscount = subtotal + shippingFee + taxAmount;
    const withinExpected = Math.abs(expected - orderTotal) <= 1;
    const withinPointDiscountPattern =
      pointOffsetTotal > 0 &&
      Math.abs(discountAmount - pointOffsetTotal) <= 1 &&
      Math.abs(expectedIgnoringPointDiscount - orderTotal) <= 1;
    if (!withinExpected && !withinPointDiscountPattern) {
      throw new Error(
        `訂單金額不一致：小計 ${subtotal} + 運費 ${shippingFee} + 稅額 ${taxAmount} - 折扣 ${discountAmount} ≠ 總額 ${orderTotal}`,
      );
    }
  }


  if (pointOffsetTotal < 0 || paymentsTotal < 0) {
    throw new Error("金額不可為負數");
  }

  const covered = paymentsTotal + pointOffsetTotal;
  if (covered - orderTotal > 0.5) {
    throw new Error(
      `收款合計 ${covered} 超過訂單總額 ${orderTotal}（現金 ${paymentsTotal} + 點數折抵 ${pointOffsetTotal}）`,
    );
  }

  if (paymentStatus === "paid" && Math.abs(covered - orderTotal) > 0.5) {
    throw new Error(
      `訂單標記為已付款，但收款合計 ${covered} 不等於訂單總額 ${orderTotal}`,
    );
  }
}
