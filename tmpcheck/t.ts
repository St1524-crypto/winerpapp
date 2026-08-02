import { aggregateMerged, MONTHLY_COLUMN_MAP, MONTHLY_TEMPLATE_COLUMNS, buildMonthlyGrandSummaryTable } from "/dev-server/src/lib/bonus-report-shared";
import { buildExportFileName } from "/dev-server/src/lib/table-export";
import * as XLSX from "xlsx";
import { writeFileSync } from "fs";

const rows: any[] = [
  { id:"1", member_id:"m1", bonus_type:"repurchase", status:"released", bonus_points:100 },
  { id:"2", member_id:"m1", bonus_type:"referral", status:"waiting_release", bonus_points:800 },
  { id:"3", member_id:"m1", bonus_type:"rank_diff_rebate", status:"released", bonus_points:340 },
  { id:"4", member_id:"m2", bonus_type:"national_share", status:"waiting_release", bonus_points:45 },
  { id:"5", member_id:"m2", bonus_type:"business_bonus", status:"released", bonus_points:1498 },
  { id:"6", member_id:"m2", bonus_type:"monthly_vip", status:"cancelled", bonus_points:0 },
];
const members = { m1:{id:"m1",member_no:"TW17H00003",name:"光禾館國際"}, m2:{id:"m2",member_no:"TW17I00072",name:"劉碧玲"} };
const agg = aggregateMerged(rows, members as any, MONTHLY_COLUMN_MAP, MONTHLY_TEMPLATE_COLUMNS);
const { header, body } = buildMonthlyGrandSummaryTable(agg);
console.log("HEADER:", header.join(" | "));
body.forEach(r => console.log(r.join(" | ")));
console.log("FILENAME:", buildExportFileName("月獎金總表","2026-07-01","2026-07-31","month"));

// empty case
const empty = buildMonthlyGrandSummaryTable(aggregateMerged([], {}, MONTHLY_COLUMN_MAP, MONTHLY_TEMPLATE_COLUMNS));
console.log("EMPTY rows:", empty.body.length, "header cols:", empty.header.length);

// csv encoding + xlsx open
const csv = "\uFEFF" + [header, ...body].map(r=>r.map(x=>`"${String(x??"")}"`).join(",")).join("\n");
writeFileSync("/tmp/exp/out.csv", csv);
const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "月獎金總表");
XLSX.writeFile(wb, "/tmp/exp/out.xlsx");
const back = XLSX.readFile("/tmp/exp/out.xlsx");
console.log("XLSX sheet:", back.SheetNames, "A1:", (back.Sheets["月獎金總表"] as any)["A1"].v, "C1:", (back.Sheets["月獎金總表"] as any)["C1"].v);
