/**
 * Import legacy members from /tmp/members.json into Supabase.
 * - Skips member_nos that already exist in profiles
 * - Creates an auth user with email {member_no}@legacy.winerp.local
 * - Updates profile row with all legacy fields
 * - Phase 2: link referred_by + placement_id via member_no
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing env"); process.exit(1);
}
const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type Row = {
  member_no: string; name: string; member_type: string; idcno: string;
  apply_date: string; rank: string; referrer_no: string; placement_no: string;
  nation: string; sex: string; zip2: string; addr2: string; tel: string;
  mtel: string; zip1: string; addr1: string; frozen: string;
};

const members: Row[] = JSON.parse(fs.readFileSync("/tmp/members.json", "utf-8"));
console.log(`Loaded ${members.length} members`);

function parseDate(s: string): string | null {
  if (!s) return null;
  // 2017/11/9 -> 2017-11-09
  const m = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (!m) return null;
  return `${m[1]}-${m[2].padStart(2,"0")}-${m[3].padStart(2,"0")}`;
}
function clean(s: string): string | null {
  const t = (s ?? "").trim();
  return t ? t : null;
}

// Fetch existing member_nos to skip
async function fetchExisting(): Promise<Set<string>> {
  const all = new Set<string>();
  let from = 0; const size = 1000;
  while (true) {
    const { data, error } = await admin.from("profiles")
      .select("member_no").range(from, from + size - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    data.forEach(r => r.member_no && all.add(r.member_no));
    if (data.length < size) break;
    from += size;
  }
  return all;
}

async function phase1() {
  const existing = await fetchExisting();
  console.log(`Existing member_nos in DB: ${existing.size}`);
  const todo = members.filter(m => m.member_no && !existing.has(m.member_no));
  console.log(`To create: ${todo.length}`);

  let ok = 0, fail = 0;
  for (let i = 0; i < todo.length; i++) {
    const m = todo[i];
    const email = `${m.member_no.toLowerCase()}@legacy.winerp.local`;
    const phone = clean(m.mtel);
    try {
      const { data: created, error } = await admin.auth.admin.createUser({
        email, password: `Legacy@${m.member_no}`, email_confirm: true,
        user_metadata: { name: m.name || m.member_no, source: "legacy_import" },
      });
      if (error) throw error;
      const uid = created.user!.id;

      const update: Record<string, any> = {
        name: m.name || m.member_no,
        member_no: m.member_no,
        phone, // unique constraint — null if blank
        id_no: clean(m.idcno),
        legacy_rank: clean(m.rank),
        nation: clean(m.nation),
        sex: clean(m.sex),
        zip_mail: clean(m.zip2),
        addr_mail: clean(m.addr2),
        zip_home: clean(m.zip1),
        addr_home: clean(m.addr1),
        tel: clean(m.tel),
        apply_date: parseDate(m.apply_date),
        frozen_code: clean(m.frozen),
        member_status: clean(m.member_type),
      };
      // If phone already exists in DB, drop it to avoid unique conflict
      if (phone) {
        const { data: dup } = await admin.from("profiles")
          .select("id").eq("phone", phone).neq("id", uid).maybeSingle();
        if (dup) update.phone = null;
      }
      const { error: upErr } = await admin.from("profiles").update(update).eq("id", uid);
      if (upErr) throw upErr;
      ok++;
    } catch (e: any) {
      fail++;
      if (fail < 20) console.warn(`✗ ${m.member_no}: ${e.message ?? e}`);
    }
    if ((i+1) % 100 === 0) console.log(`  [${i+1}/${todo.length}] ok=${ok} fail=${fail}`);
  }
  console.log(`Phase 1 done. ok=${ok} fail=${fail}`);
}

async function phase2() {
  console.log("Phase 2: linking referrer + placement");
  // Build member_no -> id map
  const map = new Map<string, string>();
  let from = 0; const size = 1000;
  while (true) {
    const { data, error } = await admin.from("profiles")
      .select("id, member_no").not("member_no", "is", null).range(from, from + size - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    data.forEach((r: any) => map.set(r.member_no, r.id));
    if (data.length < size) break;
    from += size;
  }
  console.log(`Total profiles with member_no: ${map.size}`);

  let ok = 0, skipR = 0, skipP = 0;
  for (let i = 0; i < members.length; i++) {
    const m = members[i];
    const myId = map.get(m.member_no);
    if (!myId) continue;
    const refId = m.referrer_no && m.referrer_no !== "ZZZZZZZZ" ? map.get(m.referrer_no) : null;
    const placeId = m.placement_no && m.placement_no !== "ZZZZZZZZ" ? map.get(m.placement_no) : null;
    if (!refId && !placeId) continue;
    if (m.referrer_no && m.referrer_no !== "ZZZZZZZZ" && !refId) skipR++;
    if (m.placement_no && m.placement_no !== "ZZZZZZZZ" && !placeId) skipP++;
    const patch: any = {};
    if (refId && refId !== myId) patch.referred_by = refId;
    if (placeId && placeId !== myId) patch.placement_id = placeId;
    if (Object.keys(patch).length === 0) continue;
    const { error } = await admin.from("profiles").update(patch).eq("id", myId);
    if (!error) ok++;
    if ((i+1) % 500 === 0) console.log(`  [${i+1}/${members.length}] linked=${ok}`);
  }
  console.log(`Phase 2 done. linked=${ok} missing_ref=${skipR} missing_place=${skipP}`);
}

(async () => {
  await phase1();
  await phase2();
  console.log("All done.");
})().catch(e => { console.error(e); process.exit(1); });
