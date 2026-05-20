import { createClient } from "@supabase/supabase-js";

/**
 * E2E global teardown：移除所有 E2E-* 開頭的公司、相關子資料與 storage 上殘留的 logo。
 *
 * 需要 service role key（繞過 RLS）。建議放在 .env.e2e：
 *   SUPABASE_URL=...
 *   SUPABASE_SERVICE_ROLE_KEY=...
 *
 * 若未設定，會印 warning 並 skip（不讓測試 fail）。
 */
export default async function globalTeardown() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    console.warn(
      "[e2e teardown] 跳過：未設定 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY，無法清除測試資料。",
    );
    return;
  }

  const supa = createClient(url, key, { auth: { persistSession: false } });

  // 1) 找出所有 E2E-* 公司
  const { data: companies, error: cErr } = await supa
    .from("companies")
    .select("id, company_name, logo_url")
    .like("company_name", "E2E-%");

  if (cErr) {
    console.error("[e2e teardown] 列出公司失敗：", cErr.message);
    return;
  }
  if (!companies?.length) {
    console.log("[e2e teardown] 沒有 E2E-* 公司可清除。");
    return;
  }

  const ids = companies.map((c) => c.id);
  console.log(`[e2e teardown] 將清除 ${ids.length} 筆公司：`, companies.map((c) => c.company_name));

  // 2) 刪除子資料（tenant-scoped tables）
  const childTables = [
    "company_members",
    "inventory_logs",
    "inventory_transactions",
    "customers",
    "payments",
  ];
  for (const table of childTables) {
    const { error } = await supa.from(table).delete().in("company_id", ids);
    if (error) console.warn(`[e2e teardown] 刪 ${table} 失敗：`, error.message);
  }

  // 3) 清除 storage 上的 logo（branding/companies/...）
  const logoPaths = companies
    .map((c) => c.logo_url)
    .filter((u): u is string => !!u)
    .map((u) => {
      const idx = u.indexOf("/branding/");
      return idx >= 0 ? u.slice(idx + "/branding/".length).split("?")[0] : null;
    })
    .filter((p): p is string => !!p);

  if (logoPaths.length) {
    const { error: sErr } = await supa.storage.from("branding").remove(logoPaths);
    if (sErr) console.warn("[e2e teardown] 刪 logo 失敗：", sErr.message);
    else console.log(`[e2e teardown] 已刪除 ${logoPaths.length} 個 logo 檔。`);
  }

  // 4) 最後刪公司本體
  const { error: delErr } = await supa.from("companies").delete().in("id", ids);
  if (delErr) console.error("[e2e teardown] 刪公司失敗：", delErr.message);
  else console.log(`[e2e teardown] 已刪除 ${ids.length} 家 E2E 公司。`);

  // 5) 順手清掉 E2E 留下的 audit log（company.switch / company.update 等）
  const { error: aErr } = await supa
    .from("audit_logs")
    .delete()
    .in("entity_id", ids)
    .eq("entity", "companies");
  if (aErr) console.warn("[e2e teardown] 刪 audit_logs 失敗（可忽略）：", aErr.message);
}
