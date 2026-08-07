/**
 * 匯入 gridview 匯出檔中「DB 尚無」的新會員。
 * - 以 member_no 比對，並排除手機號已存在於 DB 的會員（視為已由前台建立）
 * - 建立 auth user（{member_no}@legacy.winerp.local）後回填 profiles
 * - 第二階段連結 referred_by / placement_id
 */
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type Row = Record<string, string>;
const all: Row[] = JSON.parse(fs.readFileSync("/tmp/members.json", "utf-8"));

const RANK_MAP: Record<string, string | null> = {
  "M網路會員": null, "VIP會員": null,
  "S經銷商": "S", "E代理商": "E", "T代理商": "T", "A代理商": "A",
  "一星代理": "V1", "二星代理": "V2", "三星代理": "V3", "四星代理": "V4",
  "五星代理": "V5", "六星代理": "V6", "七星代理": "V7", "董事": "V8",
};

const parseDate = (s: string) => {
  const m = (s ?? "").match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  return m ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : null;
};
const clean = (s: string) => ((s ?? "").trim() || null);

async function loadMap() {
  const map = new Map<string, string>();
  const phones = new Set<string>();
  let from = 0;
  const size = 1000;
  for (;;) {
    const { data, error } = await admin
      .from("profiles").select("id, member_no, phone").range(from, from + size - 1);
    if (error) throw error;
    if (!data?.length) break;
    for (const r of data as any[]) {
      if (r.member_no) map.set(r.member_no, r.id);
      if (r.phone) phones.add(r.phone);
    }
    if (data.length < size) break;
    from += size;
  }
  return { map, phones };
}

(async () => {
  const { map, phones } = await loadMap();
  const todo = all.filter((m) => m.member_no && !map.has(m.member_no) && !(m.mtel && phones.has(m.mtel)));
  console.log(`file=${all.length} db=${map.size} toCreate=${todo.length}`);
  console.log(todo.map((m) => `${m.member_no} ${m.name} ${m.rank}`).join("\n"));

  for (const m of todo) {
    const email = `${m.member_no.toLowerCase()}@legacy.winerp.local`;
    try {
      const { data: created, error } = await admin.auth.admin.createUser({
        email, password: `Legacy@${m.member_no}`, email_confirm: true,
        user_metadata: { name: m.name || m.member_no, source: "legacy_import_202608" },
      });
      if (error) throw error;
      const uid = created.user!.id;
      const tier = RANK_MAP[m.rank] ?? null;
      const phone = m.mtel && !phones.has(m.mtel) ? m.mtel : null;
      const patch: Record<string, any> = {
        name: m.name || m.member_no,
        member_no: m.member_no,
        phone,
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
        is_dealer: !!tier,
      };
      const { error: upErr } = await admin.from("profiles").update(patch).eq("id", uid);
      if (upErr) throw upErr;
      if (tier) {
        await admin.from("dealer_tier_status")
          .upsert({ user_id: uid, current_tier: tier, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
      }
      if (phone) phones.add(phone);
      map.set(m.member_no, uid);
      console.log(`✓ ${m.member_no} ${m.name}`);
    } catch (e: any) {
      console.warn(`✗ ${m.member_no}: ${e.message ?? e}`);
    }
  }

  // Phase 2: link referrer / placement
  let linked = 0;
  for (const m of todo) {
    const myId = map.get(m.member_no);
    if (!myId) continue;
    const patch: Record<string, any> = {};
    const ref = m.referrer_no && m.referrer_no !== "ZZZZZZZZ" ? map.get(m.referrer_no) : null;
    const place = m.placement_no && m.placement_no !== "ZZZZZZZZ" ? map.get(m.placement_no) : null;
    if (ref && ref !== myId) patch.referred_by = ref;
    if (place && place !== myId) patch.placement_id = place;
    if (!Object.keys(patch).length) continue;
    const { error } = await admin.from("profiles").update(patch).eq("id", myId);
    if (!error) linked++;
    else console.warn(`link ✗ ${m.member_no}: ${error.message}`);
  }
  console.log(`linked=${linked}`);
})();
