# 第四週：B2C 電商與訂單系統 — 分階段實作計畫

第四週是 17 個子系統（前台商城 + 購物車 + 結帳 + 金流 + 訂單流程 + 出貨 + 優惠券 + Dashboard 升級），規模與第五週相當，無法在單一回合裡做到位且保證品質。建議分 **4 階段** 連續執行。

目前資料庫已有 `customers`、`products`、`orders`（簡易版）、`product_images`、`warehouse_inventory`、`inventory_logs`、`goods_receiving`。第四週將擴充而不是覆蓋。

---

## 階段 1：資料骨架 + B2C 前台商城（本回合先做）

**SQL Schema（單一 migration）**
- `customer_addresses`（收件人、電話、地址、is_default）
- `carts` / `cart_items`（支援登入會員 + 訪客 session token）
- `sales_orders`（取代簡易 `orders`；含 subtotal/shipping_fee/discount/total、payment_status、shipping_status、order_status）
- `sales_order_items`（product 快照：name/sku/price/quantity/subtotal）
- `payments`（method、status、paid_at、transaction_id）
- `shipments`（shipping_company、tracking_no、shipped_at、status）
- `coupons`（code、type=fixed/percent、value、min_amount、expired_at、usage_limit、used_count）
- `wishlist`（customer_id + product_id）
- `generate_so_no()` 函式：`SO-YYYYMMDD-0001`
- RLS：訪客可建立 cart；會員只看自己的 order/wishlist/cart；員工依角色管理
- 種子：3 張優惠券 + 範例地址

**前端 B2C 前台路由**（公開，不在 `_authenticated/` 下）
- `/shop` — 首頁（Hero Banner、熱銷、新品、分類入口、優惠活動）
- `/shop/products` — 商品列表（搜尋、分類篩選、排序、分頁）
- `/shop/category/$slug` — 分類頁
- `/shop/product/$id` — 商品詳細頁（圖片輪播、規格、推薦商品、加入購物車 / 立即購買 / 收藏）
- 共用：`StorefrontLayout`、`StorefrontHeader`（Logo + 搜尋 + Cart Drawer 入口 + 會員）、`StorefrontFooter`、`MobileBottomNav`

**Cart Drawer**
- 全域 `useCart` hook：訪客用 localStorage session_token，登入後 merge 到 DB
- 右側 Drawer：列表、數量加減、刪除、小計、運費試算、「前往結帳」按鈕

---

## 階段 2：會員中心 + Checkout + 訂單建立

- `/account` 會員中心（layout）
  - `/account/orders` — 我的訂單
  - `/account/orders/$id` — 訂單詳情 + 物流追蹤
  - `/account/addresses` — 收件地址 CRUD
  - `/account/wishlist` — 收藏
  - `/account/profile` — 個人資料 + 密碼
- `/checkout` — 結帳流程（4 步驟）：購物車 → 收件資料 → 物流/付款 → 確認
  - 套用優惠券（即時驗證碼、額度、期限、使用次數）
  - 建立 `sales_orders` + items、產生 `SO-` 編號
- `/checkout/success/$orderNo` — 訂單完成頁

---

## 階段 3：金流介面 + 庫存扣除 + 出貨

- `PaymentGateway` 介面 + ECPay / NewebPay adapter stub + Mock adapter（預設啟用）
- `/checkout/pay/$orderNo` — 模擬付款頁（信用卡 / ATM / 超商三選一）
- 付款成功 → 觸發庫存扣除（讀 `sales_order_items` → 寫 `inventory_logs`、更新 `warehouse_inventory`）
- 取消 / 退貨 → 回補庫存
- `/admin/sales-orders` — 後台訂單管理（狀態流轉、列印、PDF）
- `/admin/shipments` — 出貨管理（撿貨、包貨、產生物流單號、超商/宅配）

---

## 階段 4：優惠券後台 + Dashboard 升級

- `/admin/coupons` — 優惠券 CRUD（折扣碼、滿額、百分比、期限、次數）
- `/dashboard` 升級：今日訂單、今日營收、待出貨、熱銷 Top 5、銷售趨勢圖（recharts 7 日折線）、訂單狀態圓餅、商品排行

---

## 技術規範

- **架構**：
  - `src/lib/shop/*.ts` — services（cart、checkout、pricing、coupon validator）
  - `src/lib/payments/*.ts` — payment gateway interface + adapters
  - `src/hooks/use-cart.tsx`、`use-wishlist.tsx`、`use-shop-products.tsx`
  - `src/components/shop/*` — 前台元件
  - `src/components/account/*` — 會員中心元件
- **路由分區**：
  - `src/routes/shop.*.tsx` — 公開商城（無 auth gate）
  - `src/routes/checkout.*.tsx` — 結帳（部分需登入）
  - `src/routes/_authenticated/account.*.tsx` — 會員中心
  - `src/routes/_authenticated/admin-orders.tsx` 等 — 後台
- **訪客購物車**：localStorage `cart_token` (uuid) → `carts.session_token` 欄位；登入時 merge
- **UI**：高端電商風（大圖、留白、Apple 風卡片、glassmorphism Hero）、Cart Drawer 用 Sheet、Skeleton loading、sonner toast、Hover scale
- **響應式**：桌面 sidebar + 商品 grid；手機 bottom nav（首頁 / 分類 / 購物車 / 會員）
- **假資料**：沿用既有 `products` + 自動生成 3 張優惠券

---

## 本回合（階段 1）交付物

1. 一次 Supabase migration（8 張新表 + RLS + `generate_so_no` + 種子優惠券）
2. 前台 layout：`src/components/shop/StorefrontLayout.tsx` + Header / Footer / MobileBottomNav / CartDrawer
3. Cart hook：`src/hooks/use-cart.tsx`（訪客 + 會員 + merge）
4. 路由：`/shop`（首頁）、`/shop/products`、`/shop/product/$id`、`/shop/category/$slug`
5. 後台「B2C 商城」入口 + 公開 `/shop` 連結

確認後我會先送 migration，待你核准後寫入前端，再進入階段 2。

請確認：
- 是否同意分 4 階段，先做階段 1？
- 訪客購物車是否用 localStorage token（建議）vs. 強制登入才可加入購物車？
- 既有的 `orders` 表是否保留（作為舊版/簡易訂單）？我建議**保留**，新表 `sales_orders` 作為 B2C 主訂單。