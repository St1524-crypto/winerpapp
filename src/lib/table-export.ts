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
