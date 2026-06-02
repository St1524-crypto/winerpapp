## 目標
在商城新增「批發專區」分頁。商品可自訂多段（>2 段）數量門檻，每段設定單件批發價與單件獎勵點。所有登入會員皆可購買；凡商品有設定批發階梯，即自動出現在批發專區。

## 資料庫
新增 `product_wholesale_tiers` 表：

| 欄位 | 型別 | 說明 |
|---|---|---|
| id | uuid | PK |
| product_id | uuid | FK→products，ON DELETE CASCADE |
| min_qty | int | 此段起始件數（≥1） |
| max_qty | int? | 此段結束件數，NULL = 不設上限（最高段） |
| unit_price | numeric | 此段單件售價 |
| unit_reward_points | int | 此段每件獎勵點 |
| sort_order | int | 由小到大排序 |
| created_at / updated_at | timestamptz | |

- RLS：登入會員可 SELECT；admin 可全 CRUD
- GRANT：authenticated SELECT、service_role ALL
- 索引：(product_id, min_qty)

## 後台（商品管理）
`ProductFormDialog.tsx` 在「規格選項」區下新增「批發階梯」卡片：
- 「新增階梯」按鈕（最少 2 段才算有效，可任意新增）
- 每列欄位：起始件數、結束件數（留空=無上限）、單件批發價、單件獎勵點、刪除
- 儲存時：與商品同步寫入 `product_wholesale_tiers`（先刪後插）
- 驗證：段間連續、不重疊、min_qty ≥ 1

## 商城前台
1. **新路由** `src/routes/shop.wholesale.tsx`
   - 標題「VIP 批發專區」，需登入才能瀏覽（未登入導向 /login）
   - 列出所有有設定批發階梯的商品（透過 `product_wholesale_tiers` 反查 product）
   - 商品卡顯示「起批 N 件 NT$ X」
2. **商品頁** `shop.product.$id.tsx`：若有階梯，顯示階梯表格（件數區間 / 單價 / 獎勵點），並依目前選擇數量即時提示適用階梯
3. **價格計算共用函式** `src/lib/wholesale-pricing.ts`：依商品 + 數量回傳 { unitPrice, rewardPerUnit, totalReward }
4. **購物車 / 結帳**：載入購物車項目時順帶取得 tiers，依數量套用對應階梯價，原 wholesale_price 邏輯保留為 fallback
5. **導覽**：商城 Header 與底部行動選單新增「批發專區」入口

## 訂單入庫
建立訂單時 `sales_order_items.unit_price` 直接寫入該階梯單價；獎勵點記錄維持原 reward 寫入流程，但金額依「階梯單件點 × 數量」總和。

## 技術細節
- 階梯查詢一律 by product_id 排序 min_qty asc
- 適用判斷：取 `min_qty <= qty AND (max_qty IS NULL OR qty <= max_qty)` 之列
- 型別：`src/types/product.ts` 新增 `WholesaleTier` interface
- 商城列表用一支 RPC 或 `products + inner join tiers` 篩選

## 變更檔
- `supabase/migrations/*` 建表與 RLS
- `src/types/product.ts`（新型別）
- `src/lib/wholesale-pricing.ts`（新檔）
- `src/components/products/ProductFormDialog.tsx`（階梯編輯）
- `src/routes/shop.wholesale.tsx`（新檔）
- `src/routes/shop.product.$id.tsx`（顯示階梯 + 套用價）
- `src/hooks/use-cart.tsx`（套用階梯價）
- `src/components/shop/StorefrontHeader.tsx`、`MobileBottomNav.tsx`（導覽）
