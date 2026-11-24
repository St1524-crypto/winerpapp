import { describe, expect, it } from "vitest";
import { csvSafeCell, neutralizeCsvText } from "./table-export";
import { readJwtSessionId } from "./revoked-session-middleware";

describe("CSV formula neutralization", () => {
  it("prefixes formula-leading text", () => {
    expect(neutralizeCsvText("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(neutralizeCsvText("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvSafeCell('+1"x')).toBe('"\'+1""x"');
  });
  it("keeps numbers and normal names", () => {
    expect(neutralizeCsvText(-100)).toBe("-100");
    expect(neutralizeCsvText("王小美")).toBe("王小美");
  });
});

describe("revoked session id", () => {
  it("reads session_id from token payload", () => {
    const payload = btoa(JSON.stringify({ session_id: "11111111-1111-1111-1111-111111111111" }));
    expect(readJwtSessionId(`a.${payload}.c`)).toBe("11111111-1111-1111-1111-111111111111");
    expect(readJwtSessionId("bad")).toBeNull();
  });
});
