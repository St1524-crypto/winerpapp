## 目標
將「VIP 升級套組」從「綁定 1 個商品」升級為「可綁定多個商品（贈品）」，並維持：
- 贈送獎勵點以「套組設定值」為準，僅發放 1 次（不依綁定商品數量重複發放）
- 任一綁定商品付款完成 → 觸發該套組升級 + 1 次獎勵點
- 同一筆訂單 / 同一套組僅升級 1 次（idempotent）

## 資料庫變更（migration）
新增關聯表 `vip_upgrade_package_products`：
- `package_id` → `vip_upgrade_packages.id` (on delete cascade)
- `product_id` → `products.id` (on delete cascade)
- `sort_order int default 0`
- UNIQUE(package_id, product_id)
- GRANT + RLS：admin 可寫；authenticated 可讀（前台顯示贈品清單用）

保留 `vip_upgrade_packages.product_id` 欄位以相容既有資料，遷移時自動把現有 `product_id` 寫入新表（若存在），之後以新表為主要資料來源。

`vip_package_upgrade_logs` 的 idempotency key 維持 `(order_id, package_id)`，確保「同一張訂單 + 同一套組」只發放一次獎勵點與升級。

## 後端 functions（src/lib/vip-tiers.functions.ts）
1. `adminListVipPackages` 回傳每個套組附 `products: [{id, name, sku, price}]`
2. `upsertVipPackage` 接受 `product_ids: string[]`：
   - 寫入套組主檔
   - 以 transactional pattern 重建 `vip_upgrade_package_products`
3. `processOrderVipPackageUpgrade(orderId)`：
   - 找出該訂單的所有 `sales_order_items.product_id`
   - 比對 `vip_upgrade_package_products` 找出該訂單觸發的所有「套組」（去重）
   - 對每個套組：以 `(order_id, package_id)` 為 key 寫入 `vip_package_upgrade_logs`；若新插入才執行升級 + 發點（獎勵點 = 套組設定值，與綁定商品數無關）
   - 已存在 log → skip（避免重發）

## 前台 / 後台 UI
- `admin.vip-upgrade-packages.tsx`：
  - 將「綁定商品」單選改成「已綁定商品清單 + 新增 / 移除」
  - 搜尋 → 點擊新增到清單；列表顯示名稱 / SKU / 移除
  - 卡片顯示 `綁定商品數: N`，N > 0 時顯示「加入購物車」徽章
- `shop.vip.tsx`：
  - 顯示贈品清單（多個商品）
  - 「加入購物車」按鈕一次將套組綁定的所有商品（每個 qty=1）加入購物車

## 技術說明
- 不變更獎勵點欄位 (`bonus_points`) 語意：仍是「整個套組發一次」
- 既有 `processOrderVipPackageUpgrade` 已以 `(order_id, package_id)` 唯一鍵作 idempotent，多商品情境天然不會重發
- 綁定商品本身在訂單中為「贈品/搭售品」——本流程不在 `sales_order_items` 額外發放單品獎勵點（reward_points 來自 `retail_reward_splits` 設定，套組綁定商品建議將該品 `reward_points = 0`，並在 UI 提示管理員）

## 檔案異動
- supabase migration（新表 + 資料搬遷）
- `src/lib/vip-tiers.functions.ts`（list/upsert/process 三隻 fn）
- `src/routes/_authenticated/admin.vip-upgrade-packages.tsx`（多商品 picker）
- `src/routes/shop.vip.tsx`（多商品顯示 + 加入購物車）
