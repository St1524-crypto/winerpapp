# 第六週開發計畫：財務 / AI / BI / 自動化

本週範圍極大（19 大區塊、近 50 個檔案、8 張新資料表 + 多項 AI/自動化功能）。為確保品質與可審查性，將分 **4 個 Stage 交付**，每個 Stage 完成後可立即試用。

---

## Stage 1 — 財務核心 + Schema 基礎建設

**Migration（一次性建立全部新表）**

```text
finance_transactions     收支總帳（income/expense, category, payment_method, account_id, reference）
accounts_receivable      應收帳款（綁 business_account, invoice_no, due_date, paid/unpaid/overdue）
accounts_payable         應付帳款（綁 vendor, bill_no, due_date, status）
invoices                 發票（綁 sales_order, invoice_type 二聯/三聯/個人, tax_id, status）
bank_accounts            銀行帳戶（多帳戶 + 餘額）
companies                多公司（company_name, tax_id, status）
company_members          公司成員（user_id, company_id, role）— 為 SaaS 多租戶預留
automation_workflows     自動化規則（trigger_type, action_type, config jsonb, status）
automation_runs          自動化執行紀錄
api_keys                 API 金鑰（hashed key, scopes, last_used）
ai_logs                  AI 分析結果歷史
notification_rules       智能通知規則
```

全部含 RLS：
- 財務/發票表 → `finance` + `super_admin` 可管理；`sales` 可讀本身負責的單。
- API keys / companies → 僅 `super_admin`。
- automation / ai_logs → `super_admin` + `finance`。

**頁面**

- `/finance` 升級為 Finance Hub（總覽 + 子分頁路由）
- `/finance/transactions` 收支總帳（含新增、分類、付款方式）
- `/finance/receivable` 應收帳款（自動串 `b2b_orders` + `account_statements`）
- `/finance/payable` 應付帳款（自動串 `purchase_orders` + `vendors`）
- `/finance/bank-accounts` 銀行帳戶管理

**Hooks / Services**

```text
src/hooks/use-finance-transactions.tsx
src/hooks/use-receivables.tsx
src/hooks/use-payables.tsx
src/services/finance.service.ts   ← repository 層，集中 supabase 查詢
```

---

## Stage 2 — 發票 + 財務報表 + KPI

- `/finance/invoices` 發票列表 + 開立 Dialog（預留台灣電子發票 API 介面 `src/services/einvoice.service.ts`）
- `/finance/reports` 財務報表中心
  - 損益表 / 現金流量表 / 銷售報表 / 採購報表 / 庫存報表 / 客戶分析
  - PDF 匯出（沿用既有 `src/lib/pdf-report.ts`）
  - CSV 匯出
  - 日期區間 + 公司篩選
- `/dashboard` 升級加上 **KPI Bar**：月營收、毛利率、庫存週轉、回購率、客單價、客戶成長率

---

## Stage 3 — AI 智能分析 + 智能客服

採用 **Lovable AI Gateway**（`google/gemini-3-flash-preview`，免額外 API Key），全部走 `createServerFn`：

```text
src/lib/ai-gateway.ts                    provider helper
src/lib/ai-analytics.functions.ts        AI 分析 server fn（餵入彙總後的 SQL 統計，回傳結構化見解）
src/lib/ai-chat.functions.ts             AI 客服 streamText
```

- `/ai/analytics` AI Dashboard — Summary Cards（如「本月保健食品銷量成長 23%」）、商品推薦、庫存預測、客戶分群
- `/ai/assistant` AI 客服全頁 + 全站懸浮 **ChatWidget**（商城與後台共用）
  - 工具：`lookup_order` / `lookup_product` / `lookup_inventory`（讓 AI 可查真實資料）
  - 訊息渲染走 `useChat` + `message.parts`（含 markdown + 工具卡片）
- 所有 AI 結果寫入 `ai_logs` 供回顧

---

## Stage 4 — BI / 自動化 / 多公司 / API / 設定

- `/bi` BI Dashboard：銷售趨勢（折線）、利潤分析（面積）、商品/客戶排行（橫條）、區域分析、庫存週轉率（Recharts，深色科技風）
- `/automation` 工作流中心：規則列表 + Builder（Trigger × Action 表單式）
  - Triggers: 低庫存 / 訂單建立 / 月結到期 / 異常金額
  - Actions: 站內通知 / Email（預留）/ Webhook
  - 由 `pg_cron` + 一支 `/api/public/automation/tick` server route 排程觸發
- `/admin/companies` 多公司管理 + Header 公司切換器（公司 context 寫入 localStorage）
- `/admin/api-keys` API 金鑰管理（建立時一次性顯示，僅儲存 hash）
- `/admin/webhooks` Webhook 設定
- `/settings` 升級：公司設定 / 稅率 / 金流 / 物流 / Email / 通知
- 升級 `/notifications` 為 Smart Notification Center（接 AI 異常、庫存、財務、高風險客戶、熱銷預測）

---

## 共用技術約束

- **架構**：repository (`/services`) → hooks → routes，每個模組 self-contained。
- **設計**：沿用既有 `oklch` design tokens 與 `src/styles.css`，所有新元件用語義色（`bg-card`、`text-primary` …），維持深色科技風。
- **圖表**：使用既有的 `recharts`，封裝為 `src/components/charts/*` 可重用元件。
- **響應式**：手機 / 平板 / 桌面三斷點都驗證；手機版用底部 sheet + 抽屜。
- **假資料**：每個 Stage 結束會用 supabase--insert 灌入展示資料，讓 Dashboard / 報表 / AI 有東西可看。
- **權限**：所有新 route 走 `_authenticated/` 子樹；財務/API/Companies 在 UI 層額外用 `useAuth().role` 做角色守門。

---

## 確認事項

1. **是否照此分 4 Stage 推進？** 我會從 **Stage 1（財務核心 + Schema migration）** 開始；migration 會用一張 migration 一次建好全部新表 + RLS，避免後續來回。
2. AI 模組可直接使用 **Lovable AI Gateway**（無需用戶提供 API Key），這是最佳實踐選擇 — 預設用此方案。
3. 多公司架構先做 **UI + companies 表 + 切換器**，現有資料表不立即加 `company_id`（避免大規模 schema 改動破壞既有功能）；待用戶確認真的要全面 SaaS 化再做第二輪 backfill。

回覆「開始」即從 Stage 1 動工；若有想調整的範圍/優先順序也請直接說。
