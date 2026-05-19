/**
 * RLS smoke test: signs in as each demo user (created by scripts/seed.ts)
 * and verifies that critical tables return data / enforce restrictions
 * as expected.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_PUBLISHABLE_KEY=... bun scripts/rls-check.ts
 *
 * Exit code != 0 if any expectation fails — wire into CI to catch RLS regressions.
 */
import { createClient } from "@supabase/supabase-js";

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;
if (!URL || !KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY env var.");
  process.exit(1);
}

const PASSWORD = "demo1234";
type Expect = "rows" | "empty" | "deny";

const SUITES: { email: string; checks: { table: string; expect: Expect; note?: string }[] }[] = [
  {
    email: "admin@demo.local",
    checks: [
      { table: "companies",       expect: "rows" },
      { table: "company_members", expect: "rows" },
      { table: "user_roles",      expect: "rows" },
      { table: "categories",      expect: "rows" },
      { table: "customers",       expect: "rows" },
      { table: "audit_logs",      expect: "rows", note: "admin & finance can read" },
    ],
  },
  {
    email: "sales@demo.local",
    checks: [
      { table: "companies",  expect: "rows" },
      { table: "customers",  expect: "rows" },
      { table: "categories", expect: "rows" },
      { table: "bank_accounts", expect: "rows", note: "sales has view access" },
    ],
  },
  {
    email: "finance@demo.local",
    checks: [
      { table: "companies",     expect: "rows" },
      { table: "bank_accounts", expect: "rows" },
      { table: "audit_logs",    expect: "rows" },
      { table: "accounts_payable", expect: "empty", note: "no demo rows yet, but should not deny" },
    ],
  },
];

let failures = 0;

async function run() {
  for (const suite of SUITES) {
    console.log(`\n— ${suite.email} —`);
    const client = createClient(URL!, KEY!, { auth: { persistSession: false } });
    const { error: signErr } = await client.auth.signInWithPassword({ email: suite.email, password: PASSWORD });
    if (signErr) {
      console.error(`  ✗ sign-in failed: ${signErr.message}`);
      failures++;
      continue;
    }
    for (const c of suite.checks) {
      const { data, error } = await client.from(c.table).select("*").limit(5);
      const denied = !!error && /permission|policy|denied/i.test(error.message);
      const rowCount = data?.length ?? 0;
      let ok = false;
      if (c.expect === "rows")  ok = !error && rowCount > 0;
      if (c.expect === "empty") ok = !error;
      if (c.expect === "deny")  ok = denied;
      const tag = ok ? "✓" : "✗";
      const detail = error ? `error="${error.message}"` : `rows=${rowCount}`;
      console.log(`  ${tag} ${c.table.padEnd(22)} expect=${c.expect.padEnd(5)} ${detail}${c.note ? "  // " + c.note : ""}`);
      if (!ok) failures++;
    }
    await client.auth.signOut();
  }
  console.log(`\nResult: ${failures === 0 ? "✅ all checks passed" : `❌ ${failures} failure(s)`}`);
  if (failures) process.exit(1);
}

run().catch((e) => { console.error(e); process.exit(1); });
