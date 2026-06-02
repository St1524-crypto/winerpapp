import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import { execSync } from "child_process";

const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type Row = {
  member_no: string; name: string; member_type: string; idcno: string;
  apply_date: string; rank: string; referrer_no: string; placement_no: string;
  nation: string; sex: string; zip2: string; addr2: string; tel: string;
  mtel: string; zip1: string; addr1: string; frozen: string;
};
const members: Row[] = JSON.parse(fs.readFileSync("/tmp/members.json", "utf-8"));

const parseDate = (s: string) => {
  const m = s?.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  return m ? `${m[1]}-${m[2].padStart(2,"0")}-${m[3].padStart(2,"0")}` : null;
};
const clean = (s: string) => { const t = (s ?? "").trim(); return t || null; };

async function fetchExisting(): Promise<Set<string>> {
  const all = new Set<string>();
  let from = 0; const size = 1000;
  while (true) {
    const { data, error } = await admin.from("profiles").select("member_no").range(from, from+size-1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    data.forEach(r => r.member_no && all.add(r.member_no));
    if (data.length < size) break;
    from += size;
  }
  return all;
}

// Track phones used in this run to dedupe in-memory
const usedPhones = new Set<string>();

async function createOne(m: Row): Promise<{ok: boolean; err?: string}> {
  const email = `${m.member_no.toLowerCase()}@legacy.winerp.local`;
  let phone = clean(m.mtel);
  if (phone && usedPhones.has(phone)) phone = null;
  if (phone) usedPhones.add(phone);
  try {
    const { data: created, error } = await admin.auth.admin.createUser({
      email, password: `Legacy@${m.member_no}`, email_confirm: true,
      user_metadata: { name: m.name || m.member_no, source: "legacy_import" },
    });
    if (error) throw error;
    const uid = created.user!.id;
    const update: Record<string, any> = {
      name: m.name || m.member_no, member_no: m.member_no, phone,
      id_no: clean(m.idcno), legacy_rank: clean(m.rank),
      nation: clean(m.nation), sex: clean(m.sex),
      zip_mail: clean(m.zip2), addr_mail: clean(m.addr2),
      zip_home: clean(m.zip1), addr_home: clean(m.addr1),
      tel: clean(m.tel), apply_date: parseDate(m.apply_date),
      frozen_code: clean(m.frozen), member_status: clean(m.member_type),
    };
    let { error: upErr } = await admin.from("profiles").update(update).eq("id", uid);
    if (upErr && /phone/i.test(upErr.message)) {
      update.phone = null;
      ({ error: upErr } = await admin.from("profiles").update(update).eq("id", uid));
    }
    if (upErr) throw upErr;
    return { ok: true };
  } catch (e: any) {
    return { ok: false, err: e.message ?? String(e) };
  }
}

async function phase1() {
  // Seed usedPhones from existing profiles
  const { data: existingPhones } = await admin.from("profiles").select("phone").not("phone","is",null).limit(10000);
  existingPhones?.forEach((r: any) => r.phone && usedPhones.add(r.phone));

  const existing = await fetchExisting();
  const todo = members.filter(m => m.member_no && !existing.has(m.member_no));
  console.log(`Phase1: existing=${existing.size}, todo=${todo.length}`);

  const CONC = 15;
  let ok = 0, fail = 0, idx = 0;
  const errs: string[] = [];
  await Promise.all(Array.from({length: CONC}, async () => {
    while (idx < todo.length) {
      const my = idx++;
      const r = await createOne(todo[my]);
      if (r.ok) ok++; else { fail++; if (errs.length<10) errs.push(`${todo[my].member_no}: ${r.err}`); }
      if ((ok+fail) % 200 === 0) console.log(`  progress ${ok+fail}/${todo.length} ok=${ok} fail=${fail}`);
    }
  }));
  console.log(`Phase1 done. ok=${ok} fail=${fail}`);
  if (errs.length) console.log("sample errors:\n" + errs.join("\n"));
}

async function phase2() {
  console.log("Phase2: bulk link via psql temp table");
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
  console.log(`Loaded ${map.size} member->id mappings`);

  // Build CSV: id, referred_by, placement_id
  const lines = ["id,referred_by,placement_id"];
  let count = 0;
  for (const m of members) {
    const myId = map.get(m.member_no); if (!myId) continue;
    const refId = m.referrer_no && m.referrer_no !== "ZZZZZZZZ" ? map.get(m.referrer_no) : null;
    const placeId = m.placement_no && m.placement_no !== "ZZZZZZZZ" ? map.get(m.placement_no) : null;
    const r = refId && refId !== myId ? refId : "";
    const p = placeId && placeId !== myId ? placeId : "";
    if (!r && !p) continue;
    lines.push(`${myId},${r},${p}`);
    count++;
  }
  fs.writeFileSync("/tmp/link.csv", lines.join("\n"));
  console.log(`Wrote ${count} link rows`);

  // Use psql to bulk update via insert into temp table
  const sql = `
    CREATE TEMP TABLE _link(id uuid, referred_by uuid, placement_id uuid);
    \\copy _link FROM '/tmp/link.csv' WITH CSV HEADER;
    UPDATE public.profiles p SET
      referred_by = COALESCE(NULLIF(l.referred_by::text,'')::uuid, p.referred_by),
      placement_id = COALESCE(NULLIF(l.placement_id::text,'')::uuid, p.placement_id)
    FROM _link l WHERE p.id = l.id;
  `;
  fs.writeFileSync("/tmp/link.sql", sql);
  const out = execSync(`psql -v ON_ERROR_STOP=1 -f /tmp/link.sql`, { encoding: "utf-8" });
  console.log(out);
}

(async () => {
  await phase1();
  await phase2();
  const { count: total } = await admin.from("profiles").select("*", { count: "exact", head: true });
  const { count: rcount } = await admin.from("profiles").select("*", { count: "exact", head: true }).not("referred_by","is",null);
  const { count: pcount } = await admin.from("profiles").select("*", { count: "exact", head: true }).not("placement_id","is",null);
  console.log(`Final: profiles=${total} referred=${rcount} placement=${pcount}`);
})().catch(e => { console.error(e); process.exit(1); });
