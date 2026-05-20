# 公司管理 E2E 測試（Playwright）

涵蓋情境：
- 新增公司（含必填驗證、Logo 上傳）
- 編輯公司資料（名稱、電話）
- 編輯時更換 Logo
- 移除公司

## 前置設定

1. 安裝瀏覽器（首次執行）：
   ```bash
   bunx playwright install chromium
   ```

2. 設定環境變數（建議放在 `.env.e2e`）：
   ```bash
   export E2E_BASE_URL=http://localhost:5173
   export E2E_SUPER_ADMIN_EMAIL=win889999@gmail.com
   export E2E_SUPER_ADMIN_PASSWORD=********
   # 自動清除測試資料用（service role，繞過 RLS）
   export SUPABASE_URL=https://<project-ref>.supabase.co
   export SUPABASE_SERVICE_ROLE_KEY=********
   ```

3. 另一個 terminal 啟動 dev server：
   ```bash
   bun run dev
   ```

## 執行

```bash
bunx playwright test                       # headless 跑全部
bunx playwright test --ui                  # UI 模式（推薦本機 debug）
bunx playwright test --headed              # 顯示瀏覽器
bunx playwright show-report                # 開啟最後一次報告
```

## 注意事項

- 測試會以 `E2E-<timestamp>` 命名公司，避免衝突。
- 若 `刪除公司` 步驟因 RLS／外鍵未刪除完成，請手動到後台清理；或在
  `admin.companies.tsx` 上加上 `data-testid` 後微調 selector。
- 因為 Sonner toast 文字會閃過，部分 assertion 設了 10~15s timeout。

## 自動清除

測試結束後（無論成功或失敗），`e2e/global-teardown.ts` 會用 service role：
1. 找出所有 `company_name` 以 `E2E-` 開頭的公司
2. 刪除其子資料（`company_members`、`customers`、`inventory_logs`、`inventory_transactions`、`payments` 等）
3. 移除 `branding` bucket 內對應的 logo 檔
4. 刪除公司本體
5. 清掉相關的 `audit_logs`

若未設定 `SUPABASE_SERVICE_ROLE_KEY`，teardown 會跳過並印 warning（不會讓測試 fail）。
