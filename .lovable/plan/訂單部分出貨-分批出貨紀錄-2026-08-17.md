# 訂單部分出貨（分批出貨紀錄）

目前訂單只有單一「出貨狀態」下拉（待出貨／已出貨／已送達），無法紀錄「哪些品項、出了幾件、何時出的」。此規劃讓一張訂單可以分多次出貨，每次紀錄時間、數量、物流資訊。

## 功能範圍

1. **建立出貨單**：在訂單詳情頁新增「出貨紀錄」區塊與「新增出貨」對話框。
   - 勾選要出貨的品項，填入本次出貨數量（預設帶入尚未出貨數量，上限為剩餘量）。
   - 填寫出貨日期時間（預設現在）、物流公司、物流單號、備註。
2. **出貨進度**：每個品項顯示「已出 X / 共 Y」，訂單層顯示整體進度（例如 3/5 件）。
3. **自動狀態**：
   - 全部品項出完 → `shipping_status = shipped`
   - 部分出貨 → `shipping_status = partial`（新增狀態，標籤「部分出貨」）
   - 尚未出貨 → `pending`
   - 手動標記送達仍可用 → `delivered`
4. **出貨紀錄管理**：列出每筆出貨（時間、品項數量、物流單號、建立者），super_admin／admin／warehouse 可作廢單筆出貨（回沖已出數量與狀態）。
5. **訂單清單**：出貨欄位顯示「部分出貨 (3/5)」等進度徽章；篩選加入「部分出貨」。
6. **列印／PDF**：出貨紀錄摘要（時間、數量、單號）加入訂單列印內容。

## 資料庫設計

- 沿用既有 `public.shipments`，補欄位：`shipped_by`（uuid）、`note`（text）、`voided_at`（timestamptz）。
- 新增 `public.shipment_items`：`shipment_id`、`sales_order_item_id`、`product_id`、`quantity`，含 company_id、時間欄位與 GRANT/RLS（比照 `shipments`：同公司成員可讀，warehouse／admin／super_admin 可寫）。
- 驗證觸發器：單一品項累計出貨量不得超過訂單品項數量（含跨出貨單累計、排除已作廢者）。
- 交易型 RPC：
  - `create_order_shipment(_order_id, _shipped_at, _shipping_company, _tracking_no, _note, _items jsonb)` → 建立出貨單＋明細，重算訂單 `shipping_status`。
  - `void_order_shipment(_shipment_id)` → 標記作廢並重算狀態。
- 兩支 RPC 皆為 SECURITY DEFINER，內部驗證呼叫者角色與 company_id 一致性。

**注意**：庫存扣減維持現況（下單時由 `trg_deduct_stock_on_sales_order_item` 扣除），出貨不再重複扣庫存，避免雙重扣帳。

## 前端變更

- `src/lib/shipments.functions.ts`：`listOrderShipments`、`createOrderShipment`、`voidOrderShipment`（`requireSupabaseAuth`）。
- `src/components/orders/ShipmentDialog.tsx`：出貨建立表單。
- `src/routes/_authenticated/orders.tsx`：訂單詳情新增「出貨紀錄」區塊、清單出貨欄改為進度徽章、篩選新增部分出貨。
- `src/types/shop.ts` / 標籤：`SHIPPING_STATUS_LABELS` 加入 `partial: "部分出貨"`。
- `src/routes/shop.account.orders.$id.tsx`：會員端顯示出貨批次與時間（唯讀）。

## 執行順序

1. 套用 migration（新表、欄位、RLS/GRANT、觸發器、兩支 RPC）。
2. 建立 server functions 與出貨對話框。
3. 訂單後台與會員端 UI 串接。
4. 以測試訂單驗證：部分出貨 → 進度顯示 → 補出貨完成 → 作廢回沖。
