import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const entries: [string,string][] = JSON.parse(fs.readFileSync("/tmp/ranks.json","utf-8"));
const MAP: Record<string,string|null> = {
  "M網路會員": null, "VIP會員": null,
  "S經銷商":"S","E代理商":"E","T代理商":"T","A代理商":"A",
  "一星代理":"V1","二星代理":"V2","三星代理":"V3","四星代理":"V4","五星代理":"V5",
  "六星代理":"V6","七星代理":"V7","董事":"V8",
};

// Load member_no -> id mapping
const idMap = new Map<string,string>();
let from = 0; const size = 1000;
while (true) {
  const { data, error } = await admin.from("profiles").select("id, member_no").not("member_no","is",null).range(from, from+size-1);
  if (error) throw error;
  if (!data || data.length === 0) break;
  data.forEach((r:any) => idMap.set(r.member_no, r.id));
  if (data.length < size) break;
  from += size;
}
console.log("Profiles loaded:", idMap.size);

const tierUpserts: any[] = [];
const profilePatches: {id: string; legacy_rank: string; is_dealer: boolean}[] = [];
let missing = 0;
for (const [no, rank] of entries) {
  const id = idMap.get(no);
  if (!id) { missing++; continue; }
  const tier = MAP[rank];
  profilePatches.push({ id, legacy_rank: rank, is_dealer: !!tier });
  if (tier) tierUpserts.push({ user_id: id, current_tier: tier, updated_at: new Date().toISOString() });
}
console.log(`Missing profiles: ${missing}, profile patches: ${profilePatches.length}, tier upserts: ${tierUpserts.length}`);

// Bulk update profiles in parallel
const CONC = 25;
let i = 0, ok = 0, fail = 0;
const errs: string[] = [];
await Promise.all(Array.from({length: CONC}, async () => {
  while (i < profilePatches.length) {
    const my = i++;
    const { id, ...patch } = profilePatches[my];
    const { error } = await admin.from("profiles").update(patch).eq("id", id);
    if (error) { fail++; if (errs.length<5) errs.push(error.message); } else ok++;
    if ((ok+fail) % 500 === 0) console.log(`  profile ${ok+fail}/${profilePatches.length}`);
  }
}));
console.log(`Profiles updated: ok=${ok} fail=${fail}`);
if (errs.length) console.log("profile errs:", errs);

// Upsert dealer_tier_status in batches
for (let b = 0; b < tierUpserts.length; b += 500) {
  const batch = tierUpserts.slice(b, b+500);
  const { error } = await admin.from("dealer_tier_status").upsert(batch, { onConflict: "user_id" });
  if (error) console.log("tier batch error:", error.message);
  else console.log(`  tier upserted ${Math.min(b+500, tierUpserts.length)}/${tierUpserts.length}`);
}
console.log("Done.");
