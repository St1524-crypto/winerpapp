import { describe, it, expect } from "vitest";
import {
  resolveRewardNotice,
  REFERRER_FALLBACK_NOTE,
  type RewardTxRow,
} from "./checkout-reward-notice";

const earn = (amount: number, note: string | null = null): RewardTxRow => ({
  source: "order_earn",
  amount,
  note,
});
const ref = (note: string | null): RewardTxRow => ({
  source: "order_earn_referrer",
  amount: 0,
  note,
});

describe("resolveRewardNotice", () => {
  it("returns null when there are no reward transactions", () => {
    expect(resolveRewardNotice([])).toBeNull();
  });

  it("renders '本次發放獎勵點' with positive earned points", () => {
    expect(resolveRewardNotice([earn(120)])).toEqual({ kind: "earn", points: 120 });
  });

  it("ignores order_earn rows with zero amount and falls through", () => {
    expect(resolveRewardNotice([earn(0)])).toBeNull();
  });

  it("prefers earn over referrer when both exist and earn > 0", () => {
    const rows = [earn(50), ref("routed to referrer")];
    expect(resolveRewardNotice(rows)).toEqual({ kind: "earn", points: 50 });
  });

  it("renders referrer note when only referrer row exists", () => {
    const rows = [ref("L1 +30 點, L2 +10 點")];
    expect(resolveRewardNotice(rows)).toEqual({
      kind: "referrer",
      note: "L1 +30 點, L2 +10 點",
    });
  });

  it("falls back to default explanation when referrer note is null", () => {
    expect(resolveRewardNotice([ref(null)])).toEqual({
      kind: "referrer",
      note: REFERRER_FALLBACK_NOTE,
    });
  });

  it("uses referrer branch when earn amount is 0 but referrer row exists", () => {
    expect(resolveRewardNotice([earn(0), ref("capped")])).toEqual({
      kind: "referrer",
      note: "capped",
    });
  });

  it("coerces string amounts (Supabase numeric) safely", () => {
    const row = { source: "order_earn", amount: "88" as unknown as number, note: null };
    expect(resolveRewardNotice([row])).toEqual({ kind: "earn", points: 88 });
  });
});
