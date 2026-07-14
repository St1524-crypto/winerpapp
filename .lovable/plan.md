# 訂單獎勵點重算 — 實作計畫

## 目標
以「品項規則 × 數量」為基礎重算每筆訂單的獎勵點，並依 VIP 獎金參數（消費回饋上限、營業分紅上限、日月獎金規則、復購位階分潤）自動對齊「本單產生獎勵點」的前後台顯示。**不動任何 DB / 不改實際發放邏輯**，只做「計算 + 顯示」層。

## 範圍

### 新增：純函式計算模組
`src/lib/order-reward-calc.ts`（含 vitest）
- `computeItemUnitReward(item, productRewardsMap)` — tier_reward_points 優先，fallback products.reward_points
- `computeItemsRewardSubtotal(items, map)` — Σ(unit × qty)
- `computeOrderRewardBreakdown({ itemsSubtotal, buyerVipActive, referrerChain, capsByLevel, bonusRates })`
  - 買家為有效 VIP：回傳 `{ kind: "buyer", points }`
  - 買家非有效 VIP：套用 `computeBasePoints`（已存在於 `referrer-reward-distribution.ts`）產生每代分潤，套用 `computeLevelPayable` 得到 payable，並以 `formatBuyerMarkerNote`/`formatLevelNote` 產生說明字串
  - 回傳格式：`{ kind: "referrer", totalDistributed, levels: LevelDistribution[], note }`
- 100% 複用既有 `referrer-reward-distribution.ts`，不重寫 cap 演算法

### 新增：查詢 hook
`src/hooks/use-order-reward-preview.ts`
- 讀取：`repurchase_bonus_settings`（分潤比率）、買家 `vip_memberships` 是否有效、若非有效再讀 profiles.referrer chain 與各代 `vip_business_bonus_cap` / `vip_upgrade_bonus_cap` 剩餘額度（透過既有的 read query，不新增 RPC）
- 只在 admin / 會員訂單詳情頁 enabled，避免 shop 首頁多打 API
- 回傳 `RewardBreakdown` 給 UI 使用

### 修改：三個顯示點
1. `src/routes/_authenticated/orders.tsx`（admin 訂單詳情）
   - 沿用剛加入的「增加獎勵點」欄位，總結欄改用 hook 產生的 `RewardBreakdown`
   - 顯示：「本單產生獎勵點 +N 點」+ 副字說明（買家/推薦人分潤、cap 觸發原因）
   - `rewardPointsIssued` vs `computed` 差異：兩者都顯示，差異時附提示

2. `src/routes/shop.account.orders.$id.tsx`（前台會員訂單詳情）
   - 加入相同總結區塊（不改表格既有欄位）
   - 若 breakdown 為 referrer，顯示「本次獎勵點依復購位階發放至推薦人（明細）」

3. `src/routes/shop.checkout.success.$id.tsx`（結帳成功頁）
   - 現有 `resolveRewardNotice` 保留，只在有 `computed` 且與 issued 不同時多顯示「預估 vs 實發」提示行

### 差異處理策略
- 主要數字 = 重算值（品項規則）
- 若已有 `point_transactions` 實發紀錄，並排顯示「實發 N 點」+ 差異原因 tag（消費回饋上限 / 營業分紅上限 / 上線非有效 VIP）
- 差異原因文字來自 `formatLevelNote`，不新造字串

## 不做
- 不新增 DB 欄位/migration
- 不改 `points.functions.ts` 實際發放邏輯
- 不改結帳 server function
- 不動退貨/退款相關獎勵回收
- 不 publish

## 驗證
1. `bunx vitest run src/lib/order-reward-calc.test.ts`
2. tsgo 通過
3. 抽查 3 筆訂單（買家 VIP / 買家非 VIP 有推薦人 / 買家非 VIP 無有效上線）在 admin + 會員頁顯示是否一致

## 檔案清單
- 新增 `src/lib/order-reward-calc.ts`
- 新增 `src/lib/order-reward-calc.test.ts`
- 新增 `src/hooks/use-order-reward-preview.ts`
- 修改 `src/routes/_authenticated/orders.tsx`
- 修改 `src/routes/shop.account.orders.$id.tsx`
- 修改 `src/routes/shop.checkout.success.$id.tsx`
