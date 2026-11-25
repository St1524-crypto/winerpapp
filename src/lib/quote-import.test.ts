import { describe, expect, it } from "vitest";
import { countQuoteImports, withQuoteSource, quoteSourceSearchPattern } from "./quote-import";

describe("repeated quote imports", () => {
  it("counts two previously created orders for the same quote", () => {
    expect(countQuoteImports([
      { notes: "來源報價單：Q001" },
      { notes: "客戶備註\n來源報價單：Q001" },
      { notes: "來源報價單：Q0010" },
      { notes: null },
    ], "Q001")).toBe(2);
  });
  it("counts an order once even when its source marker is duplicated", () => {
    expect(countQuoteImports([{ notes: "來源報價單：Q001\n來源報價單：Q001" }], "Q001")).toBe(1);
  });
  it("returns zero for a quote with no previous orders", () => {
    expect(countQuoteImports([{ notes: "來源報價單：Q002" }], "Q001")).toBe(0);
  });
  it("preserves ordinary notes but tracks only the latest imported quote", () => {
    expect(withQuoteSource("客戶備註\n來源報價單：Q001", "Q002")).toBe("客戶備註\n來源報價單：Q002");
    expect(withQuoteSource("來源報價單：Q001", "Q001")).toBe("來源報價單：Q001");
  });
  it("escapes wildcard characters when looking up source records", () => {
    expect(quoteSourceSearchPattern("Q_01%" )).toBe("%來源報價單：Q\\_01\\%%");
  });
});