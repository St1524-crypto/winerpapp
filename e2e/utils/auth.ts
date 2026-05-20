import { Page, expect } from "@playwright/test";

export async function loginAsSuperAdmin(page: Page) {
  const email = process.env.E2E_SUPER_ADMIN_EMAIL;
  const password = process.env.E2E_SUPER_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error(
      "請設定 E2E_SUPER_ADMIN_EMAIL / E2E_SUPER_ADMIN_PASSWORD 環境變數",
    );
  }

  await page.goto("/login");
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/密碼|password/i).first().fill(password);
  await page.getByRole("button", { name: /登入|sign in/i }).click();

  // 等待跳轉離開 /login
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
    timeout: 20_000,
  });
}

export async function gotoCompanies(page: Page) {
  await page.goto("/admin/companies");
  await expect(page.getByRole("heading", { name: "公司管理" })).toBeVisible();
}
