// 獎金演算來源與規則說明（前端顯示用）。
// 對應「月達成獎金管理」與「VIP獎金參數管理」在 UI 上的可讀說明。

export const DAILY_RULE_INTRO = [
  "1. 僅『合格 VIP』（is_vip = true 且 vip_expires_at 未過期）於每日結算時可領取。",
  "2. 首購 / 復購獎勵點來源：買家訂單 sales_order_items.tier_reward_points 或 products.reward_points；套組依 repurchase_bundles.bundle_reward_points 折算。",
  "3. 首購 / 復購獎勵點總點依 VIP獎金參數管理設定計算（repurchase_bonus_settings 各代比例）。",
  "4. 推薦獎金為升級訂單，依 dealer_tiers.daily_referral_rate 差額制往上分潤。",
  "5. 若上線 VIP 已到期或未設定到期日，會顯示『非有效 VIP，不發放』並取消該筆。",
  "6. 若獎勵改往上發給有效推薦人，會於 release_redirect_reason 顯示原因；實際領取人為 released_member_id。",
];

export const MONTHLY_RULE_INTRO = [
  "1. 每月完成責任額 (monthly_responsibility_points ≥ vip_required_points) 的 VIP 才可領月獎金。",
  "2. 未完成責任額時，營業分紅停止發放；當日完成後由隔天開始發放。",
  "3. 月達成基礎點數 = 自我消費（第一代累計採 monthly_responsibility_points 統計）。",
  "4. 累計訂單獎勵點超過責任額時，依 rank_rebate_settings 對應 VIP 位階給予超額回饋。",
  "5. 第一代累計達成時，顯示第一代達成分紅（monthly_tier_bonus_settings 階梯）。",
  "6. 每筆記錄來源分類：自我消費 / 第一代消費 / 月達成基礎 / 超額回饋 / 營業分紅 / 消費回饋 / 推薦級差。",
];

// 各 bonus_type 的『適用制度』與『獎勵點來源』說明
export const BONUS_RULE_META: Record<string, { rule: string; source: string }> = {
  referral: {
    rule: "VIP獎金參數管理：dealer_tiers.daily_referral_rate（升級訂單差額制）",
    source: "升級訂單 sales_orders.subtotal → 依訂單獎勵點推算",
  },
  repurchase: {
    rule: "月達成獎金管理：repurchase_bonus_settings（各代 bonus_rate）",
    source: "復購訂單 sales_order_items.tier_reward_points + 套組 bundle_reward_points",
  },
  monthly_vip: {
    rule: "月達成獎金管理：monthly_tier_bonus_settings（月達成階梯 bonus_rate）",
    source: "當月 monthly_responsibility_points（自我 + 第一代累計）",
  },
  rank_rebate: {
    rule: "VIP獎金參數管理：rank_rebate_settings（位階 exceeded_rebate_rate）",
    source: "當月超過責任額之獎勵點 (excess_points)",
  },
  rank_diff_rebate: {
    rule: "VIP獎金參數管理：rank_rebate_settings 差額制",
    source: "當月超過責任額之獎勵點 (excess_points)",
  },
  upgrade_bonus: {
    rule: "月達成獎金管理：vip_upgrade_bonus 分紅池",
    source: "升級訂單 subtotal",
  },
  business_bonus: {
    rule: "月達成獎金管理：vip_business_bonus 分紅池",
    source: "當日營業獎勵點總量",
  },
  national_share: {
    rule: "全國分紅 STAR5~DIRECTOR：national_bonus_pool_settings（每級 2%，上限 20/30/40/50 萬）",
    source: "當日營業總獎勵點 × 各級 pool_rate ÷ 該級有效人數",
  },
};

export function bonusRuleMeta(code: string | null | undefined) {
  if (!code) return { rule: "—", source: "—" };
  return BONUS_RULE_META[code] ?? { rule: code, source: "—" };
}

export function isValidVip(profile: any, referenceDate: Date = new Date()): boolean {
  if (!profile?.is_vip || !profile?.vip_expires_at) return false;
  return new Date(profile.vip_expires_at) >= referenceDate;
}

export function vipStatusLabel(profile: any, referenceDate?: string | Date | null): { label: string; valid: boolean; reason: string } {
  const refDate = referenceDate ? new Date(referenceDate) : new Date();
  if (!profile) return { label: "未載入", valid: false, reason: "查無會員資料" };
  if (!profile.is_vip) return { label: "非 VIP", valid: false, reason: "profiles.is_vip = false" };
  if (!profile.vip_expires_at) return { label: "無到期日", valid: false, reason: "未設定 vip_expires_at，視為非有效 VIP" };
  const expires = new Date(profile.vip_expires_at);
  if (expires < refDate) return { label: "已到期", valid: false, reason: `vip_expires_at ${profile.vip_expires_at} 已過期` };
  return { label: "有效 VIP", valid: true, reason: `到期日 ${profile.vip_expires_at}` };
}

export function calculationNote(record: any): string {
  const notes: string[] = [];
  if (record?.release_redirect_reason) notes.push(`改發原因：${record.release_redirect_reason}`);
  if (record?.fail_reason) notes.push(`失敗/取消：${record.fail_reason}`);
  if (record?.required_points_checked && !record?.required_points_passed) {
    notes.push("責任額未達成");
  }
  if (!record?.calculation_detail) notes.push("尚無 calculation_detail 快照");
  return notes.length ? notes.join("；") : "—";
}
