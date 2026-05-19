/**
 * Seed demo data + demo users into Supabase.
 *
 * Usage (locally):
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... bun scripts/seed.ts
 *
 * Re-runnable: users are created idempotently (existing emails reused),
 * SQL upserts use ON CONFLICT so re-runs are safe.
 *
 * Creates 3 demo accounts (password = demo1234):
 *   admin@demo.local   → super_admin
 *   sales@demo.local   → sales
 *   finance@demo.local → finance
 *
 * + 1 demo company, attaches all 3 users as company_members,
 * + sample categories / products / customers.
 */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env var.");
  process.exit(1);
}

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const DEMO_USERS = [
  { email: "admin@demo.local",   name: "Demo Admin",   role: "super_admin" as const },
  { email: "sales@demo.local",   name: "Demo Sales",   role: "sales"       as const },
  { email: "finance@demo.local", name: "Demo Finance", role: "finance"     as const },
];

const PASSWORD = "demo1234";
const COMPANY_NAME = "Demo Company 源晶測試";

async function ensureUser(email: string, name: string) {
  // Find existing
  const { data: list, error: listErr } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listErr) throw listErr;
  const existing = list.users.find((u) => u.email === email);
  if (existing) return existing.id;

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { name },
  });
  if (error) throw error;
  return data.user!.id;
}

async function upsertRole(userId: string, role: string) {
  const { error } = await admin
    .from("user_roles")
    .upsert({ user_id: userId, role }, { onConflict: "user_id,role" });
  if (error) throw error;
}

async function ensureCompany() {
  const { data: existing } = await admin
    .from("companies").select("id").eq("company_name", COMPANY_NAME).maybeSingle();
  if (existing?.id) return existing.id;

  const { data, error } = await admin
    .from("companies")
    .insert({ company_name: COMPANY_NAME, status: "active", email: "demo@demo.local" })
    .select("id").single();
  if (error) throw error;
  return data.id;
}

async function ensureMember(companyId: string, userId: string, role: string) {
  const { error } = await admin
    .from("company_members")
    .upsert({ company_id: companyId, user_id: userId, role }, { onConflict: "company_id,user_id" });
  if (error) throw error;
}

async function setCurrentCompany(userId: string, companyId: string) {
  const { error } = await admin
    .from("profiles")
    .update({ current_company_id: companyId })
    .eq("id", userId);
  if (error) console.warn("[seed] profile update warning:", error.message);
}

async function seedCatalog(companyId: string) {
  // Categories
  const cats = [
    { name: "Demo 主分類 A", sort_order: 1 },
    { name: "Demo 主分類 B", sort_order: 2 },
  ];
  for (const c of cats) {
    const { data: existing } = await admin.from("categories").select("id").eq("name", c.name).maybeSingle();
    if (!existing) {
      const { error } = await admin.from("categories").insert(c);
      if (error) console.warn("[seed] category warning:", error.message);
    }
  }
  // Customer
  const { data: cust } = await admin.from("customers").select("id").eq("name", "示範客戶").maybeSingle();
  if (!cust) {
    const { error } = await admin.from("customers").insert({
      name: "示範客戶", email: "client@demo.local", phone: "0900-000-000",
      company: "Demo Client Co.", company_id: companyId,
    });
    if (error) console.warn("[seed] customer warning:", error.message);
  }
}

async function main() {
  console.log("→ Seeding demo users…");
  const users: Record<string, string> = {};
  for (const u of DEMO_USERS) {
    const id = await ensureUser(u.email, u.name);
    users[u.email] = id;
    await upsertRole(id, u.role);
    console.log(`  ✓ ${u.email}  [${u.role}]  ${id}`);
  }

  console.log("→ Seeding demo company…");
  const companyId = await ensureCompany();
  console.log(`  ✓ ${COMPANY_NAME}  ${companyId}`);

  console.log("→ Linking members + default company…");
  for (const u of DEMO_USERS) {
    const uid = users[u.email];
    await ensureMember(companyId, uid, u.role === "super_admin" ? "admin" : "member");
    await setCurrentCompany(uid, companyId);
  }

  console.log("→ Seeding catalog…");
  await seedCatalog(companyId);

  console.log("\n✅ Seed complete. Login with any of:");
  for (const u of DEMO_USERS) console.log(`   ${u.email} / ${PASSWORD}`);
}

main().catch((e) => { console.error("Seed failed:", e); process.exit(1); });
