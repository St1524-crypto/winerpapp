
## 目標

依上傳的四份範本（日獎金總表分開 / 日獎金總表合計 / 月獎金總表 / 月獎金明細分開.pdf），在後台新增可查詢、可列印、可匯出的「VIP 會員日/月獎金總表與明細」頁面。不改變獎金業務邏輯，只做展示與匯總，資料來源為既有 `bonus_records` 與 `calculation_detail`（已於 20260713 完成歷史回填）。

## 一、頁面規劃

新增 4 個後台路由（皆置於 `_authenticated/admin/bonuses/*`，沿用既有權限守衛）：

1. `/admin/bonuses/daily-summary-split` — 日獎金總表（分開）
2. `/admin/bonuses/daily-summary-merged` — 日獎金總表（合計 1）
3. `/admin/bonuses/monthly-summary` — 月獎金總表
4. `/admin/bonuses/monthly-detail-split` — 月獎金明細（分開，一位會員一頁）

四頁共用篩選：`日期區間 / 月份`、`會員編號`、`姓名`、`證號別`、`是否有效 VIP`。工具列：`列印`、`匯出 XLS（HTML table 相容格式，符合範本）`、`匯出 PDF（月明細）`。

## 二、欄位對齊（依範本檔頭實測）

### 日獎金總表（分開 / 合計）欄位
`會員編號、姓名、身份証號、証號別、推薦獎金、組織對碰、升級分紅、消費回饋、報件獎金、獎金合計、5%稅、10%稅、健保費、小計、地址`

- 分開版：同一會員若同天有多筆 `bonus_type`，各佔一列
- 合計版：同一會員同期間彙總為一列

### 月獎金總表欄位
`會員編號、姓名、身份証號、証號別、重消獎金、超額獎金、超額對等、推薦王獎金、重消回饋、達成分紅、全國分紅、分球分紅、車馬津貼、應付應扣、獎金合計、5%稅、10%稅、健保費、小計、地址`

### 月獎金明細分開（PDF 型式，每會員一頁）
表頭區塊：
- `應發獎金 = 重消獎金 + 超額獎金 + 超額對等 + 推薦王獎金 + 重消回饋 + 達成分紅 + 全國分紅 + 全球分紅 + 車馬津貼 + 專員獎金 + 營業分紅 + 小組獎金`
- `實領獎金 = 應發獎金 − 營業稅 − 健保費 − 其他扣款 + 其他應付 − 購物錢包`

子表：
- `重消獎金明細`：會員名稱 / 會員編號 / PV / 台幣 / 獎金% / 代數 / 獎金 / 訂單編號
- `超額獎金明細`：同上欄位
- `專員獎金明細`：同上欄位
- 各子表底部顯示小計

## 三、資料來源與對應（不改業務邏輯）

從 `bonus_records` 拉，以 `calculation_detail` 為主要來源（歷史筆已回填 `backfill_mode = derived_from_existing_bonus_records`）。欄位對應：

| 範本欄位 | 來源 |
|---|---|
| 會員編號/姓名/身份証號/地址/証號別 | `profiles.member_no / name / national_id / address / entity_type` |
| 推薦獎金 | `bonus_type = 'referral'` 之 `bonus_points` |
| 組織對碰 | `bonus_type = 'pairing'` |
| 升級分紅 | `bonus_type = 'upgrade_share'` |
| 消費回饋 | `bonus_type = 'repurchase_cashback'` |
| 報件獎金 | `bonus_type = 'new_case'` |
| 重消獎金 / 超額獎金 / 超額對等 / 推薦王 / 達成分紅 / 全國分紅 / 分球分紅 / 車馬津貼 | 月結 `bonus_type` 對應 code（詳附錄） |
| 應付應扣 | `calculation_detail.adjustment` |
| 獎金合計 | 各項加總 |
| 5%稅 / 10%稅 / 健保費 | 依 `profiles.entity_type` 與現行稅務規則計算（僅顯示，不寫回） |
| 小計 | 獎金合計 − 稅 − 健保費 |

若同名 `bonus_type` 代碼在 DB 與範本不完全一致，一律以既有 `bonus-labels.ts` 為準；不確定的欄位以 0 顯示，不亂補資料。

## 四、技術實作

### Server 層（`src/lib/bonus-report.functions.ts`，新檔）
- `listDailyBonusSummarySplit({ from, to, filters })`
- `listDailyBonusSummaryMerged({ from, to, filters })`
- `listMonthlyBonusSummary({ yyyymm, filters })`
- `getMonthlyBonusDetailByMember({ memberId, yyyymm })` — 回傳明細三子表 + 合計
- 全部走 `createServerFn` + `requireSupabaseAuth` + `has_role('admin' | 'super_admin' | 'finance')`

### Client 層
- 共用 `<BonusReportTable />`：支援 sticky header、tabular-nums、`列印` (`window.print()` + `@media print` CSS 隱藏側欄)、`匯出 XLS`（前端用 `<table>` 轉 `application/vnd.ms-excel`，直接產出範本相容 .xls）
- 月明細用 `<MonthlyBonusDetailReport />`：每位會員為一個 `page-break-after: always` 區塊，格式對齊 PDF
- 查詢面板：`BonusFiltersCard`（已存在，擴充月份 picker）

### 不動
- 不改 `bonus_records` / `calculation_detail` 結構
- 不觸發任何日結/月結/發放/重算
- 不修改稅務與健保計算的既有邏輯（若目前 DB 無此欄位，暫以「合計 × 稅率」的展示公式呈現，並在頁面標註「稅額為報表估算，不影響實際發放」）

## 五、驗收

1. 三份總表匯出的 .xls 用 Excel 開啟，欄位順序與範本 1:1 一致
2. 月明細 PDF 匯出後與 `月獎金明細分開.pdf` 版面同結構（表頭區 + 三子表 + 各小計）
3. 篩選 `TW17H00032` 2026-06 月明細，`應發獎金 6,355 / 小計 6,540` 對得上 PDF 第 1 頁
4. 無新增/修改任何 bonus_records、wallet、point_transactions

## 附錄：待你確認的欄位對應

以下範本欄位在 DB 沒有一比一 `bonus_type` 代碼，實作前請確認：

- 月表「超額對等 / 推薦王獎金 / 全國分紅 / 分球分紅 / 車馬津貼 / 應付應扣」對應到哪個 `bonus_type` 或 `calculation_detail.*` 欄位？
- 稅（5% / 10%）與健保費是否需要從既有 payroll 表拉、或本頁純展示估算即可？

回覆後即進實作。
