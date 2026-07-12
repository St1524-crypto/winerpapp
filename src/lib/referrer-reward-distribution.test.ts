import { describe, expect, it } from "vitest";
import {
  computeBasePoints,
  computeLevelPayable,
  formatBuyerMarkerNote,
  formatLevelNote,
  type LevelDistribution,
} from "./referrer-reward-distribution";

describe("computeBasePoints (repurchase_bonus_settings 多代換算)", () => {
  it("按 rate% 折算並向下取整", () => {
    expect(computeBasePoints(1000, 10)).toBe(100);
    expect(computeBasePoints(1000, 5)).toBe(50);
    expect(computeBasePoints(999, 5)).toBe(49); // floor(49.95)
    expect(computeBasePoints(1000, 0.5)).toBe(5);
  });
  it("負值 / 0 回傳 0", () => {
    expect(computeBasePoints(0, 10)).toBe(0);
    expect(computeBasePoints(1000, 0)).toBe(0);
    expect(computeBasePoints(-100, 10)).toBe(0);
    expect(computeBasePoints(1000, -5)).toBe(0);
  });
});

describe("computeLevelPayable (雙 cap: 營業分紅 / 升級分紅)", () => {
  it("兩個 RPC 皆未 cap → 全額 payable，無 capReasons", () => {
    expect(computeLevelPayable(100, 100, 100)).toEqual({
      payable: 100,
      capReasons: [],
    });
  });

  it("僅營業分紅 cap 部分達上限", () => {
    expect(computeLevelPayable(100, 40, 100)).toEqual({
      payable: 40,
      capReasons: ["營業分紅上限"],
    });
  });

  it("僅升級分紅 cap 部分達上限", () => {
    expect(computeLevelPayable(100, 100, 30)).toEqual({
      payable: 30,
      capReasons: ["升級分紅上限"],
    });
  });

  it("兩個 cap 同時觸發，取最小值並列出兩個原因", () => {
    expect(computeLevelPayable(100, 40, 30)).toEqual({
      payable: 30,
      capReasons: ["營業分紅上限", "升級分紅上限"],
    });
  });

  it("營業分紅 cap 已滿 → payable=0，capReasons 保留原因", () => {
    expect(computeLevelPayable(100, 0, 100)).toEqual({
      payable: 0,
      capReasons: ["營業分紅上限"],
    });
  });

  it("升級分紅 cap 已滿 → payable=0，capReasons 保留原因", () => {
    expect(computeLevelPayable(100, 100, 0)).toEqual({
      payable: 0,
      capReasons: ["升級分紅上限"],
    });
  });

  it("兩個 cap 皆已滿 → payable=0，兩個原因都列出", () => {
    expect(computeLevelPayable(100, 0, 0)).toEqual({
      payable: 0,
      capReasons: ["營業分紅上限", "升級分紅上限"],
    });
  });

  it("負值輸入被夾為 0，且不會誤判為 cap", () => {
    // basePoints=0 → biz/upg 皆 >= base，不算 cap
    expect(computeLevelPayable(0, -5, -3)).toEqual({
      payable: 0,
      capReasons: [],
    });
  });

  it("RPC 回傳小數 → 向下取整", () => {
    expect(computeLevelPayable(100, 40.9, 30.9)).toEqual({
      payable: 30,
      capReasons: ["營業分紅上限", "升級分紅上限"],
    });
  });
});

describe("formatLevelNote (每代 note 顯示)", () => {
  it("上線非有效 VIP 且有 basePoints → 顯示略過原因", () => {
    expect(formatLevelNote(0, [], false, 50)).toBe("上線非有效 VIP 略過");
  });

  it("上線非有效 VIP 且 basePoints=0 → undefined（無事可述）", () => {
    expect(formatLevelNote(0, [], false, 0)).toBeUndefined();
  });

  it("有效 VIP 未觸發任何 cap → undefined", () => {
    expect(formatLevelNote(100, [], true, 100)).toBeUndefined();
  });

  it("payable>0 且部分達上限 → 「部分達…」", () => {
    expect(formatLevelNote(40, ["營業分紅上限"], true, 100)).toBe("部分達營業分紅上限");
    expect(formatLevelNote(30, ["營業分紅上限", "升級分紅上限"], true, 100)).toBe(
      "部分達營業分紅上限、升級分紅上限",
    );
  });

  it("payable=0 且達上限 → 「已達… 略過」", () => {
    expect(formatLevelNote(0, ["營業分紅上限"], true, 100)).toBe("已達營業分紅上限 略過");
    expect(formatLevelNote(0, ["營業分紅上限", "升級分紅上限"], true, 100)).toBe(
      "已達營業分紅上限、升級分紅上限 略過",
    );
    expect(formatLevelNote(0, ["升級分紅上限"], true, 100)).toBe("已達升級分紅上限 略過");
  });
});

