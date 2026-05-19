# 第五週：B2B 批發與供應鏈系統實作計畫

這是一個非常大的模組（18 個子系統），無法在單一回合裡一次到位且保證品質。建議分成 **4 個階段** 連續執行，每個階段都會留下可運作的 UI + Supabase 結構，並用假資料展示。

---

## 階段 1：資料骨架 + B2B 會員系統（本回合先做）

**SQL Schema（單一 migration）**
- `business_accounts`（公司、統編、信用額度、月結天數、等級 retail/vip/wholesale/agent、status pending/approved/rejected）
- `business_account_users`（綁定 auth.users）
- `price_tiers`（product_id, account_level, min_quantity, price）
- `moq_rules`（product_id, moq, carton_quantity, volume tiers JSON）
- `b2b_orders` / `b2b_order_items`
- `account_statements`（月結帳單）
- `sales_representatives`（業務）
- `notifications` 已存在 → 沿用
- 全部加 RLS：super_admin/sales 全權；vendor 僅看自己公司
- 種子 seed：3 家假公司 + 階梯價 + MOQ + 1 張月結帳單

**新增 AppRole**
- 在 `app_role` enum 加入 `dealer`（經銷商）、`wholesaler`（批發商）、`agent`（代理商）— 或復用 `vendor` 配合 `business_accounts.account_level`。**採後者**（不動 enum，降低破壞性）。

**前端模組**
- `/b2b/accounts` — B2B 廠商會員管理（列表、審核 approve/reject、編輯信用額度與月結天數）
- `/b2b/accounts/$id` — 詳細頁（公司資料、業務指派、信用使用率）

---

## 階段 2：價格 + MOQ + B2B Portal 商品頁

- `/b2b/pricing` — 階梯/分級價格管理（依商品 × 等級 × 數量區間）
- `/b2b/moq` — MOQ 與箱入數規則
- `/b2b-portal` — B2B 專屬入口（登入後依 `business_account_users` 切換到 B2B 介面）
- `/b2b-portal/products` — 顯示批發價、MOQ、箱入數、階梯價格表
- Hook：`useB2BPrice(productId, qty, accountLevel)` 計算實際價格

---

## 階段 3：B2B 下單 + 訂單流程 + 信用控管

- `/b2b-portal/quick-order` — 大量快速下單（SKU 搜尋、Excel 匯入 .xlsx 解析、批次加購物車）
- `/b2b-portal/cart` + checkout（自動套用 MOQ 倍數驗證、階梯價）
- `/b2b/orders` — 訂單流程：Pending → Confirmed → Picking → Shipped → Completed
- 業務審核 + 信用審核（超出額度阻擋下單，顯示可用/已用/應收）

---

## 階段 4：對帳 + 業務 + Dashboard + 通知

- `/b2b/statements` — 月結對帳單，PDF/Excel 匯出（沿用既有 `pdf-report.ts`）
- `/b2b/sales-reps` — 業務管理、客戶歸屬、業績統計
- `/dashboard` 升級：B2B 今日訂單、月結應收、批發營收、VIP 數 + 趨勢圖（recharts）
- 通知中心 `/notifications`：新訂單、低庫存、月結到期、未付款

---

## 技術規範

- **路由**：全部放在 `src/routes/_authenticated/b2b.*.tsx`；Portal 放 `src/routes/_authenticated/b2b-portal.*.tsx`
- **架構**：`src/hooks/use-b2b-*.tsx`（hooks）+ `src/lib/b2b/*.ts`（services / pricing calc / MOQ validator）+ `src/components/b2b/*`
- **權限**：sidebar 依 `super_admin`/`sales` 顯示 B2B 管理；`vendor` + 已綁 `business_account_users` 顯示 Portal
- **UI**：沿用現有 shadcn + design tokens、`bg-gradient-primary`、glassmorphism 卡片、Data Table、Skeleton、sonner toast
- **假資料**：每個列表頁種 3–10 筆，確保 UI 不空

---

## 本回合（階段 1）交付物

1. 一次 Supabase migration（含 7 張新表 + RLS + seed）
2. `src/lib/nav.ts` 加入「B2B 廠商會員」分組
3. `src/routes/_authenticated/b2b.accounts.tsx`（列表 + 審核 + 編輯）
4. `src/routes/_authenticated/b2b.accounts.$id.tsx`（詳細頁）
5. `src/hooks/use-business-accounts.tsx`
6. `src/components/b2b/BusinessAccountFormDialog.tsx`

確認後我會先執行 migration，待你核准後寫入前端程式碼，再進入階段 2。

請確認：
- 是否同意分 4 階段，先做階段 1？
- `account_level` 是否用 `retail / vip / wholesale / agent` 四級？
- 是否同意 **不新增 AppRole**，沿用 `vendor` + `business_account_users` 綁定？