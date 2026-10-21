import { describe, expect, it } from "vitest";
import { assertMemberCompany, memberBelongsToCompany } from "./member-company";

describe("member management company scope", () => {
  it("does not show members belonging only to another company", () => {
    expect(memberBelongsToCompany("win", "win", ["other"])).toBe(false);
    expect(() => assertMemberCompany("win", "win", ["other"])).toThrow();
  });
  it("shows members with an explicit membership even if their selected company differs", () => {
    expect(memberBelongsToCompany("win", "other", ["win"])).toBe(true);
  });
  it("keeps legacy members in their assigned company only", () => {
    expect(memberBelongsToCompany("win", "win", [])).toBe(true);
    expect(memberBelongsToCompany("win", "other", [])).toBe(false);
  });
  it("blocks listing and editing without a selected company", () => {
    expect(memberBelongsToCompany(null, "win", ["win"])).toBe(false);
    expect(() => assertMemberCompany(null, "win", [])).toThrow();
  });
});