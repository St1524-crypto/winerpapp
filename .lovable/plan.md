# 會員分紅資格「手動授權」功能

在後台會員管理中，管理員可直接勾選讓某位會員「可參與消費回饋」與「可參與營業分紅」，
授權期間預設 3 個月（可自行調整起訖日），期間內不需符合任何原本的資格條件。

## 使用情境

1. 進入會員管理 → 編輯會員。
2. 新增「分紅資格授權」區塊：
   - 勾選「可參與消費回饋（V/S/T/E/A 池）」
   - 勾選「可參與營業分紅（星級／董事池）」
   - 授權起日（預設今天）、授權迄日（預設今天 +3 個月，可改）
   - 備註（授權原因）
3. 儲存後，列表可看到授權標記與到期日；到期自動失效，不需人工取消。

## 規則

- 授權期間內：該會員在對應分紅池的每日結算中一律視為合格，跳過 90 天推薦 1 名 VIP、
  星級推薦 1 名 E-VIP 等所有條件。
- 位階仍沿用會員現有位階（授權只解除「條件」，不改變位階與分配比例）。
- 授權過期或取消勾選後，回復原本條件判定。
- 每筆授權變更都寫入稽核紀錄（誰、何時、對誰、哪個池、期間）。

## 技術細節

資料庫：
- 新增 `public.member_bonus_eligibility_grants`：`user_id`、`pool_kind`（`consumption` / `business`）、
  `starts_on`、`ends_on`、`reason`、`created_by`、時間戳；同一會員同一 pool_kind 僅一筆有效授權。
- GRANT + RLS：管理員／財務可讀寫，會員可讀自己的；service_role 全權。
- 新增 `private.has_bonus_grant(_user_id, _pool_code, _on)`，依 pool code 對應 pool_kind
  （`POOL_VSTEA` → consumption；`POOL_123` / `POOL_67D` → business）判斷日期是否落在授權區間。
- 修改 `private.list_pool_eligible_members`：在既有條件判定外，`OR has_bonus_grant(...)`，
  被授權者一併納入合格名單，`tier_mapping_source` 標記為 `manual_grant` 方便對帳。

後端：
- `src/lib/members-admin.functions.ts` 新增 `adminSetBonusEligibilityGrant`（admin/super_admin 檢查、
  寫入或撤銷授權、寫 audit_logs）與 `adminListBonusEligibilityGrants`。

前端：
- 會員編輯對話框（`src/routes/_authenticated/members.tsx`）新增「分紅資格授權」區塊：兩個 checkbox
  ＋ 起訖日期欄位（勾選時自動帶入今天與 +3 個月）＋ 備註。
- 會員列表加上小徽章顯示目前有效授權與到期日。

## 不在此次範圍

- 不調整分紅比例、上限或位階邏輯。
- 不做批次授權（先以單一會員操作為主，後續可再加）。
