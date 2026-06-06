// For each (member_no, phone) in /tmp/skipped.json:
//   - If member already has phone set, skip.
//   - Otherwise try `phone`. If taken, try phone+'01', '02', '03'... until unique. Then UPDATE.
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const skipped: [string, string][] = JSON.parse(fs.readFileSync("/tmp/skipped.json", "utf-8"));
console.log(`Source rows: ${skipped.length}`);

// Load all current phones into a Set for fast collision check
const usedPhones = new Set<string>();
{
  let from = 0; const size = 1000;
  while (true) {
    const { data, error } = await admin.from("profiles").select("phone").not("phone","is",null).range(from, from+size-1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    data.forEach((r:any) => r.phone && usedPhones.add(r.phone));
    if (data.length < size) break;
    from += size;
  }
}
console.log(`Existing distinct phones: ${usedPhones.size}`);

let ok = 0, skip = 0, fail = 0;
const errs: string[] = [];

for (const [memberNo, basePhone] of skipped) {
  // fetch profile
  const { data: prof, error: pe } = await admin
    .from("profiles").select("id, phone").eq("member_no", memberNo).maybeSingle();
  if (pe) { fail++; errs.length<5 && errs.push(`${memberNo}: ${pe.message}`); continue; }
  if (!prof) { fail++; errs.length<5 && errs.push(`${memberNo}: not found`); continue; }
  if (prof.phone) { skip++; continue; }

  // find an unused variant
  let candidate = basePhone;
  if (usedPhones.has(candidate)) {
    let i = 1;
    while (true) {
      const suffix = String(i).padStart(2, "0");
      candidate = basePhone + suffix;
      if (!usedPhones.has(candidate)) break;
      i++;
      if (i > 99) { candidate = ""; break; }
    }
  }
  if (!candidate) { fail++; errs.length<5 && errs.push(`${memberNo}: no available suffix`); continue; }

  const { error: ue } = await admin.from("profiles").update({ phone: candidate }).eq("id", prof.id);
  if (ue) { fail++; errs.length<5 && errs.push(`${memberNo} -> ${candidate}: ${ue.message}`); continue; }
  usedPhones.add(candidate);
  ok++;
  if (ok % 50 === 0) console.log(`  progress ${ok}/${skipped.length}`);
}

console.log(`Done. updated=${ok} already_had_phone=${skip} failed=${fail}`);
if (errs.length) console.log("errors sample:", errs);
