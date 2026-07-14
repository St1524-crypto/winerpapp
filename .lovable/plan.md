## 目標

一星～七星、董事：把原本的「消費回饋上限」制度改為「營業分紅上限」，並按「營業分紅池」的星級共享比例每日發放。

## 需釐清（請回覆再開工）

1. **上限金額**：目前資料表 `vip_tiers.upgrade_bonus_cap` 已存各階級上限（V1: 88,000 / V2: 268,000 / V3: 368,000 / V4: 468,000 …）。改名為「營業分紅上限」後：
   - (a) 沿用現有數字，僅改語意/名稱？
   - (b) 需要重新設定？（請提供新數字）

2. **星級共享比例**：每日從「營業分紅池」按比例發放給 V1～V7＋董事。目前系統中是否已有這個比例設定表？還是本次要新建？如新建，請提供各星級占比（例：V1=10%、V2=15%、…、董事=25%）。

3. **每日發放來源**：
   - (a) 池子每日餘額 × 星級占比 ÷ 該星級人數 → 平均分配給該星級每位會員？
   - (b) 還是其他分配邏輯？

4. **原「消費回饋」是否停用**：改為營業分紅後，一星以上是否**完全不再**發放 `business_bonus`（消費回饋），只領營業分紅？還是兩者並存但共用同一上限？

## 實作範圍（待確認後執行）

### DB migration
- `vip_tiers`：欄位改名 `upgrade_bonus_cap` → `revenue_bonus_cap`（或新增，保留舊欄位相容）
- 新增 `vip_revenue_share_ratios` 表（tier_code, ratio, effective_from）— 若尚無
- 新增 `vip_revenue_bonus_ledger`（沿用現有 `vip_upgrade_bonus_ledger` schema，改語意）
- 新增 RPC `distribute_daily_revenue_bonus(_date)`：讀取當日池餘額 → 按星級比例 → 逐會員派發，遇個人「營業分紅上限」自動截斷
- pg_cron 每日觸發

### 後端 server functions（`src/lib/`）
- `vip-revenue-bonus.functions.ts`：手動觸發、預覽、查詢明細
- 修改 `points.functions.ts` 內原 upgrade cap 判斷 → 沿用（僅名稱調整）

### 前端
- `admin.vip-upgrade-bonus-cap.tsx` 已為「VIP 營業分紅上限管理」，補上「每日派發預覽/紀錄」區塊
- `admin.vip-tiers.tsx` / `dealer-tiers.tsx`：欄位標籤「消費回饋上限」→「營業分紅上限」
- Sidebar 已為「VIP 營業分紅上限」，不動

## 技術細節
- 每日 cron: `SELECT cron.schedule('daily_revenue_bonus', '5 0 * * *', $$SELECT public.distribute_daily_revenue_bonus(CURRENT_DATE - 1)$$)`
- 冪等：ledger 加 `(distribution_date, member_id)` unique
- 截斷仍走 `vip_upgrade_bonus_ledger` 的 cap 檢查邏輯（total_before/after/capped_amount 已就緒）
