/**
 * 依名冊覆蓋會員貢獻點（member_points_wallet.reward_points）
 * 用法：bun scripts/import_reward_pointss.ts <pairs.json> [--apply]
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const sb = createClient(url, key, { auth: { persistSession: false } });

const file = process.argv[2];
const apply = process.argv.includes("--apply");
const pairs: [string, string][] = JSON.parse(await Bun.file(file).text());

const map = new Map<string, number>();
for (const [no, amt] of pairs) map.set(no, Number(String(amt).replace(/,/g, "")));

const nos = [...map.keys()];
const idByNo = new Map<string, string>();
for (let i = 0; i < nos.length; i += 200) {
  const { data, error } = await sb
    .from("profiles")
    .select("id, member_no")
    .in("member_no", nos.slice(i, i + 200));
  if (error) throw error;
  for (const p of data ?? []) idByNo.set(p.member_no as string, p.id as string);
}

const missing = nos.filter((n) => !idByNo.has(n));
console.log(`名冊 ${nos.length} 筆，比對成功 ${idByNo.size} 筆，找不到 ${missing.length} 筆`);
if (missing.length) console.log("找不到：", missing.join(", "));

if (!apply) {
  console.log("dry-run，未寫入。加 --apply 執行。");
  process.exit(0);
}

const rows = [...idByNo.entries()].map(([no, id]) => ({
  user_id: id,
  reward_points: map.get(no)!,
  updated_at: new Date().toISOString(),
}));

let done = 0;
for (let i = 0; i < rows.length; i += 200) {
  const chunk = rows.slice(i, i + 200);
  const { error } = await sb.from("member_points_wallet").upsert(chunk, { onConflict: "user_id" });
  if (error) throw error;
  done += chunk.length;
}
console.log(`已覆蓋 ${done} 位會員的貢獻點`);
