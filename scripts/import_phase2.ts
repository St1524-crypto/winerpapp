import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type Row = { member_no: string; referrer_no: string; placement_no: string };
const members: Row[] = JSON.parse(fs.readFileSync("/tmp/members.json", "utf-8"));

(async () => {
  const map = new Map<string,string>();
  let from = 0; const size = 1000;
  while (true) {
    const { data, error } = await admin.from("profiles").select("id, member_no").not("member_no","is",null).range(from, from+size-1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    data.forEach((r:any) => map.set(r.member_no, r.id));
    if (data.length < size) break;
    from += size;
  }
  console.log(`Mappings: ${map.size}`);

  type Patch = { id: string; referred_by?: string|null; placement_id?: string|null };
  const patches: Patch[] = [];
  for (const m of members) {
    const myId = map.get(m.member_no); if (!myId) continue;
    const refId = m.referrer_no && m.referrer_no !== "ZZZZZZZZ" ? map.get(m.referrer_no) : null;
    const placeId = m.placement_no && m.placement_no !== "ZZZZZZZZ" ? map.get(m.placement_no) : null;
    const p: Patch = { id: myId };
    if (refId && refId !== myId) p.referred_by = refId;
    if (placeId && placeId !== myId) p.placement_id = placeId;
    if (p.referred_by || p.placement_id) patches.push(p);
  }
  console.log(`Patches to apply: ${patches.length}`);

  const CONC = 20;
  let i = 0, ok = 0, fail = 0;
  const errs: string[] = [];
  await Promise.all(Array.from({length: CONC}, async () => {
    while (i < patches.length) {
      const my = i++;
      const { id, ...patch } = patches[my];
      const { error } = await admin.from("profiles").update(patch).eq("id", id);
      if (error) { fail++; if (errs.length<5) errs.push(error.message); } else ok++;
      if ((ok+fail) % 500 === 0) console.log(`  ${ok+fail}/${patches.length}`);
    }
  }));
  console.log(`Done. ok=${ok} fail=${fail}`);
  if (errs.length) console.log(errs);

  const { count: rcount } = await admin.from("profiles").select("*", { count: "exact", head: true }).not("referred_by","is",null);
  const { count: pcount } = await admin.from("profiles").select("*", { count: "exact", head: true }).not("placement_id","is",null);
  console.log(`referred_by=${rcount} placement_id=${pcount}`);
})();
