
# 好處多多樂拼購 AI 招商中心 — 實作計畫

沿用現有 profiles / products / sales_orders / user_roles / company_id 多租戶基礎，新增四個獨立模組。

## 一、資料庫（migration）

### 1. 拼團系統
```text
group_buys           團主檔
  ├─ id, company_id, product_id, initiator_id (發起人)
  ├─ unit_price, target_count (=6), current_count
  ├─ status: open | completed | expired | refunded
  ├─ started_at, expires_at (默認 +7 天)
  └─ completed_at, winner_id (中獎者), winner_picked_at

group_buy_orders     參與單（最多每人 2 單）
  ├─ id, group_buy_id, user_id, quantity (1-2)
  ├─ sales_order_id (連結正式訂單)
  ├─ payment_method: points | bank_transfer | mixed
  ├─ points_used, cash_amount
  ├─ status: pending_payment | paid | refunded
  └─ created_at, paid_at

group_buy_settings   後台設定（每公司一筆）
  ├─ winner_reward_pct DEFAULT 80   (中獎者購物點 %)
  ├─ initiator_reward_pct DEFAULT 10 (發起人獎勵點 %)
  ├─ default_duration_days DEFAULT 7
  ├─ max_orders_per_user DEFAULT 2
  └─ auto_refund_hours (未滿員自動退款，留欄位但不啟用)
```

規則 trigger：
- `before insert on group_buy_orders`：檢查同人同團 ≤ 2 單、團未滿、未過期
- `before insert on group_buys`：檢查同 product 沒有 status=open 的團
- `after update on group_buys` → status 變 completed：呼叫 `private.settle_group_buy()` 隨機抽 winner、發放獎勵到 `reward_wallet_logs` + `member_points_wallet`

### 2. 獎勵點系統（沿用既有 wallet）
- `reward_wallet_logs` 已存在；新增 `source_type` 值：`group_buy_winner` / `group_buy_initiator` / `referral` / `repurchase`
- 新增 server fn：`spendPoints(orderId, amount)` 扣購物點付款

### 3. Webhook 系統
```text
webhook_endpoints
  ├─ id, company_id, name, url
  ├─ bearer_token (隨機產生，後台可重 roll)
  ├─ events text[] (member.created | order.created | group_buy.created | vip.upgraded)
  ├─ active, created_at

webhook_deliveries   投遞紀錄（除錯用）
  ├─ id, endpoint_id, event, payload jsonb
  ├─ status_code, response_body, attempts
  └─ delivered_at, error
```

事件觸發點（server fn 內，非同步 fire-and-forget）：
- `handle_new_user` 後 → `member.created`
- `create_sales_order_with_items` 完成 → `order.created`
- group_buy 建立 → `group_buy.created`
- VIP 升級訂單付款完成 → `vip.upgraded`

## 二、Server functions / routes

```text
src/lib/group-buy.functions.ts
  - listOpenGroupBuys({ companyId })
  - getGroupBuy({ id })
  - createGroupBuy({ productId, durationDays? })
  - joinGroupBuy({ groupBuyId, quantity, paymentMethod, pointsUsed })
  - settleGroupBuy({ id })   // admin 手動結算
  - expireGroupBuys()         // pg_cron 每小時呼叫

src/lib/rewards.functions.ts
  - getMyWallet()
  - listMyRewardLogs()
  - spendPoints({ amount, orderId })

src/lib/webhooks.functions.ts (admin)
  - list/create/update/delete endpoints
  - rerollToken({ id })
  - listDeliveries({ endpointId })

src/lib/webhooks.server.ts
  - deliverWebhook(event, payload)  // fetch + Bearer + 寫 deliveries

src/routes/api/ai/recruit.ts (server route, /api/public/ai/recruit)
  - POST { messages } → Lovable AI Gateway streamText
  - system prompt 內含即時讀取的 VIP 方案、商品、獎勵設定
```

## 三、前台頁面

- `/group-buys` — 公開拼團列表（卡片：商品圖 / 進度 6 人 / 倒數 / 加入按鈕）
- `/group-buys/$id` — 詳情頁（成員、剩餘名額、付款方式選擇：購物點 / 匯款 / 混合）
- `/recruit` — AI 招商中心，公開頁面 + Chat UI（useChat 串 `/api/public/ai/recruit`）
- 商品頁加「發起拼團」按鈕（VIP 會員可用）

## 四、後台頁面（admin）

- `/group-buy-admin` — 拼團管理（列表、強制結算 / 退款、查看成員）
- `/group-buy-settings` — 獎勵 % / 期限 / 限購設定
- `/webhooks-admin` — Webhook endpoint 管理 + 投遞紀錄
- 既有 `/rewards` 頁面擴充來源類型篩選

## 五、技術細節

- 抽中獎者：用 `ORDER BY random() LIMIT 1` 從付款完成的 participants 中挑，記錄到 `group_buys.winner_id`
- 購物點付款：在 `joinGroupBuy` 內以交易（rpc function）同步扣 wallet 並建立 sales_order
- AI 招商：`gemini-3-flash-preview`，system prompt 動態組合 VIP plans、active products、bonus settings 的簡述
- Webhook security：Bearer Token 在 header `Authorization: Bearer <token>`，payload 加 `event`、`timestamp`、`data`
- pg_cron 每小時跑 `expireGroupBuys`（呼叫 `/api/public/cron/expire-group-buys`，apikey 驗證）

## 六、不在此次範圍

- 不改既有 profiles / sales_orders / products 結構（只新增關聯表）
- 不做拼團聊天室 / 分享圖
- HMAC 簽章（先 Bearer，之後可加）

完成後驗收：發起拼團 → 6 人加入 → 自動抽中獎者並發點 → Webhook 收到事件 → AI 招商頁能回答 VIP 制度問題。
