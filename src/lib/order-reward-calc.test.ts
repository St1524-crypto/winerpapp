import { describe, it, expect } from "vitest";
import {
  computeItemUnitReward,
  computeItemsRewardSubtotal,
  computeOrderRewardBreakdown,
} from "./order-reward-calc";

describe("computeItemUnitReward", () => {
  it("prefers tier_reward_points when present", () => {
    expect(computeItemUnitReward({ product_id: "p1", quantity: 1, tier_reward_points: 12 }, { p1: 5 })).toBe(12);
  });
  it("falls back to product reward when tier is null/undefined", () => {
    expect(computeItemUnitReward({ product_id: "p1", quantity: 1, tier_reward_points: null }, { p1: 5 })).toBe(5);
    expect(computeItemUnitReward({ product_id: "p1", quantity: 1 }, { p1: 5 })).toBe(5);
  });
  it("returns 0 when neither source is available", () => {
    expect(computeItemUnitReward({ product_id: "px", quantity: 1 }, {})).toBe(0);
  });
});

describe("computeItemsRewardSubtotal", () => {
  it("sums line rewards", () => {
    const items = [
      { product_id: "a", quantity: 2, tier_reward_points: 10 },
      { product_id: "b", quantity: 3, tier_reward_points: null },
    ];
    expect(computeItemsRewardSubtotal(items, { b: 4 })).toBe(2 * 10 + 3 * 4);
  });
});

describe("computeOrderRewardBreakdown", () => {
  const rates = [
    { generation_level: 1, bonus_rate: 50 },
    { generation_level: 2, bonus_rate: 20 },
  ];

  it("returns none when subtotal is 0", () => {
    const b = computeOrderRewardBreakdown({
      buyerId: "u", itemsSubtotal: 0, buyerVipActive: true, referrerChain: [], bonusRates: rates,
    });
    expect(b.kind).toBe("none");
  });

  it("credits buyer when buyer VIP active", () => {
    const b = computeOrderRewardBreakdown({
      buyerId: "u", itemsSubtotal: 100, buyerVipActive: true, referrerChain: [], bonusRates: rates,
    });
    expect(b).toMatchObject({ kind: "buyer", buyerPoints: 100, totalDistributed: 100 });
  });

  it("distributes to referrer chain when buyer inactive", () => {
    const b = computeOrderRewardBreakdown({
      buyerId: "u",
      itemsSubtotal: 100,
      buyerVipActive: false,
      referrerChain: [
        { id: "r1", vipActive: true },
        { id: "r2", vipActive: true },
      ],
      bonusRates: rates,
    });
    expect(b.kind).toBe("referrer");
    expect(b.levels.map((l) => l.amount)).toEqual([50, 20]);
    expect(b.totalDistributed).toBe(70);
  });

  it("skips inactive upline but keeps note", () => {
    const b = computeOrderRewardBreakdown({
      buyerId: "u",
      itemsSubtotal: 100,
      buyerVipActive: false,
      referrerChain: [{ id: "r1", vipActive: false }, { id: "r2", vipActive: true }],
      bonusRates: rates,
    });
    expect(b.levels[0].amount).toBe(0);
    expect(b.levels[1].amount).toBe(20);
    expect(b.totalDistributed).toBe(20);
  });

  it("caps generations by chain length", () => {
    const b = computeOrderRewardBreakdown({
      buyerId: "u",
      itemsSubtotal: 100,
      buyerVipActive: false,
      referrerChain: [{ id: "r1", vipActive: true }],
      bonusRates: rates,
    });
    expect(b.levels.length).toBe(1);
  });
});
