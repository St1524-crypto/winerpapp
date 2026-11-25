const SOURCE_PREFIX = "來源報價單：";

export function countQuoteImports(orders: Array<{ notes: string | null }>, quoteNo: string): number {
  const marker = `${SOURCE_PREFIX}${quoteNo}`;
  return orders.filter((order) => order.notes?.split(/\r?\n/).some((line) => line.trim() === marker)).length;
}

export function withQuoteSource(notes: string, quoteNo: string): string {
  const remaining = notes.split(/\r?\n/).filter((line) => !line.trim().startsWith(SOURCE_PREFIX));
  return [...remaining.filter((line) => line.trim()), `${SOURCE_PREFIX}${quoteNo}`].join("\n");
}

export function quoteSourceSearchPattern(quoteNo: string): string {
  return `%${SOURCE_PREFIX}${quoteNo.replace(/[\\%_]/g, "\\$&")}%`;
}