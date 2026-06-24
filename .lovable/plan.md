## VIP 升級套組管理功能規劃

### 目標
建立 V/S/T/E/A 五階 VIP 階級制度與會員可直接購買的升級套組，付款成功後自動升級並寫入紀錄。

---

### DB 結構（新增）

**1. `vip_tiers`** — VIP 階級主檔（admin 可編輯）
- `code` (V/S/T/E/A, unique)
- `name`、`sort_order`
- `required_reward_points` (門檻)
- `required_direct_vip` (直推 VIP 門檻)
- `required_mentor_tier` + `required_mentor_count` (輔導下線)
- `cashback_rate` (回饋率 %)
- `revenue_share_rate` (營業分紅 %)
- `upgrade_bonus_cap` (升級分紅上限)
- `renewal_window_days` (續領週期，如 180)
- `renewal_required_new_vip` (續領需新增 VIP 數)
- `extra_config` (jsonb，存放開發專員小組等特殊規則)
- `status` (active/inactive)

**2. `vip_upgrade_packages`** — 升級套組
- `tier_code` (對應 vip_tiers.code)
- `name`、`description`
- `price`、`bonus_points` (贈送獎勵點)
- `duration_days` (有效天數，0=永久)
- `sort_order`、`status`

**3. `vip_upgrade_orders`** — 升級訂單記錄
- `user_id`、`package_id`、`tier_code`
- `amount`、`payment_method`
- `payment_status` (pending/paid/failed)
- `paid_at`、`applied_at`
- `previous_tier`、`new_tier`
- `sales_order_id` (關聯既有 sales_orders，可選)

**RLS**
- `vip_tiers`：anon/authenticated SELECT active；admin/super_admin 全權
- `vip_upgrade_packages`：authenticated SELECT active；admin/super_admin 全權
- `vip_upgrade_orders`：本人 SELECT 自己；admin/super_admin 全權；service_role 寫入

**現有 profiles 欄位重用**：`vip_tier`(若無則新增 text)、`is_vip`、`vip_expires_at`

---

### 階級資料種子（migration 內 insert）
| Code | 獎勵點 | 直推 VIP | 輔導 | 回饋 | 營業分紅 | 升級上限 | 續領 |
|---|---|---|---|---|---|---|---|
| V | 800 | — | — | 5% | — | — | — |
| S | 3500 | 10 | — | 10% | — | — | — |
| T | 9000 | 20 | 3×S | 20% | — | — | — |
| E | 21000 | 30 | 3×T | 40% | 5% | 36800 | 180d/1 VIP |
| A | 70000 | 50 | — | 50% | 6% | 68000 | 180d/1 VIP（當月+10 觸發專員 5%） |

---

### Server functions（新檔）`src/lib/vip-tiers.functions.ts`
- `listVipTiers` (public)
- `upsertVipTier` (admin)
- `listVipUpgradePackages` (public, only active)
- `upsertVipUpgradePackage` (admin)
- `deleteVipUpgradePackage` (admin)
- `purchaseVipUpgrade({ packageId })` (authenticated)
  1. 建立 `vip_upgrade_orders` (pending)
  2. 透過既有金流 → 標記 paid
  3. **僅升不降**：若新階級 sort_order ≤ 現階級則只發贈點，不改 tier
  4. 更新 `profiles.vip_tier` / `is_vip` / `vip_expires_at`
  5. 寫 `audit_logs`
  6. 發放 bonus_points 至 `member_points_wallet.reward_points`
- `adminApplyVipUpgrade` (admin 手動)

---

### Routes（新增）
- `src/routes/_authenticated/admin.vip-tiers.tsx` — 階級 CRUD
- `src/routes/_authenticated/admin.vip-upgrade-packages.tsx` — 套組 CRUD
- `src/routes/shop.vip.tsx` — **改寫** 顯示按階級分組的套組，購買 → `purchaseVipUpgrade`
- `src/routes/shop.account.vip.tsx` — 會員 VIP 現況、歷史升級紀錄

導覽：AdminSidebar 加入兩個 admin 連結。

---

### 對既有流程的影響
| 模組 | 影響 |
|---|---|
| `sales_orders` | 不動。升級走獨立 `vip_upgrade_orders`，可選關聯 |
| `bonus_records` | 不動 |
| `member_points_wallet` | 僅 INSERT 贈送獎勵點（既有 upgradeVip 已是同模式） |
| `vip_plans` (舊) | 保留向下相容；新流程改用 `vip_upgrade_packages`。舊 `/shop/vip` 改為新版 |
| `audit_logs` | 新增 `vip_upgrade` 動作類型 |
| RLS / 既有政策 | 不動 |

**不會降級**：`purchaseVipUpgrade` 比對 sort_order，只允許升階。

---

### 驗證計畫
1. Admin 登入 → `/admin/vip-tiers` 編輯 V→A 五階
2. `/admin/vip-upgrade-packages` 建立 V/S/T 套組
3. 會員登入 `/shop/vip` → 購買 V 套組 → 確認 profile.vip_tier=V、wallet+獎勵點、audit_logs 新增
4. 再買 V 套組（同階）→ 只發點不降級
5. 買 S 套組 → 升級到 S
6. `/shop/account/vip` 顯示現況 + 紀錄
7. 非 admin 開 `/admin/vip-tiers` → 403
