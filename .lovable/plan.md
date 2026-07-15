
## 批次範圍（本批只做這些；月獎金/專員/全國分紅擴充/後台設定 UI 留待下一批）

依 0715-2 規格，只影響 `settlement_date >= <migration 通過當日>` 起新產生的 bonus_records，不追溯歷史。

## A. Migration（單一 migration，含以下）

1. **`bonus_records.calculation_detail` schema 規範（jsonb，欄位由 RPC 寫入）**
   必填 key：`source_reward_points`、`self_points`、`first_generation_points`、`total_base_points`、`excess_points`、`required_points`、`responsibility_passed`、`tier_snapshot`、`vip_snapshot`、`rule_id`、`rule_version`、`redirect_chain`、`cap_snapshot`。
   新增 CHECK：`settlement_date >= '2026-07-16'` 時 `calculation_detail ? 'rule_version'`（軟性驗證，避免未寫入）。

2. **`vip_tiers` 條件對齊規格**
   確認/補齊欄位：`tier_code`、`name`、`required_points`、`direct_vip_count`、`renew_days`、`renew_required_vip`、`renew_required_tier`(給 S→T→E 那種「直推 3 位 S」用)。
   以 `INSERT ... ON CONFLICT DO UPDATE` upsert V/S/T/E/A/一星~七星/董事 12 筆位階（不動歷史升級紀錄）。

3. **系統參數：`system_settings` 加一列 `bonus_rules_effective_from = 2026-07-16`**，RPC 讀此值決定新舊制切點。

## B. 新獎金核心 RPC（Postgres function）

新增 `public.daily_bonus_tick_v2(_settlement_date date)`，由 `daily_bonus_tick` wrapper 判斷：
- `_settlement_date < bonus_rules_effective_from` → 呼叫舊版（不動）
- 否則 → 呼叫 v2

v2 內部四支子函式，每支結束後寫入 `bonus_records` + `calculation_detail`：

1. `_calc_referral_v2` — 推薦/首購。來源訂單獎勵點 × 領取人階級比例（V10/S20/T25/E40/A50），級差扣減。失效領取人往上找有效 VIP，記 `redirect_chain`。
2. `_calc_repurchase_v2` — 復購。復購訂單獎勵點 × 階級比例；責任額未達 → `responsibility_passed=false`、`bonus_points=0`、狀態 `skipped`。
3. `_calc_business_bonus_v2` — 營業分紅。沿用 `vip_bonus_pools` / `vip_business_bonus_ledger`，只補：
   - VIP 有效性三檢查
   - 總收益超上限 → `cap_snapshot.blocked=true`、`bonus_points=0`
   - 完成責任額才計入
4. `_calc_daily_revenue_bonus_v2` — 消費回饋（E/A）。沿用 `vip_daily_revenue_bonus_ledger`；補：
   - 上限含累計總收益判斷
   - 180 天未推薦 1 位 VIP 停發（`skip_reason='no_referral_180d'`）

VIP 三檢查抽出 helper `private.is_vip_valid(_member_id uuid, _on date)`：`is_vip AND vip_expires_at IS NOT NULL AND vip_expires_at >= _on`。

**重要保證**：所有子函式僅 `INSERT` 新列到 `bonus_records`，絕不 `UPDATE` 歷史列、絕不 `DELETE` `reward_wallet_logs` / `point_transactions`。已發放者以 `settlement_date` + `bonus_type` unique key 防重複。

## C. 前端：每日獎金明細顯示

`src/routes/_authenticated/admin.bonuses.daily-details.tsx` + `BonusCalculationDetailDialog.tsx`：
- 表格新增欄位：來源獎勵點、責任額、是否完成責任額、VIP 到期日、停發原因、改發原因
- Dialog 內顯示完整 `calculation_detail` JSON（含 tier_snapshot / vip_snapshot / cap_snapshot / redirect_chain / rule_version）
- CSV 匯出補齊上述欄位

`src/lib/bonus.functions.ts` `listDailyBonusDetails` 回傳補上 `vip_expires_at`、`responsibility_passed` 等衍生欄位。

## D. 不做（本批）
- 月獎金 4 種、全國分紅擴充：下一批
- 後台四個設定模組 UI：下一批（只在 DB 對齊 schema，不動管理頁）
- 月獎金明細、獎金總表 UI：下一批
- 不追溯 / 不重算歷史 bonus_records
- 不覆寫 reward_wallet_logs / point_transactions

## E. 驗收
1. Migration 通過後於 `2026-07-16` 前設定日期 → 走舊版；`2026-07-16` 及之後 → 走 v2 且 calculation_detail 有 rule_version。
2. Build / typecheck / security scan 全綠。
3. Handoff 依 mem://preferences/lovable-handoff 回報 A~K。

---

**確認即開工**。批准後我會：
(1) 先送 migration（含 vip_tiers upsert + system_settings + calculation_detail 規範 + v2 RPC），等你核准；
(2) migration 通過後再改前端 + wrapper。
