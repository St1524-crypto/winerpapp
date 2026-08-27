---
name: vip-upgrade-rules
description: winerp 制度升級條件（VIP/星級升級門檻、獎勵點、輔導與續約條件）的權威規則與變更流程。當要求查詢、報告或修改升級條件、vip_tiers 參數、責任額、上限時使用。
---

# 制度升級條件（VIP Upgrade Rules）

## 鐵則

1. **任何條件變更前必須先取得使用者明確確認。** 先以只讀查詢列出「現值 → 目標值」對照表，等待使用者回覆確認後才可執行 migration 或 SQL 寫入。使用者只描述問題、要求報告、或語意模糊時，一律視為「未確認」。
2. **參數由後台超級管理員維護。** 制度數值應可在 `/dealer-tiers`、`/admin/vip-tiers` 等後台頁面由 `super_admin` 修改；不要把數值寫死在程式碼中。新增參數時同步提供後台編輯欄位。
3. 只讀報告永遠安全，可直接執行。

## 資料來源（權威表）

| 內容 | 資料表 |
|---|---|
| 階級升級條件、日獎金費率、上限 | `public.vip_tiers` |
| 位階超額回饋、責任額 | `public.rank_rebate_settings` |
| 月達成分紅階梯 | `public.monthly_tier_bonus_settings` |
| 複購獎金代數 | `public.repurchase_bonus_settings` |
| 消費分紅池 | `public.vip_bonus_pools`、`member_bonus_eligibility_grants` |
| 全國分紅 | `public.national_bonus_pool_settings` |
| 結算參數 | `public.bonus_settings` |

只讀彙整頁：`/admin/system-rules`（`getSystemRuleSheet`，限 super_admin / admin / finance）。

## 現行制度基準（變更需確認）

- 升級累積獎勵點：V 800、S 3,500、T 9,000、E 21,000、A 35,000；一星以上為組織條件。
- 直推／輔導：S 直推10；T 直推20 + S×3；E 直推30 + T×3；A 直推50；一星 E×3；二/三/四星 一星×2/3/4；五星 四星×2；六/七/董事 前一階×1。
- 日推薦級差＝升級推薦：V 5%、S 10%、T 20%、E 40%、A 50%、一星～董事 50%（級差無上限）。
- 消費回饋個人費率全階 0%；改由 `POOL_VSTEA`（active、5%、平均分配）發放，tier_codes = E、A，現行 19 位名單制。
- 營業分紅：V～A 0%；一星～董事 5%。累積上限：E／A 不適用（0）；一星 88,000、二星 268,000、三星 368,000、四星 468,000、五星 1,568,000、六星 2,668,000、七星 3,768,000、董事 5,868,000。
- 月責任額：VIP 級 200 點、一星～董事 300 點。續約：180 天內新增 1 位。
- 全國分紅（月結）：五星～董事各 2%，月上限 20萬／30萬／40萬／50萬。
- 發放拆分：80% 現金錢包、20% 貢獻點。

## 執行流程

1. 讀取相關表現值（`supabase--read_query`，單一語句）。
2. 產出「項目 / 現值 / 目標值 / 影響範圍」對照表給使用者。
3. **等待確認。**
4. 確認後以 `supabase--migration` 更新（不要用 run_sql 做制度異動）。
5. 重新查詢驗證，回報結果並附 Lovable handoff 區塊。

## 常見陷阱

- `vip_tiers` 欄位名易記錯：先查 `information_schema.columns` 再寫查詢。
- 星級以 `dealer_tier_status.user_id`（非 member_id）關聯。
- 不要在同一次呼叫送多語句 SQL 給 read_query。
