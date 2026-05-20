import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for 公司管理 E2E tests.
 *
 * 執行前請設定環境變數（可放在 .env.e2e 並用 `bun run test:e2e` 載入）：
 *   E2E_BASE_URL                預設 http://localhost:5173
 *   E2E_SUPER_ADMIN_EMAIL       super_admin 帳號（必填）
 *   E2E_SUPER_ADMIN_PASSWORD    super_admin 密碼（必填）
 *
 * 啟動：
 *   1. 另開 terminal 跑 `bun run dev`
 *   2. `bunx playwright test`
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    locale: "zh-TW",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});
