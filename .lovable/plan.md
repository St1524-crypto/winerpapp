
# 訂單付款自動升級 VIP：改為伺服端觸發 + 後台補跑動作

## 目標
- 訂單 `payment_status` 從非 `paid` → `paid` 時，**在資料庫層自動**觸發 VIP 升級套組 / 年費 VIP 升級處理，不再依賴會員本人打開訂單詳情頁。
- 後台提供一鍵「補跑升級 hook」，供財務處理歷史遺漏訂單。
- 冪等：以 `vip_package_upgrade_logs(sales_order_id, package_id)` 與 `annual_fee_upgrade_logs(sales_order_id, sku)` 現有 unique key 保證不重複發放。

## 方案：資料庫 Trigger + Admin 補跑 ServerFn

### 1. 新增 PL/pgSQL 函式 `public.process_paid_order_upgrades(p_order_id uuid, p_operator uuid)`
移植 `processOrderVipPackageUpgrade` + `processOrderAnnualFeeUpgrade` 的核心邏輯到 SQL：

**VIP 升級套組流程（每個 pkg）：**
1. 從 `sales_order_items` 取 product_id 清單
2. 找出 active 且 (`package_product_id IN` 或舊 `product_id IN` 或 `vip_upgrade_package_products.product_id IN`) 的套組
3. 針對每個 pkg：
   - 若 `vip_package_upgrade_logs(sales_order_id, package_id)` 已存在 → skip
   - 比較 `profiles.vip_tier` 與 `pkg.tier_code`（用 `vip_tiers.sort_order`）決定 willUpgrade
   - baseExpiry = max(vip_expires_at, now)；after = baseExpiry + duration_days
   - `UPDATE profiles SET is_vip=true, vip_tier=(willUpgrade?pkg.tier_code:current), vip_expires_at=after`
   - `bonus_points>0` → insert `reward_wallet_logs`（earn）→ 重算 `member_points_wallet.reward_points = SUM(logs)`
   - 贈品（`vip_upgrade_package_products` 排除 anchor）→ 逐一 UPDATE `products.stock`、insert `inventory_logs`
   - Insert `vip_package_upgrade_logs`
   - Insert `audit_logs`（action=`vip_package_auto_upgrade`）

**年費 VIP 流程（每條 rule）：**
1. 從 `sales_order_items` 取 sku 清單
2. `annual_fee_vip_rules` 找 `is_active AND sku IN (...)`
3. 針對每條 rule：
   - `annual_fee_upgrade_logs(sales_order_id, rule_id)` 已存在 → skip
   - baseExpiry / after 同上、`UPDATE profiles SET is_vip=true, vip_expires_at=after`（不改 tier）
   - `reward_points>0` → 同上重算錢包
   - Insert `annual_fee_upgrade_logs`、`audit_logs`（action=`annual_fee_vip_upgrade`）

### 2. Trigger：`on_sales_order_payment_paid`
```sql
CREATE TRIGGER on_sales_order_payment_paid
AFTER UPDATE OF payment_status ON public.sales_orders
FOR EACH ROW
WHEN (OLD.payment_status IS DISTINCT FROM NEW.payment_status
      AND NEW.payment_status = 'paid'
      AND NEW.user_id IS NOT NULL)
EXECUTE FUNCTION public.trg_process_order_paid();
```
`trg_process_order_paid` 呼叫 `process_paid_order_upgrades(NEW.id, NULL)`；operator = NULL 表示系統自動。

也對 INSERT 加 trigger（若一開始就 payment_status='paid' 的訂單）。

### 3. 新增 admin ServerFn `adminRerunOrderUpgrades(orderId)`
- `src/lib/orders-admin.functions.ts`
- `.middleware([requireSupabaseAuth])` + 檢查 admin/super_admin/finance role
- 呼叫 `supabaseAdmin.rpc("process_paid_order_upgrades", { p_order_id, p_operator: userId })`
- 回傳 `{ ok: true, vip_package_logs_created, annual_fee_logs_created }`（用兩個 log count diff 判斷）

### 4. 後台 UI：訂單詳情加「補跑升級 hook」按鈕
- `src/routes/_authenticated/orders.tsx` 訂單詳情區塊
- 只在 `payment_status === 'paid'` 顯示
- 按下呼叫 `adminRerunOrderUpgrades`；toast 顯示新增了幾筆 log

### 5. 舊會員端 useEffect
保留 `src/routes/shop.account.orders.$id.tsx` 現有 hook 作為 fallback（冪等，重複呼叫無害）。

## 檔案異動
- **新 migration**：建 `process_paid_order_upgrades()` 函式 + `trg_process_order_paid()` + trigger（AFTER UPDATE / AFTER INSERT）
- **edit** `src/lib/orders-admin.functions.ts`：加 `adminRerunOrderUpgrades`
- **edit** `src/routes/_authenticated/orders.tsx`：訂單詳情頁加補跑按鈕

## 對 M003832 歐銘欽的一次性處理
本次不重跑（已由管理員手動補登完成），僅新機制生效於後續訂單與需要補跑的舊訂單。

## 風險與注意
- Trigger 在寫入交易內執行，若 upgrade 邏輯出錯會 rollback 掉 payment_status 更新 → 需要 `EXCEPTION WHEN OTHERS` 包住升級邏輯，只把錯誤寫到 `audit_logs`（action=`paid_order_upgrade_failed`）而不 rollback 付款。
- `SECURITY DEFINER` + `SET search_path = public, pg_temp` 讓 trigger 可以跨 RLS 更新 profiles / stock / logs。
- 現有 log 表 unique constraint 已存在，冪等性靠它。
