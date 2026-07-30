## 目標

後台可建立「多件可加贈品」規則，官網商城與批發/B2B 下單時自動依倍數累加贈品，贈品 0 元且不計入獎勵點與分紅基數。

## 一、資料表

**gift_rules（贈品規則）**
- 名稱、啟用狀態、生效起訖日
- 觸發類型：單一商品件數 / 訂單總件數 / 訂單金額 / 指定商品群組件數
- 門檻值（threshold）
- 適用通路：商城、批發B2B（可複選）
- 每張訂單贈品上限（max_gift_qty，0 = 不限）
- 優先順序、company_id（多租戶）

**gift_rule_conditions（觸發商品範圍）**
- 規則 id、product_id（單一商品或群組成員清單）

**gift_rule_gifts（贈品內容）**
- 規則 id、贈品 product_id、每次達標贈送數量

**sales_order_items 既有欄位加註**
- 新增 `is_gift boolean default false`、`gift_rule_id`
- 贈品列：unit_price = 0、reward_points = 0

RLS：管理/業務角色可維護；商城前台以 anon/authenticated 唯讀啟用中的規則。

## 二、計算邏輯（共用模組）

`src/lib/gift-rules.ts`：輸入購物車明細 → 輸出應贈清單。
- 倍數累加：`floor(符合數量 / threshold) × 贈送數量`，再套 max_gift_qty 上限
- 金額型：以未含贈品的小計計算
- 多規則可同時成立，各自累加；同贈品合併數量
- 贈品本身不參與任何規則的門檻計算

## 三、串接點

- 購物車 / 結帳頁（`use-cart.tsx`、`shop.checkout.tsx`）：即時顯示「已達標，加贈 X」與「再買 N 件可再加贈」提示
- 建單（`create_sales_order_with_items`）：伺服器端重算贈品，不信任前端；贈品列以 0 元 0 獎勵點寫入
- 批發/B2B 下單流程共用同一模組

## 四、獎勵點與分紅

贈品列 `reward_points = 0`，因此：
- 不進日結消費／營業分紅池基數
- 不影響責任額、級差獎金計算
- 訂單詳情的「獎勵點明細」會標示贈品列為 0 並註明來源規則

## 五、後台頁面

`/admin/gift-rules`
- 規則列表（名稱、觸發條件摘要、贈品、通路、啟用狀態、期間）
- 新增/編輯彈窗：條件設定 + 商品搜尋選擇（沿用既有 SearchSelect）+ 贈品清單
- 規則試算器：輸入品項與數量，預覽會贈出什麼

## 六、實作順序

1. Migration：三張表 + GRANT + RLS + sales_order_items 欄位
2. `gift-rules.ts` 計算模組 + 單元測試（含倍數、上限、多規則）
3. 後台 CRUD 頁面
4. 購物車/結帳提示
5. 建單伺服器端重算與寫入
6. 只讀驗證：測試單確認贈品 0 元、獎勵點與池基數不受影響

## 技術備註

- 建單重算放在 `create_sales_order_with_items`（或其前置 server fn），避免前端竄改
- 訂單編輯／退貨時贈品需連動處理：主商品數量減少低於門檻時，同步移除對應贈品
