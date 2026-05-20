## 目標
讓系統在手機上（<768px）也能流暢操作，重點優化訂單、表格、後台導覽與商城前台。

## 範圍與作法

### 1. 後台訂單頁 `/orders`（src/routes/_authenticated/orders.tsx）
- 列表：手機改為「卡片式」呈現（單號、客戶、金額、狀態、日期），點卡片進入詳情；桌機維持原表格。
- 詳情 Dialog：手機改為全螢幕（`max-w-full h-[100dvh] rounded-none`），內容區可滾動。
- 金流紀錄：手機改為堆疊式卡片（日期/方式/狀態下拉/金額），避免水平滾動。
- 動作按鈕（PDF、列印、更新狀態）：手機改為底部 sticky bar 或下拉選單。

### 2. 全站表格 RWD（通用模式）
- 為主要列表頁（products、purchases、receiving、inventory、b2b.accounts、finance.* 等）的 `<Table>` 外層加 `overflow-x-auto -mx-4 px-4` 讓表格可橫向滑動。
- 不重寫所有表格為卡片，採「桌機 table / 手機 list」混合策略只在 orders 完整實作示範；其他頁面加上橫向滑動 + min-w 即可。

### 3. 後台側邊欄與導覽（src/components/AppSidebar.tsx / AppHeader.tsx / _authenticated.tsx）
- 確認 `SidebarTrigger` 在手機 header 永遠可見（已在 AppHeader）。
- 手機改用 `collapsible="offcanvas"`（已是 sidebar 預設行為），搜尋框在手機隱藏（已是 hidden md:flex）— 補上手機版搜尋 icon 按鈕（可選）。
- header 上「管理員/營運模式」按鈕在手機只顯示 icon（已 `hidden sm:inline`）— OK。
- 新增「手機底部快捷導覽」：在 `_authenticated` layout 加一個 `md:hidden` 的固定底欄，含 4 個常用入口（Dashboard、Orders、Products、Menu→開啟 sidebar），main 加 `pb-20 md:pb-0`。

### 4. 商城 (shop) 前台
- StorefrontHeader：手機已有搜尋列，補上 hamburger 開啟 Sheet 顯示分類連結（目前 Menu 按鈕無 onClick）。
- 商品列表 / 商品詳情：確認 grid 在手機是 2 欄、padding/字級調整。
- CartDrawer：確認手機可全寬。

## 技術細節
- 使用 `useIsMobile()` 判斷斷點時要避免 hydration mismatch；改用 Tailwind `md:` 響應式類別優先，僅互動性差異才用 hook。
- Dialog 全螢幕：`DialogContent` 加 `className="sm:max-w-2xl max-w-full h-[100dvh] sm:h-auto rounded-none sm:rounded-lg"`。
- 卡片化表格用 `<div className="md:hidden space-y-2">…</div>` + `<div className="hidden md:block"><Table>…</Table></div>`。
- 底部導覽用 `fixed bottom-0 inset-x-0 z-40 md:hidden border-t bg-background/95 backdrop-blur`，4 欄 grid。

## 不在範圍
- 不改業務邏輯、API、資料表。
- 不重寫所有列表為卡片（只 orders 全面卡片化，其他保留 table + 橫向滑動）。
- 不動 PDF/列印輸出格式。
