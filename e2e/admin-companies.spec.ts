import { test, expect } from "@playwright/test";
import path from "node:path";
import fs from "node:fs";
import { loginAsSuperAdmin, gotoCompanies } from "./utils/auth";

/**
 * 公司管理 E2E：
 *   - 新增公司（含必填驗證）
 *   - 編輯公司資料
 *   - 上傳 Logo
 *   - 移除公司
 *
 * 為了避免污染既有資料，每次 run 都以「E2E-<timestamp>」為公司名，
 * 並在 teardown 時嘗試移除自己建立的公司。
 */

const stamp = Date.now();
const companyName = `E2E-${stamp}`;
const renamedName = `E2E-${stamp}-renamed`;

// 準備一張小型 PNG 當 Logo
const logoPath = path.join(process.cwd(), "e2e", "fixtures", "logo.png");
test.beforeAll(() => {
  const dir = path.dirname(logoPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(logoPath)) {
    // 1x1 透明 PNG
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
      "base64",
    );
    fs.writeFileSync(logoPath, png);
  }
});

test.describe.serial("公司管理流程", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsSuperAdmin(page);
    await gotoCompanies(page);
  });

  test("新增公司：必填驗證 + 成功建立 + Logo 上傳", async ({ page }) => {
    await page.getByRole("link", { name: /新增公司/ }).first().click();
    await page.waitForURL(/\/admin\/companies\/new/);

    // 1) 必填驗證
    await page.getByRole("button", { name: /建立公司/ }).click();
    await expect(page.getByText(/請輸入公司名稱/)).toBeVisible();

    // 2) 填入欄位
    await page.getByLabel(/公司名稱/).fill(companyName);
    await page.getByLabel(/統一編號/).fill("12345678");
    await page.getByLabel(/電話/).fill("02-2345-6789");
    await page.getByLabel(/^email$/i).fill(`e2e+${stamp}@example.com`);
    await page.getByLabel(/地址/).fill("台北市信義區 E2E 路 1 號");

    // 3) 上傳 Logo（hidden input）
    const fileInput = page.locator('input[type="file"][accept^="image/"]');
    await fileInput.setInputFiles(logoPath);
    await expect(page.getByText(/Logo 已上傳/)).toBeVisible({ timeout: 15_000 });

    // 4) 提交
    await page.getByRole("button", { name: /建立公司/ }).click();
    await page.waitForURL(/\/admin\/companies(?!\/new)/, { timeout: 20_000 });
    await expect(page.getByText(new RegExp(`已建立並切換至.*${companyName}`))).toBeVisible();
    await expect(page.getByRole("cell", { name: companyName })).toBeVisible();
  });

  test("編輯公司：更新名稱與電話", async ({ page }) => {
    const row = page.getByRole("row", { name: new RegExp(companyName) });
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: /編輯|修改/ }).first().click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    const nameInput = dialog.getByLabel(/公司名稱/);
    await nameInput.fill(renamedName);
    await dialog.getByLabel(/電話/).fill("02-9999-0000");
    await dialog.getByRole("button", { name: /儲存|更新|確定/ }).click();

    await expect(dialog).toBeHidden({ timeout: 10_000 });
    await expect(page.getByRole("cell", { name: renamedName })).toBeVisible();
  });

  test("更換 Logo：在編輯對話框內重新上傳", async ({ page }) => {
    const row = page.getByRole("row", { name: new RegExp(renamedName) });
    await row.getByRole("button", { name: /編輯|修改/ }).first().click();

    const dialog = page.getByRole("dialog");
    const fileInput = dialog.locator('input[type="file"][accept^="image/"]');
    await fileInput.setInputFiles(logoPath);
    await expect(page.getByText(/Logo 已上傳/)).toBeVisible({ timeout: 15_000 });

    await dialog.getByRole("button", { name: /儲存|更新|確定/ }).click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });

    // 列表內該公司的 Logo <img> 應存在
    const row2 = page.getByRole("row", { name: new RegExp(renamedName) });
    await expect(row2.locator("img").first()).toBeVisible();
  });

  test("移除公司：確認流程", async ({ page }) => {
    const row = page.getByRole("row", { name: new RegExp(renamedName) });
    await expect(row).toBeVisible();

    // 攔截瀏覽器 confirm()（若使用 window.confirm）
    page.once("dialog", (d) => d.accept());

    await row.getByRole("button", { name: /刪除|移除/ }).first().click();

    // 若使用 shadcn AlertDialog，再次點選確認鍵
    const alert = page.getByRole("alertdialog");
    if (await alert.isVisible().catch(() => false)) {
      await alert.getByRole("button", { name: /確定|刪除|移除/ }).click();
    }

    await expect(
      page.getByRole("cell", { name: renamedName }),
    ).toHaveCount(0, { timeout: 10_000 });
  });
});
