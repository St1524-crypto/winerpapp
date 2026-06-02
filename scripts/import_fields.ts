import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const lines = fs.readFileSync("/tmp/fields.csv", "utf-8").trim().split("\n");
const header = lines.shift()!.split(",");
type Row = Record<string, string>;
const rows: Row[] = lines.map((l) => {
  // simple CSV parse (no quoted commas in our data)
  const cols = l.split(",");
  const r: Row = {};
  header.forEach((h, i) => (r[h] = cols[i] ?? ""));
  return r;
});
console.log(`Rows: ${rows.length}`);

// Load member_no -> id map
const map = new Map<string, string>();
let from = 0; const size = 1000;
while (true) {
  const { data, error } = await admin.from("profiles").select("id, member_no").not("member_no","is",null).range(from, from+size-1);
  if (error) throw error;
  if (!data || data.length === 0) break;
  data.forEach((r:any) => map.set(r.member_no, r.id));
  if (data.length < size) break;
  from += size;
}
console.log(`Mapped: ${map.size}`);

const tasks = rows.map(r => {
  const id = map.get(r.member_no);
  if (!id) return null;
  const patch: any = {};
  if (r.id_no) patch.id_no = r.id_no;
  if (r.apply_date) patch.apply_date = r.apply_date;
  if (r.sex) patch.sex = r.sex;
  if (r.zip_mail) patch.zip_mail = r.zip_mail;
  if (r.addr_mail) patch.addr_mail = r.addr_mail;
  if (r.zip_home) patch.zip_home = r.zip_home;
  if (r.addr_home) patch.addr_home = r.addr_home;
  if (Object.keys(patch).length === 0) return null;
  return { id, patch };
}).filter(Boolean) as { id: string; patch: any }[];
console.log(`Patches: ${tasks.length}`);

const CONC = 25;
let i = 0, ok = 0, fail = 0;
const errs: string[] = [];
await Promise.all(Array.from({length: CONC}, async () => {
  while (i < tasks.length) {
    const my = i++;
    const { id, patch } = tasks[my];
    const { error } = await admin.from("profiles").update(patch).eq("id", id);
    if (error) { fail++; if (errs.length<5) errs.push(error.message); } else ok++;
    if ((ok+fail) % 500 === 0) console.log(`  ${ok+fail}/${tasks.length}`);
  }
}));
console.log(`Done. ok=${ok} fail=${fail}`);
if (errs.length) console.log(errs);
