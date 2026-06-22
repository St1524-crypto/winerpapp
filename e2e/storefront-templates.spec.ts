import { test, expect, Page } from "@playwright/test";
import {
  loginAsMember,
  loginAsAdminEmail,
  gotoStorefrontEdit,
  gotoTemplatesPage,
} from "./utils/member-login";

/**
 * 個人品牌頁版模 E2E
 *
 * 涵蓋：
 *  - /shop/account/storefront 「頁面版型」下拉在三種角色下顯示正確選項
 *  - /shop/account/storefront/templates 三種角色皆能套用預設版模、CRUD 自訂版模、發布
 *
 * 必填環境變數（任一組未設定，對應的 describe 會 skip）：
 *  - E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD            （管理員，email 登入）
 *  - E2E_DEALER_MEMBER_NO / E2E_DEALER_PASSWORD      （經銷商會員）
 *  - E2E_VIP_MEMBER_NO    / E2E_VIP_PASSWORD         （VIP 會員）
 */

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? process.env.E2E_SUPER_ADMIN_EMAIL;
const ADMIN_PASSWORD =
  process.env.E2E_ADMIN_PASSWORD ?? process.env.E2E_SUPER_ADMIN_PASSWORD;

const DEALER_ID = process.env.E2E_DEALER_MEMBER_NO;
const DEALER_PASSWORD = process.env.E2E_DEALER_PASSWORD;

const VIP_ID = process.env.E2E_VIP_MEMBER_NO;
const VIP_PASSWORD = process.env.E2E_VIP_PASSWORD;

const ALL_LABELS = ["A 品牌型", "B 電商型", "C 招商型", "D 影音型"];
const BASIC_ONLY = ["A 品牌型", "D 影音型"];

async function assertTemplateOptions(page: Page, expected: string[]) {
  await gotoStorefrontEdit(page);
  const hint = page.getByText(/可用版型：/);
  await expect(hint).toBeVisible();
  const text = (await hint.innerText()).replace(/\s+/g, "");
  for (const label of expected) {
    expect(text, `應該看到 ${label}`).toContain(label.replace(/\s+/g, ""));
  }
  for (const label of ALL_LABELS.filter((l) => !expected.includes(l))) {
    expect(text, `不應看到 ${label}`).not.toContain(label.replace(/\s+/g, ""));
  }
}

async function crudCustomTemplate(page: Page, label: string) {
  await gotoTemplatesPage(page);

  const name = `E2E-${label}-${Date.now()}`;
  const renamed = `${name}-改`;

  // 新增
  await page.getByRole("button", { name: "新增自訂版模" }).click();
  const createDialog = page.getByRole("dialog");
  await createDialog.getByLabel("名稱").fill(name);
  await createDialog.getByLabel("描述").fill(`E2E ${label} 描述`);
  await createDialog.getByLabel(/content_json/i).fill('{"sections":[]}');
  await createDialog.getByRole("button", { name: "儲存" }).click();
  await expect(page.getByText("已新增自訂版模")).toBeVisible();
  const card = page.locator("div", { hasText: name }).first();
  await expect(card).toBeVisible();

  // 編輯
  await card.getByRole("button", { name: "編輯" }).click();
  const editDialog = page.getByRole("dialog");
  await editDialog.getByLabel("名稱").fill(renamed);
  await editDialog.getByRole("button", { name: "儲存" }).click();
  await expect(page.getByText("已更新版模")).toBeVisible();
  await expect(page.getByText(renamed).first()).toBeVisible();

  // 套用
  const updatedCard = page.locator("div", { hasText: renamed }).first();
  await updatedCard.getByRole("button", { name: "套用" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "確認套用" })
    .click();
  await expect(page.getByText("已套用版模")).toBeVisible({ timeout: 15_000 });

  // 發布
  await page.getByRole("button", { name: "發布" }).first().click();
  await expect(page.getByText("已發布品牌頁")).toBeVisible({ timeout: 15_000 });

  // 刪除（清理）
  page.once("dialog", (d) => d.accept());
  await page
    .locator("div", { hasText: renamed })
    .first()
    .getByRole("button", { name: "刪除" })
    .click();
  await expect(page.getByText("已刪除")).toBeVisible({ timeout: 10_000 });
}

// ────────────────────────────────────────────────────────────
// 管理員
// ────────────────────────────────────────────────────────────
test.describe("storefront templates — 管理員", () => {
  test.skip(!ADMIN_EMAIL || !ADMIN_PASSWORD, "缺少 E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD");

  test.beforeEach(async ({ page }) => {
    await loginAsAdminEmail(page, ADMIN_EMAIL!, ADMIN_PASSWORD!);
  });

  test("頁面版型下拉看到 A/B/C/D 全部", async ({ page }) => {
    await assertTemplateOptions(page, ALL_LABELS);
  });

  test("可 CRUD 自訂版模並發布", async ({ page }) => {
    await crudCustomTemplate(page, "admin");
  });
});

// ────────────────────────────────────────────────────────────
// 經銷商
// ────────────────────────────────────────────────────────────
test.describe("storefront templates — 經銷商", () => {
  test.skip(!DEALER_ID || !DEALER_PASSWORD, "缺少 E2E_DEALER_MEMBER_NO / E2E_DEALER_PASSWORD");

  test.beforeEach(async ({ page }) => {
    await loginAsMember(page, DEALER_ID!, DEALER_PASSWORD!);
  });

  test("頁面版型下拉看到 A/B/C/D", async ({ page }) => {
    await assertTemplateOptions(page, ALL_LABELS);
  });

  test("可 CRUD 自訂版模並發布", async ({ page }) => {
    await crudCustomTemplate(page, "dealer");
  });
});

// ────────────────────────────────────────────────────────────
// VIP
// ────────────────────────────────────────────────────────────
test.describe("storefront templates — VIP", () => {
  test.skip(!VIP_ID || !VIP_PASSWORD, "缺少 E2E_VIP_MEMBER_NO / E2E_VIP_PASSWORD");

  test.beforeEach(async ({ page }) => {
    await loginAsMember(page, VIP_ID!, VIP_PASSWORD!);
  });

  test("頁面版型下拉看到 A/B/C/D", async ({ page }) => {
    await assertTemplateOptions(page, ALL_LABELS);
  });

  test("可 CRUD 自訂版模並發布", async ({ page }) => {
    await crudCustomTemplate(page, "vip");
  });
});
