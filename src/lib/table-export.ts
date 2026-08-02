export type ExportFormat = "csv" | "xlsx";

type Cell = string | number | null | undefined;

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportCsvFile(header: string[], rows: Cell[][], baseName: string) {
  const escape = (x: Cell) => `"${String(x ?? "").replace(/"/g, '""')}"`;
  const content = [header.map(escape).join(","), ...rows.map((r) => r.map(escape).join(","))].join("\n");
  download(new Blob(["\uFEFF" + content], { type: "text/csv;charset=utf-8" }), `${baseName}.csv`);
}

export async function exportXlsxFile(
  header: string[],
  rows: Cell[][],
  baseName: string,
  sheetName = "Sheet1",
) {
  const XLSX = await import("xlsx");
  const sheet = XLSX.utils.aoa_to_sheet([header, ...rows.map((r) => r.map((x) => x ?? ""))]);
  sheet["!cols"] = header.map((h, i) => ({
    wch: Math.min(
      40,
      Math.max(10, ...[h, ...rows.map((r) => String(r[i] ?? ""))].map((v) => String(v).length + 2)),
    ),
  }));
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, sheetName.slice(0, 31));
  const buffer = XLSX.write(book, { bookType: "xlsx", type: "array" });
  download(
    new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `${baseName}.xlsx`,
  );
}

export async function exportTable(
  format: ExportFormat,
  header: string[],
  rows: Cell[][],
  baseName: string,
  sheetName?: string,
) {
  if (format === "csv") exportCsvFile(header, rows, baseName);
  else await exportXlsxFile(header, rows, baseName, sheetName);
}

/** 產出含日期範圍與匯出時間（台灣時間）的檔名，例如：日獎金明細_20260717-20260718_匯出20260802-1630 */
export function buildExportFileName(
  prefix: string,
  dateFrom?: string,
  dateTo?: string,
  mode: "date" | "month" = "date",
) {
  const clean = (v?: string) => (v ? String(v).slice(0, 10) : "");
  const from = clean(dateFrom);
  const to = clean(dateTo);
  const fmt = (v: string) => (mode === "month" ? v.slice(0, 7) : v).replace(/-/g, "");
  let range = "";
  if (from && to) range = fmt(from) === fmt(to) ? fmt(from) : `${fmt(from)}-${fmt(to)}`;
  else if (from) range = `${fmt(from)}起`;
  else if (to) range = `至${fmt(to)}`;
  else range = "全部期間";

  const tw = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
  const stamp = `${tw.slice(0, 10).replace(/-/g, "")}-${tw.slice(11, 16).replace(":", "")}`;
  return `${prefix}_${range}_匯出${stamp}`;
}
