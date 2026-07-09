# 合作申請功能實作計畫

## 資料表 (migration)

建立 `cooperation_applications` 表：
- 欄位依規格書（application_type、公司/個人資料、聯絡方式、sales_channels/interested_topics 陣列、status、admin_note、時間戳）
- `status` 預設 `pending`，允許 pending/contacted/approved/rejected/archived
- 加 `honeypot` 欄位不入 DB（僅前端阻擋）
- GRANT：
  - `INSERT` TO anon, authenticated（讓任何人可送出）
  - `SELECT/UPDATE` TO authenticated（後台 admin 用；由 RLS 限制）
  - `ALL` TO service_role
- RLS：
  - Insert：anon + authenticated 皆可（欄位驗證交給 server function）
  - Select/Update：僅 `has_role(auth.uid(),'admin')` 或 `super_admin`
  - 無 DELETE 政策（規格要求不刪除）
- `updated_at` 觸發器沿用現有 `update_updated_at_column()`

## 前台

**路由 `/cooperation/apply`** (`src/routes/cooperation.apply.tsx`)：
- Head/SEO metadata
- 標題「與源晶生技合作」+ 副標
- 三張卡片切換申請類型（dealer/reseller/vip）
- 依類型動態顯示對應欄位（React Hook Form + zod 驗證）
- Honeypot 隱藏欄位 `website_url`（bots 常填）
- 必填：姓名/聯絡人、電話、Email、type
- Submit 呼叫 server function `submitCooperationApplication`
- 成功顯示：「申請已送出，源晶團隊將儘快與您聯繫。」

**首頁入口**：在 `src/routes/shop.index.tsx`（或 shop layout 已有的位置）加「合作申請」按鈕，`Link to="/cooperation/apply"`。

## Server function

**檔案** `src/lib/cooperation.functions.ts`：

1. `submitCooperationApplication`（公開，無 auth 中介層）
   - zod 驗證輸入 + honeypot 檢查（若填了直接回成功但不寫入）
   - 用 server publishable client 或直接 handler 內動態 import supabaseAdmin 插入
   - 呼叫 email 通知（見下）
   - 回傳 `{ ok: true }`

2. `listCooperationApplications`、`updateCooperationApplication`
   - `.middleware([requireSupabaseAuth])`
   - handler 內先 `has_role` 驗 admin/super_admin，非 admin 丟錯
   - 支援 type/status filter、更新 status / admin_note

## Email 通知

專案目前 **只有 email queue processor**，沒有 transactional send route 或 template registry。依規格「如果沒有，先建立 server function stub，回報需要設定 email provider，不要硬寫假寄信」：

- 建立 `src/lib/cooperation-email.server.ts` 內 `notifyAdminOfApplication(app)` stub
- 使用 `console.info` 記錄摘要 + TODO 註解說明尚未串接
- 不呼叫 `sendLovableEmail`、不假造 send
- 在回報中請使用者若需真正寄信，執行 email 網域設定 + `scaffold_transactional_email`

## 管理員後台

**路由 `/admin/cooperation-applications`**  
（`src/routes/_authenticated/admin.cooperation-applications.tsx`）：
- `_authenticated` 已由 layout gate；元件內以 `useAuth` 檢查 `admin`/`super_admin`，非授權顯示 `ForbiddenScreen`
- 表格 + 篩選（type、status）
- 詳情 Dialog：完整欄位 + 狀態下拉 + admin_note 文字區 + 儲存
- 「封存」＝將 status 設為 archived（無刪除鈕）
- 資料透過 `useQuery` 呼叫 `listCooperationApplications`

## 安全

- Service role 僅 server 端動態 import
- Honeypot 前後端雙檢
- Server function 驗證 zod schema、限制字串長度
- Email 及後台密鑰未暴露前端
- Admin 端點以 `requireSupabaseAuth` + role 檢查雙層保護
- 不影響會員/訂單/獎金/VIP 等既有表

## 驗證

- 建置由 harness 自動跑
- routeTree.gen.ts 自動生成，不手動編輯

## 完成回報

- migration 檔名、修改檔案清單、新路由、新表、Email 狀態（stub + 需求）、build 結果