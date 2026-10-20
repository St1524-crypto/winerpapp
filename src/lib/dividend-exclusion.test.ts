import { describe, expect, it } from "vitest";
import { assertDividendEditor, belongsToDividendCompany, canParticipateInDividends, dividendExclusionSchema } from "./dividend-exclusion";

describe("member dividend exclusion", () => {
  it("allows legacy members only in their assigned company", () => {
    expect(belongsToDividendCompany("company-a", "company-a", [])).toBe(true);
    expect(belongsToDividendCompany("company-b", "company-a", [])).toBe(false);
  });
  it("does not let a selected profile company override explicit memberships", () => {
    expect(belongsToDividendCompany("company-a", "company-a", ["company-b"])).toBe(false);
    expect(belongsToDividendCompany("company-b", "company-a", ["company-b"])).toBe(true);
  });
  it("rejects missing company assignments", () => {
    expect(belongsToDividendCompany(null, null, [])).toBe(false);
    expect(belongsToDividendCompany("company-a", null, [])).toBe(false);
  });
  it("allows only super administrators to edit", () => {
    expect(() => assertDividendEditor(["super_admin"])).not.toThrow();
    for (const role of ["admin", "finance", "member", "sales", "warehouse"]) {
      expect(() => assertDividendEditor([role])).toThrow();
    }
  });
  it("excludes the selected member from dividends", () => {
    expect(canParticipateInDividends(true)).toBe(false);
    expect(canParticipateInDividends(false)).toBe(true);
  });
  it("requires a reason when excluding", () => {
    const userId = "11111111-1111-4111-8111-111111111111";
    expect(dividendExclusionSchema.safeParse({ userId, excluded: true, reason: " " }).success).toBe(false);
    expect(dividendExclusionSchema.safeParse({ userId, excluded: true, reason: "會員申請停止" }).success).toBe(true);
    expect(dividendExclusionSchema.safeParse({ userId, excluded: false, reason: "" }).success).toBe(true);
  });
});