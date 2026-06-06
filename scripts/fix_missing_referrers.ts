import { createClient } from "@supabase/supabase-js";
import fs from "fs";
const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const refs: {member_no:string; referrer_no:string}[] = JSON.parse(fs.readFileSync("/tmp/refs.json","utf-8"));

// Find profiles missing referred_by
const { data: missing } = await admin.from("profiles")
  .select("id, member_no").is("referred_by", null).not("member_no","is",null);
console.log("missing referred_by:", missing?.length);

// Build member_no -> id map (all)
const map = new Map<string,string>();
let from=0; const size=1000;
while (true) {
  const { data } = await admin.from("profiles").select("id, member_no").not("member_no","is",null).range(from, from+size-1);
  if (!data || data.length===0) break;
  data.forEach((r:any)=>map.set(r.member_no, r.id));
  if (data.length<size) break;
  from+=size;
}

const refMap = new Map(refs.map(r=>[r.member_no, r.referrer_no]));
let ok=0, root=0, noFileEntry=0, refMissing=0, fail=0;
const errs:string[]=[];
const unresolved:any[]=[];

for (const m of missing ?? []) {
  const fileRef = refMap.get(m.member_no);
  if (fileRef === undefined) { noFileEntry++; unresolved.push({...m, reason:"not in file"}); continue; }
  if (!fileRef || fileRef === "ZZZZZZZZ") { root++; unresolved.push({...m, reason:"root (ZZZZZZZZ)"}); continue; }
  const refId = map.get(fileRef);
  if (!refId) { refMissing++; unresolved.push({...m, reason:`referrer ${fileRef} not in db`}); continue; }
  if (refId === m.id) { fail++; continue; }
  const { error } = await admin.from("profiles").update({ referred_by: refId }).eq("id", m.id);
  if (error) { fail++; errs.length<5 && errs.push(`${m.member_no}: ${error.message}`); }
  else ok++;
}
console.log({ ok, root, noFileEntry, refMissing, fail });
if (errs.length) console.log(errs);
console.log("unresolved sample:", unresolved.slice(0,20));
