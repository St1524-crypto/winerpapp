## 復購優惠套組 規劃

### 功能目標
建立「復購優惠套組」：管理員可將多項商品＋數量組合成套組，設定整組價格與整組獎勵點。會員於購物車/結帳時以套組為單位加入，結帳時整組發放獎勵點（不再逐商品計算）。

### 資料模型（新增 2 張表）

**`repurchase_bundles`** — 套組主檔
- `name` 套組名稱
- `slug` 網址代稱（唯一）
- `description` 說明
- `cover_image` 封面圖
- `bundle_price` 套組售價（整組價，會員實付）
- `bundle_reward_points` 整組發放獎勵點
- `visibility` `all` / `vip` / `dealer`（誰可購買）
- `status` `active` / `inactive` / `draft`
- `start_at` / `end_at` 上下架時間（可空）
- `max_per_order` 單筆訂單最多可買組數（可空＝不限）
- `sort_order`

**`repurchase_bundle_items`** — 套組明細
- `bundle_id` FK → repurchase_bundles
- `product_id` FK → products
- `quantity` 該商品在套組內的件數
- `sort_order`
- Unique(`bundle_id`, `product_id`)

RLS：
- `authenticated` 讀 `status=active` 且在有效期內＋依 visibility 篩選
- `anon` 讀公開套組（`visibility=all`）
- 管理員（super_admin / admin / finance）完整 CRUD

GRANT + `service_role` ALL 依專案慣例。

### 結帳與獎勵點邏輯（修改 `applyOrderPoints`）

訂單項需能標記「屬於哪個套組」。做法：
- `sales_order_items` 已存在，新增可空欄位 `bundle_id`（FK）與 `bundle_line_key`（同一組實例的識別，例如 `${bundle_id}:${nth}`）。
- 加入購物車時，套組會展開成多筆 `sales_order_items` 並帶上 `bundle_id` + `bundle_line_key`；單品訂單項 `bundle_id` 為 NULL，走現有階梯邏輯。

`applyOrderPoints` 的 `rewardEarn` 計算調整為：
1. 先將訂單品項依 `bundle_line_key` 分組。
2. 每組（＝一份套組實例）→ 加上 `bundle_reward_points`（從 `repurchase_bundles` 讀）。
3. 未帶 `bundle_id` 的品項 → 沿用現有階梯 / `products.reward_points` 計算。
4. 買家為有效 VIP → 入自己；否則走現有推薦人分配（不變）。

訂單詳情頁的「階梯計算明細」新增區塊：顯示各套組（套組名、份數、每組獎勵點、小計），與單品階梯明細並列。

### 管理與前台頁面

- 管理端：`/_authenticated/admin.repurchase-bundles.tsx`（列表 + 新增/編輯 dialog：基本資料、加入商品明細、售價、獎勵點、可見性、上下架期間）。
- 前台：`/shop.bundles.index.tsx`（清單）、`/shop.bundles.$slug.tsx`（詳情＋「加入購物車」）。
- 加入購物車：cart 需支援「套組列」（groupKey）。最小改動＝在 `cart_items` 新增 `bundle_id` + `bundle_line_key` 兩欄，UI 以 `bundle_line_key` 聚合顯示為一組，數量以「組」為單位增減；結帳時原樣落到 `sales_order_items`。

### 伺服器函式（`src/lib/repurchase-bundles.functions.ts`）
- `listBundles`（公開，僅回 active 且符合可見性）
- `getBundleBySlug`（公開）
- `adminListBundles` / `adminUpsertBundle` / `adminDeleteBundle`（admin）
- `addBundleToCart({ bundleId, quantity })`：展開 items、寫入 `bundle_line_key`
- `removeBundleFromCart({ bundleLineKey })`

### 交付步驟
1. Migration：兩張新表 + `sales_order_items.bundle_id/bundle_line_key` + `cart_items.bundle_id/bundle_line_key` + RLS + GRANT。
2. Server functions（上述清單）。
3. 管理頁（CRUD + 明細編輯）。
4. 前台清單 / 詳情 / 加入購物車 UI；購物車與結帳以「組」呈現。
5. 修改 `applyOrderPoints`：套組發整組點、單品沿用階梯。
6. 訂單詳情頁：新增「套組獎勵明細」區塊。

### 待確認
- 套組內某商品缺貨時：整組不可下單 vs 逐品扣庫存但整組出貨？（建議整組不可下單）
- 套組是否允許與折扣點/購物點折抵並用？（建議允許，但折抵不影響 `bundle_reward_points` 發放）
- 套組價與階梯價衝突：套組一律用 `bundle_price`，忽略單品階梯（建議）
