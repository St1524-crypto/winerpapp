# 多公司租戶系統 建置計畫

將現有 ERP 改造為多公司（multi-tenant）SaaS 模式：共用資料庫 + `company_id` 隔離，一個帳號可加入多家公司並切換，僅 `super_admin` 可建立公司。

---

## 階段 1：租戶基礎建設（必做，先上線）

### 資料模型
- 沿用既有的 `companies` 表（已有 company_name / tax_id / logo_url / status 等欄位）。
- 沿用既有的 `company_members` 表（user_id / company_id / role）作為「使用者—公司」關聯。
- 新增 `current_company_id` 欄位到 `profiles`，記錄使用者目前選擇的公司（切換用）。
- 新增 SECURITY DEFINER function：
  - `private.current_company_id()` — 回傳當前使用者切換中的公司 id。
  - `private.is_company_member(_company_id, _user_id)` — 判斷使用者是否屬於該公司。
  - `private.has_company_role(_company_id, _user_id, _role)` — 公司內角色檢查（admin / member）。

### RLS 模式（所有業務表共用）
```text
SELECT  USING  ( company_id = private.current_company_id()
                 OR private.has_role(auth.uid(), 'super_admin') )
INSERT  WITH CHECK ( company_id = private.current_company_id() )
UPDATE  USING  ( company_id = private.current_company_id() )
DELETE  USING  ( company_id = private.current_company_id() )
```
super_admin 不受公司隔離，可跨公司查詢（平台維運）。

### 前端
- 新增 `useCurrentCompany()` hook，從 profiles 讀取/寫入 `current_company_id`。
- AppHeader 加上「公司切換器」下拉，列出該使用者所屬公司，切換時 update profiles 並 `queryClient.invalidateQueries()` 重整資料。
- 登入後若使用者無任何 company_members，顯示「等待管理員邀請加入公司」提示頁。
- super_admin 新增「平台 → 公司管理」頁面，可建立公司、指派初始管理員、停用公司。

---

## 階段 2：業務資料表加上 company_id（分批進行）

每個業務表都要：(1) 加 `company_id uuid NOT NULL`、(2) 改寫 RLS、(3) backfill 既有資料、(4) 前端寫入時帶入。

**第一批（核心交易）**：
- products / product_images / categories / price_tiers / moq_rules
- sales_orders / sales_order_items / payments / invoices
- customers / customer_addresses

**第二批（庫存與採購）**：
- warehouses / inventory_logs / inventory_transactions
- purchase_orders / goods_receiving / vendors / suppliers

**第三批（財務與 B2B）**：
- bank_accounts / finance_transactions / accounts_receivable / accounts_payable
- business_accounts / b2b_orders / b2b_order_items / account_statements / dealers

**第四批（輔助）**：
- coupons / notifications / notification_rules / automation_workflows / automation_runs / ai_logs

> 既有資料 backfill：建立一個「預設公司」，把所有現存資料的 company_id 都指向它，並把所有現有非 super_admin 使用者加入該公司，確保不會掉資料、不會炸權限。

---

## 階段 3：前端整合

- 所有 list / insert / update 的 Supabase query 預設依賴 RLS（不需手動加 `.eq('company_id', ...)`），但 insert 時需明確帶入 `company_id`。
- 共用一個 `withCompanyId(payload)` helper，自動把目前 company_id 塞進新建紀錄。
- Header 顯示當前公司名稱與 logo（從 companies 讀），切換公司時 toast 通知。
- 前端路由 guard：未選公司且非 super_admin → 強制導到「選擇公司」畫面。

---

## 技術細節（給開發者）

- `current_company_id` 從 profiles 讀取，不放 JWT claim，避免 token 失效問題。
- 切換公司 = `UPDATE profiles SET current_company_id = ?`，前端 `invalidateQueries` 即可。
- 為避免「使用者把 current_company_id 改成自己沒加入的公司」造成資料外洩：
  - profiles UPDATE policy 限制：新 current_company_id 必須是 `is_company_member(...)` 才允許。
  - 或在 `private.current_company_id()` 內檢查，若 user 不是該 company member 則回傳 NULL（RLS 自然會擋）。後者較穩健，採此做法。
- super_admin 在 UI 上可選擇「以某公司身分檢視」或「全部公司」，後者繞過 company_id 過濾。
- 既有 `has_role` / `user_roles` 表的全域角色（super_admin / finance / sales / warehouse / member）繼續作為「平台層」角色；公司內角色用 `company_members.role`。

---

## 風險與注意事項

1. **資料規模**：本系統已有大量業務表與 RLS 政策；階段 2 會是大量 migration，建議分多次提交、每批驗證後再進下一批。
2. **既有資料相容性**：必須先建立「預設公司」並 backfill，否則上線當下所有舊資料因 company_id 為 NULL 會被 RLS 全部擋掉。
3. **編輯訂單 / 列印 PDF 等既有功能**：在加 company_id 後不需改前端 query（RLS 處理），但要確認 insert 路徑都有帶 company_id。
4. **本次先實作階段 1**，階段 2、3 待你確認後再分批進行——避免一次 migration 太大失敗難 rollback。

---

## 本次（第一個 PR）只做：

✅ 階段 1 全部：
- profiles 加 `current_company_id` 欄位 + RLS 限制
- 三個 SECURITY DEFINER function
- 「預設公司」backfill：建立一家公司、把所有既有使用者加入、設為他們的 current_company_id
- 前端：useCurrentCompany hook、AppHeader 公司切換器
- super_admin 的「平台 → 公司管理」頁（建立公司 / 列出成員 / 邀請使用者加入）

階段 2（業務表加 company_id）等你確認階段 1 正常運作後，再分批進行。
