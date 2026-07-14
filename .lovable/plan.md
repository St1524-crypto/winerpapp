## 目標
新增「廠商進貨退回」流程：後台管理員可依 PO 明細建立退回單，扣商品庫存（**允許負庫存**）並沖銷對應 `accounts_payable` 金額。不影響會員獎金，不進入 `sales_returns`。

## 方案（最小侵入）
新增獨立資料表 `purchase_returns` / `purchase_return_items`，與現有 `purchase_orders` / `goods_receiving` 並存；僅 super_admin / admin / finance 可用。

### 1. Migration（新表）
**`purchase_returns`**
- `return_no` text unique（`PR-YYYYMMDD-XXXX`）
- `purchase_order_id` uuid（來源 PO）
- `vendor_id` uuid, `vendor_name` text（快照）
- `company_id` uuid
- `status` text（draft / submitted / completed / cancelled）
- `reason`, `notes` text
- `subtotal` numeric（退回總金額）
- `inventory_status` text（not_processed / processed / skipped）
- `payable_status` text（not_processed / processed / skipped）
- `payable_adjustment_id` uuid（對應調整的 `accounts_payable.id`）
- `created_by/at`, `completed_by/at`, `cancelled_by/at`, `updated_at`

**`purchase_return_items`**
- `purchase_return_id`, `purchase_order_item_id`
- `product_id`, `product_name`, `sku`（快照）
- `quantity` int（≤ PO item `received_quantity`）
- `unit_price` numeric（取 PO 單價）
- `subtotal` numeric
- `inventory_action` text（`deduct_stock` / `no_stock_change`）
- `reason`, `condition_note`

**RLS + GRANT（依專案規範）**
- `GRANT SELECT, INSERT, UPDATE, DELETE ... TO authenticated`；`GRANT ALL ... TO service_role`
- policy：同 company 的 admin / finance / super_admin 可讀寫（`private.has_role` + `company_members` join `private.current_company_id()`）

### 2. Server functions（新檔 `src/lib/purchase-returns.functions.ts`）
- `adminListPurchaseReturns` — 列表 + 篩選（status / query / 日期）
- `adminGetPurchaseReturnDetail` — 單筆 + 明細 + 來源 PO
- `adminCreatePurchaseReturn` — 驗數量 ≤ PO item `received_quantity`，寫 draft
- `adminUpdatePurchaseReturnStatus` — draft ↔ submitted / cancelled
- `adminApplyPurchaseReturnEffects`（核心，冪等）：
  - **庫存**：對每筆 `deduct_stock`：`products.stock -= qty`（**允許負值，不阻擋**）；寫 `inventory_logs`（`type='purchase_return_deduct'`, before/after/reason='PR-xxx'）
  - **應付**：以 `accounts_payable.reference_po_id = purchase_order_id` 查最新一筆
    - 存在且未全額付：`total_amount -= subtotal`（若 ≤ 0 → `status='cancelled'`），記回 `payable_adjustment_id`
    - 不存在或已付清：新增負向 `accounts_payable`（`total_amount = -subtotal`, `status='adjustment'`, `notes='退回 PR-xxx'`, `reference_po_id` 帶入），記回 id
  - 兩段各自寫 `inventory_status` / `payable_status = processed`；terminal 後把 `status='completed'`、`completed_by/at`
  - 冪等：完成後再套 → `already_applied`
  - 寫 `audit_logs`（`entity='purchase_returns'`）
- 全部 `.middleware([requireSupabaseAuth])` + 角色檢查

### 3. UI（僅後台 admin）
新路由 `src/routes/_authenticated/purchase-returns.tsx`
- 列表：狀態 / 關鍵字過濾；欄位：PR#、PO#、廠商、金額、庫存/應付狀態、時間
- 建立對話框：選 PO → 帶未退明細 → 勾選數量 + `inventory_action` → 送出
- 詳情抽屜：明細、來源 PO 連結、「送出」「套用效果」「取消」按鈕
- `AdminSidebar.tsx` 新增入口「進貨退回」（採購/財務區塊下）

### 4. 明確不做
- 不動 `sales_returns` / `adminApplySalesReturnEffects`
- 不追回獎勵點
- 不建會員自助入口
- 不回寫 `purchase_orders.received_quantity`（PR 自身即事實來源）
- 不阻擋負庫存（依你確認）

## 驗收
1. 建 PR → `products.stock` 減少（可為負）；`inventory_logs` 有對應 row
2. AP 對應金額減少或產生負向調整；`reference_po_id` 一致
3. 非 admin/finance/super_admin 呼叫 → 403
4. 同一 PR 重複套用 → 冪等
5. 會員 `member_points_wallet` / `point_transactions` 無變動

## 風險與備註
- 若 PO 無對應 AP：以負向調整單記帳，不阻斷流程
- 負庫存後續由正常進貨補回；建議在 UI 顯示警告但允許送出
