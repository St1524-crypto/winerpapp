import { describe, expect, it } from "vitest";
import { nextRepurchaseDate, splitPointsByMonth } from "./next-repurchase";

describe("分月責任額", () => {
  it("1000 點以每月 200 點分成 5 個月", () => {
    expect(splitPointsByMonth(1000, "202611", 200)).toEqual([
      { ym: "202611", points: 200 }, { ym: "202612", points: 200 }, { ym: "202701", points: 200 },
      { ym: "202702", points: 200 }, { ym: "202703", points: 200 },
    ]);
  });
  it("餘數併入第一個月", () => {
    expect(splitPointsByMonth(1050, "202611", 200)[0]).toEqual({ ym: "202611", points: 250 });
  });
  it("5 個月都達 200 點，下一個應重購日為第 6 個月 1 日", () => {
    const rows = splitPointsByMonth(1000, "202611", 200);
    expect(nextRepurchaseDate(rows, "202611", 200)).toBe("2027-04-01");
  });
  it("本月未達 200 點，應重購日為本月", () => {
    expect(nextRepurchaseDate([{ ym: "202611", points: 150 }], "202611", 200)).toBe("2026-11-01");
  });
});
