## 目標
讓管理員在後台為每個商品設定「優先順位」，前台 `/shop/products`「全部商品」依此排序顯示，數字小者優先。

## 資料庫
- `products` 新增欄位 `display_priority int NOT NULL DEFAULT 0`（值越大越前面；0=未設定，按既有規則）。
- 加索引 `(status, display_priority DESC, created_at DESC)` 加速排序。

## 後端
- 商品列表 API 排序改為：`ORDER BY display_priority DESC, created_at DESC`。
- 新增 server function `updateProductPriority(productId, priority)`（限 super_admin/admin/sales）。
- 新增 `bulkReorderProducts(ids[])` — 接收拖曳後的順序，依索引反向寫入 priority（top=最大）。

## 後台 UI（`/admin/products`）
- 表格新增「優先順位」欄位 + 數字輸入框（即時 onBlur 儲存）。
- 工具列新增「排序模式」按鈕：切換到拖曳排序模式，使用 `@dnd-kit/sortable` 拖拉商品列；存檔呼叫 `bulkReorderProducts`。
- 商品編輯抽屜（ProductFormDialog）一般資訊區也加入「優先順位」欄位。

## 前台
- `/shop/products` 與 `/shop`（精品推薦下方的全部商品列表）查詢加 `.order("display_priority", { ascending: false })`，再次序 `created_at desc`。
- 既有「精品推薦」`homepage_featured_products` 不受影響（獨立區塊）。

## 權限
- `display_priority` 寫入限管理員（super_admin/admin/sales/warehouse），透過現有 RLS 已涵蓋；server fn 再做 role gate。

## 驗證
1. 後台對 3 個商品設不同 priority → 前台順序正確。
2. 拖曳排序後重新整理仍保留。
3. 非管理員無法修改 priority（API 401/403）。
