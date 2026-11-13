import { describe, expect, it } from "vitest";
import { canCreateReferredAccount, registrationSchema, referralSignupPath } from "./referral-signup";

describe("referral signup rules", () => {
  it("requires explicit confirmation of the same locked code", () => {
    expect(canCreateReferredAccount("B2D63A70", undefined)).toBe(false);
    expect(canCreateReferredAccount("B2D63A70", "E2CDD19B")).toBe(false);
    expect(canCreateReferredAccount("B2D63A70", "B2D63A70")).toBe(true);
  });
  it("keeps phone registration limited to 10 digits", () => {
    expect(registrationSchema.safeParse({ name: "測試", phone: "0912345678", password: "abcdef" }).success).toBe(true);
    expect(registrationSchema.safeParse({ name: "測試", phone: "09123456789", password: "abcdef" }).success).toBe(false);
  });
  it("retains existing six-character security minimum", () => {
    expect(registrationSchema.safeParse({ name: "測試", phone: "0912345678", password: "abcde" }).success).toBe(false);
  });
  it("shares the dedicated referral entry instead of generic login", () => {
    expect(referralSignupPath("B2D63A70")).toBe("/u/B2D63A70");
  });
});
import { publicShareOrigin } from "./referral-signup";
describe("publicShareOrigin", () => {
  it("preview host becomes winerp.app", () => {
    expect(publicShareOrigin("https://8759c219-ed53-49ec-b52a-60a002da48ec.lovableproject.com")).toBe("https://winerp.app");
    expect(publicShareOrigin("https://winerpapp.lovable.app")).toBe("https://winerp.app");
  });
  it("custom domain kept", () => {
    expect(publicShareOrigin("https://www.winerp.app")).toBe("https://www.winerp.app");
  });
});
