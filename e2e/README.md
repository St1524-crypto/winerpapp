# E2E 測試（Playwright）

涵蓋情境：
- **公司管理** (`admin-companies.spec.ts`)：新增 / 編輯 / 換 Logo / 刪除公司
- **個人品牌頁版模** (`storefront-templates.spec.ts`)：管理員 / 經銷商 / VIP 三種角色
  - `/shop/account/storefront` 「頁面版型」下拉是否顯示 A/B/C/D
  - `/shop/account/storefront/templates` 自訂版模 CRUD、套用、發布

## ⚠️ 安全提醒：請使用專用測試帳號

這些 E2E 測試僅用於測試流程，**不應使用正式高權限帳號**（例如 super_admin、生產環境的經銷商或 VIP 帳號）。

請在測試環境建立：
- 一名測試用 admin（只放 `admin` 角色，可登入後台）
- 一名測試用經銷商會員（會員等級設為經銷商）
- 一名測試用 VIP 會員（會員等級設為 VIP）

## 個人品牌頁版模 — 必填環境變數

```bash
# 管理員（email 登入；請使用「測試用 admin」，勿用 super_admin）
export E2E_ADMIN_EMAIL=
export E2E_ADMIN_PASSWORD=

# 經銷商會員（行動電話或 M 開頭會員編號）
export E2E_DEALER_MEMBER_NO=
export E2E_DEALER_PASSWORD=

# VIP 會員
export E2E_VIP_MEMBER_NO=0982530398
export E2E_VIP_PASSWORD=
```

任一組未設定，對應的 `describe` 會自動 `skip`，不會 fail。

只跑版模 E2E：
```bash
bunx playwright test storefront-templates
```

## 前置設定

1. 安裝瀏覽器（首次執行）：
   ```bash
   bunx playwright install chromium
   ```

2. 設定環境變數（建議放在 `.env.e2e`）：
   ```bash
   export E2E_BASE_URL=http://localhost:5173
   # 管理員：請使用測試環境專用 admin 帳號
   export E2E_ADMIN_EMAIL=your-test-admin@example.com
   export E2E_ADMIN_PASSWORD=********
   # VIP（已預設範例 ID）
   export E2E_VIP_MEMBER_NO=0982530398
   export E2E_VIP_PASSWORD=********
   # 經銷商
   export E2E_DEALER_MEMBER_NO=0912345678
   export E2E_DEALER_PASSWORD=********
   # 自動清除測試資料用（service role，繞過 RLS；如不需要可省略）
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
- `storefront-templates.spec.ts` 會在缺少 `E2E_*` 環境變數時自動 `skip`，不會阻塞 build / preview / publish。

## 自動清除

測試結束後（無論成功或失敗），`e2e/global-teardown.ts` 會用 service role：
1. 找出所有 `company_name` 以 `E2E-` 開頭的公司
2. 刪除其子資料（`company_members`、`customers`、`inventory_logs`、`inventory_transactions`、`payments` 等）
3. 移除 `branding` bucket 內對應的 logo 檔
4. 刪除公司本體
5. 清掉相關的 `audit_logs`

若未設定 `SUPABASE_SERVICE_ROLE_KEY`，teardown 會跳過並印 warning（不會讓測試 fail）。
