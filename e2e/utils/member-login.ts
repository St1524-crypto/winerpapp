import { Page, expect } from "@playwright/test";

/**
 * 以「會員模式」登入（行動電話 / 會員編號 + 密碼）
 */
export async function loginAsMember(
  page: Page,
  identifier: string,
  password: string,
) {
  await page.goto("/login");

  // 切到「會員登入」分頁（預設可能就是會員模式，找得到就點）
  const memberTab = page.getByRole("tab", { name: /會員登入|會員/ }).first();
  if (await memberTab.isVisible().catch(() => false)) {
    await memberTab.click();
  }

  await page.getByLabel(/行動電話|會員編號|會員ID/).first().fill(identifier);
  await page.getByLabel(/密碼/).first().fill(password);
  await page.getByRole("button", { name: /^登入$/ }).click();

  await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
    timeout: 20_000,
  });
}

/**
 * 以「管理員模式」登入（Email + 密碼）— super_admin / admin
 */
export async function loginAsAdminEmail(
  page: Page,
  email: string,
  password: string,
) {
  await page.goto("/login");
  const adminLink = page.getByRole("link", { name: /管理員登入/ }).first();
  if (await adminLink.isVisible().catch(() => false)) {
    await adminLink.click();
  } else {
    await page.goto("/admin/login");
  }

  await page.getByLabel(/email/i).first().fill(email);
  await page.getByLabel(/密碼|password/i).first().fill(password);
  await page.getByRole("button", { name: /登入|sign in/i }).click();

  await page.waitForURL((url) => !url.pathname.startsWith("/login"), {
    timeout: 20_000,
  });
}

export async function gotoStorefrontEdit(page: Page) {
  await page.goto("/shop/account/storefront");
  await expect(page.getByText(/頁面版型/)).toBeVisible({ timeout: 15_000 });
}

export async function gotoTemplatesPage(page: Page) {
  await page.goto("/shop/account/storefront/templates");
  await expect(
    page.getByRole("heading", { name: /選擇品牌頁版模/ }),
  ).toBeVisible({ timeout: 15_000 });
}