describe("formatBuyerMarkerNote (訂單詳情顯示的 note)", () => {
  it("無有效上線 → 顯示「無有效 VIP 上線可接收」", () => {
    expect(formatBuyerMarkerNote(1000, 0, [])).toBe(
      "買家非有效 VIP，1000 獎勵點依復購位階折算 0 點發放至推薦人獎勵點錢包（無有效 VIP 上線可接收）",
    );
  });

  it("多代皆順利發放", () => {
    const dist: LevelDistribution[] = [
      { level: 1, amount: 50 },
      { level: 2, amount: 30 },
    ];
    expect(formatBuyerMarkerNote(1000, 80, dist)).toBe(
      "買家非有效 VIP，1000 獎勵點依復購位階折算 80 點發放至推薦人獎勵點錢包（L1 +50 點, L2 +30 點）",
    );
  });

  it("payable=0 時仍顯示原因（cap / 上線非 VIP）", () => {
    const dist: LevelDistribution[] = [
      { level: 1, amount: 50 },
      { level: 2, amount: 0, note: "已達營業分紅上限 略過" },
      { level: 3, amount: 0, note: "上線非有效 VIP 略過" },
      { level: 4, amount: 10, note: "部分達升級分紅上限" },
    ];
    const out = formatBuyerMarkerNote(1000, 60, dist);
    expect(out).toContain("L1 +50 點");
    expect(out).toContain("L2 +0 點（已達營業分紅上限 略過）");
    expect(out).toContain("L3 +0 點（上線非有效 VIP 略過）");
    expect(out).toContain("L4 +10 點（部分達升級分紅上限）");
    expect(out).toContain("1000 獎勵點依復購位階折算 60 點發放至推薦人獎勵點錢包");
  });
});

describe("整合：多代折算 + cap 檢查（模擬 handler 迴圈）", () => {
  interface UplineFixture {
    id: string;
    upVipActive: boolean;
    bizPayableFromRpc: number; // 已模擬 RPC 上限
    upgPayableFromRpc: number;
  }

  function simulate(
    rewardEarn: number,
    rates: Array<{ level: number; rate: number }>,
    uplines: UplineFixture[],
  ) {
    const distributedTo: LevelDistribution[] = [];
    let total = 0;
    for (let i = 0; i < uplines.length; i++) {
      const level = i + 1;
      const rate = rates.find((r) => r.level === level)?.rate ?? 0;
      const base = computeBasePoints(rewardEarn, rate);
      const up = uplines[i];
      if (up.upVipActive && base > 0) {
        const { payable, capReasons } = computeLevelPayable(
          base,
          up.bizPayableFromRpc,
          up.upgPayableFromRpc,
        );
        total += payable;
        distributedTo.push({
          level,
          amount: payable,
          note: formatLevelNote(payable, capReasons, true, base),
        });
      } else if (base > 0) {
        distributedTo.push({
          level,
          amount: 0,
          note: formatLevelNote(0, [], false, base),
        });
      }
    }
    return { total, distributedTo, note: formatBuyerMarkerNote(rewardEarn, total, distributedTo) };
  }

  it("三代皆有效、無 cap → 依 rate 逐級發放", () => {
    const r = simulate(
      1000,
      [{ level: 1, rate: 10 }, { level: 2, rate: 5 }, { level: 3, rate: 2 }],
      [
        { id: "u1", upVipActive: true, bizPayableFromRpc: 999, upgPayableFromRpc: 999 },
        { id: "u2", upVipActive: true, bizPayableFromRpc: 999, upgPayableFromRpc: 999 },
        { id: "u3", upVipActive: true, bizPayableFromRpc: 999, upgPayableFromRpc: 999 },
      ],
    );
    expect(r.total).toBe(100 + 50 + 20);
    expect(r.distributedTo.map((d) => d.amount)).toEqual([100, 50, 20]);
    expect(r.distributedTo.every((d) => d.note === undefined)).toBe(true);
  });

  it("L1 營業分紅已滿、L2 上線非 VIP、L3 升級分紅部分達上限 → note 皆正確顯示原因", () => {
    const r = simulate(
      1000,
      [{ level: 1, rate: 10 }, { level: 2, rate: 5 }, { level: 3, rate: 2 }],
      [
        { id: "u1", upVipActive: true, bizPayableFromRpc: 0, upgPayableFromRpc: 100 },
        { id: "u2", upVipActive: false, bizPayableFromRpc: 0, upgPayableFromRpc: 0 },
        { id: "u3", upVipActive: true, bizPayableFromRpc: 20, upgPayableFromRpc: 5 },
      ],
    );
    expect(r.distributedTo).toEqual([
      { level: 1, amount: 0, note: "已達營業分紅上限 略過" },
      { level: 2, amount: 0, note: "上線非有效 VIP 略過" },
      { level: 3, amount: 5, note: "部分達升級分紅上限" },
    ]);
    expect(r.total).toBe(5);
    expect(r.note).toContain("L1 +0 點（已達營業分紅上限 略過）");
    expect(r.note).toContain("L2 +0 點（上線非有效 VIP 略過）");
    expect(r.note).toContain("L3 +5 點（部分達營業分紅上限、升級分紅上限）");
  });

  it("所有代皆 payable=0 → total=0，但 note 逐級列出原因（不是「無有效上線」）", () => {
    const r = simulate(
      1000,
      [{ level: 1, rate: 10 }, { level: 2, rate: 5 }],
      [
        { id: "u1", upVipActive: true, bizPayableFromRpc: 0, upgPayableFromRpc: 0 },
        { id: "u2", upVipActive: false, bizPayableFromRpc: 0, upgPayableFromRpc: 0 },
      ],
    );
    expect(r.total).toBe(0);
    expect(r.note).toContain("L1 +0 點（已達營業分紅上限、升級分紅上限 略過）");
    expect(r.note).toContain("L2 +0 點（上線非有效 VIP 略過）");
    expect(r.note).not.toContain("無有效 VIP 上線可接收");
  });
});
