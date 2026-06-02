
# 獎金結算與獎勵點發放系統

依需求拆成四個層面：**資料層 → 結算引擎 → 後台管理 → 會員端**。考量範圍很大，建議分階段交付，本計畫先一次性把資料表與結算/發放核心邏輯落地，再做 UI；以下為完整建置藍圖。

---

## 一、資料庫設計（一次 migration 完成）

### 1. 設定表

- **bonus_settings**（單列設定）
  - daily_bonus_auto_enabled `bool` default true
  - daily_bonus_cycle_days `int` default 1（1/2/3/7/自訂）
  - daily_next_settlement_at `timestamptz`
  - monthly_bonus_mode `text`（auto / manual）
  - monthly_bonus_settlement_day `int` default 1
  - vip_required_points `int` default 200
  - reward_release_days `int` default 7
  - reward_release_mode `text`（auto / manual）

- **repurchase_bonus_settings**（每代一列）
  - generation_level `int`（1, 2, …）
  - bonus_rate `numeric` default 10
  - enabled `bool` default true

- **rank_rebate_settings**（每位階一列）
  - rank_code `text`（vip / svip / tvip / 自訂）
  - rank_name `text`
  - required_points `int`（該位階責任額）
  - exceeded_rebate_rate `numeric`
  - enabled `bool`
  - 預設種子：VIP 200/5%、SVIP 200/8%、TVIP 200/10%

### 2. 業績/結算表

- **bonus_records**：所有獎金的最小單位
  - member_id（領取人）、source_member_id（產生來源會員）、source_order_id
  - bonus_type `text`：`referral` | `repurchase` | `monthly_vip` | `rank_rebate`
  - generation_level `int nullable`（復購用）
  - base_amount `numeric`（來源訂單金額；月獎金存當月責任額）
  - bonus_rate `numeric`、bonus_points `int`
  - required_points_checked `bool`、required_points_passed `bool`
  - status `text`：`pending | settled | waiting_release | released | cancelled | failed`
  - settlement_batch_id `uuid nullable`、settlement_date `date`
  - release_date `date`（=settlement_date + reward_release_days）
  - released_at `timestamptz`

- **bonus_settlement_batches**
  - settlement_type `text`：`daily | monthly`
  - settlement_period_start/end、total_members、total_bonus_points
  - status `text`：`processing | completed | failed`
  - created_by, created_at, completed_at

- **reward_wallet_logs**
  - member_id, bonus_record_id, points, type（earn/cancel）, status, description

所有表加 GRANT + RLS（會員只讀自己；admin/finance 角色完整存取，沿用既有 `has_role`）。

---

## 二、結算引擎（TanStack server functions）

放在 `src/lib/bonus.functions.ts` + `bonus.server.ts`：

### A. 日結算 `runDailySettlement(period)`
1. 撈 `bonus_records` where `bonus_type IN ('referral','repurchase','rank_rebate')` AND `status='pending'` AND `created_at` 在週期內。
2. 推薦獎勵 → 不檢查責任額直接 settled。
3. 復購、位階回饋 → 一同進入。
4. 建立 batch，更新 `status='waiting_release'`、寫入 `settlement_date`、`release_date = today + reward_release_days`。

### B. 月結算 `runMonthlySettlement(yyyymm)`
1. 撈當月所有 VIP（`is_vip=true` 且 `vip_expires_at >= 月末`）。
2. 計算每位 VIP 當月個人責任點數（推薦/復購/購物加總 — 沿用既有 `point_transactions`）。
3. 達 `vip_required_points` → 建立 `bonus_type='monthly_vip'` 的 bonus_record。
4. **超過責任額部分**：依會員位階 → `rank_rebate_settings.exceeded_rebate_rate` 計算 → 建立 `bonus_type='rank_rebate'` record，回饋給自己。
5. 未達者寫 record 但 `status='cancelled'`、required_points_passed=false（保留未達標原因供會員端查詢）。

### C. 復購觸發 `onOrderPaid(orderId)`
- 在訂單付款時呼叫（擴充既有 `referral.functions.ts` 的結算流程）。
- 順著 `profiles.referred_by` 上溯找第 1、2 代推薦人。
- 依 `repurchase_bonus_settings` 比例寫入 `bonus_records(status='pending')`。
- 「是否為復購」：該買家已有過 paid 訂單 → 視為復購。

### D. 發放 `releaseRewards(mode)`
- 自動：每日 cron 撈 `status='waiting_release' AND release_date<=today` → 入錢包（`applyDelta(reward)` 沿用 `points.functions.ts`） → `status='released'`，寫 `reward_wallet_logs`。
- 手動：admin 勾選 record ids 批次發放。

### E. 排程
- 用 `pg_cron` 每日 00:10 呼叫 `/api/public/hooks/bonus-daily-tick`，內部判斷是否到 `daily_next_settlement_at` / 月結日 / 自動發放。

---

## 三、後台 UI（`/admin/bonus-center`）

單一入口頁 + Tabs：
1. **日獎金設定**（開關、週期、下次結算、立即結算）
2. **月獎金設定**（mode、結算日、責任額預設）
3. **復購設定**（每代比例表格）
4. **位階回饋**（rank_rebate_settings CRUD）
5. **發放設定**（reward_release_days、mode）
6. **結算紀錄**（batches 列表 + drill down 明細）
7. **發放紀錄**（reward_wallet_logs）
8. **會員獎金明細**（搜尋會員 → bonus_records）
9. **手動結算/手動發放**按鈕
10. **匯出 Excel**（CSV 下載）

權限：`super_admin | admin | finance`。

---

## 四、會員端（`/my-rewards`）

Tabs：
- 日獎金明細（推薦/復購/位階回饋）
- 月獎金明細（含未達標原因 = 顯示當月責任額 vs 門檻）
- 責任額進度條（當月已累積 / 預設 200）
- 等待發放列表（含預計發放日）
- 已發放列表

---

## 五、技術重點

- 結算冪等：`bonus_records` 對 `(source_order_id, member_id, bonus_type, generation_level)` 加唯一鍵，避免重複。
- 月獎金冪等：對 `(member_id, bonus_type='monthly_vip', settlement_period_start)` 唯一鍵。
- 所有結算邏輯走 `supabaseAdmin`（server fn 內），bypass RLS 確保跨會員寫入。
- cron 使用 `project--8759c219-ed53-49ec-b52a-60a002da48ec.lovable.app` 穩定網域。

---

## 六、交付分階段建議

**Phase 1（本次）**：資料表 + 結算/發放 server functions + cron + 後台「日獎金設定 / 結算紀錄 / 手動結算 / 手動發放」最小可用面板。
**Phase 2**：月獎金完整 UI、位階回饋管理、復購比例設定、會員端 `/my-rewards`。
**Phase 3**：Excel 匯出、進階查詢、未達標通知。

---

## 詢問

1. **「責任額」定義**：每月個人累計的「獎勵點 reward_points 入帳量」嗎？還是另算「訂單實付金額 ÷ 某係數」？這會影響月獎金與位階回饋的計算來源。
2. **月獎金金額**：規格中只提到「達 200 點可領」，但沒明說領多少。是否＝「當月個人責任額 × 某比例」、或固定獎金、或「下線業績的 X%」？
3. **復購定義**：買家「第 2 筆以上 paid 訂單」即視為復購？還是同商品再次購買？
4. **Phase 1 範圍同意嗎？** 若是，我下一步就送出 migration（資料表 + RLS + 種子資料）等你確認後即可繼續寫程式。
