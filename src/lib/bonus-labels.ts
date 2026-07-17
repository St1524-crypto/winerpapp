// 集中管理 bonus_type / status 中文對照，避免 JSX 中散落硬編碼字串。

export const BONUS_TYPE_LABEL: Record<string, string> = {
  referral: "推薦獎勵",
  repurchase: "復購獎勵",
  monthly_vip: "月 VIP 獎勵",
  rank_rebate: "階級回饋",
  rank_diff_rebate: "階級差額回饋",
  business_bonus: "營業分紅",
  // 舊制項目：新獎金制度已停用，僅供歷史紀錄顯示，不得作為新制度可選分類。
  upgrade_bonus: "舊制營業分紅紀錄",
  // 全國分紅（月結）— 舊資料若為日結 settlement_date 則屬於「舊制全國分紅紀錄」，
  // 新制自 Batch 3 起改由 settle_monthly_bonus → settle_monthly_national_share 產生。
  national_share: "全國分紅（月結）",
};

export function bonusTypeLabel(code: string | null | undefined) {
  if (!code) return "—";
  return BONUS_TYPE_LABEL[code] ?? code;
}

export const BONUS_STATUS_LABEL: Record<string, string> = {
  pending: "待結算",
  waiting_release: "待發放",
  released: "已成功發放",
  failed: "發放失敗",
  cancelled: "已取消",
};

export function bonusStatusLabel(code: string | null | undefined) {
  if (!code) return "—";
  return BONUS_STATUS_LABEL[code] ?? code;
}

export const BONUS_STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  released: "default",
  waiting_release: "secondary",
  pending: "outline",
  failed: "destructive",
  cancelled: "outline",
};

// 日結白名單（新獎金制度）：只保留新制可用分類；upgrade_bonus / national_share 已移除。
// national_share 於新制度已改為月結，日結明細不再提供該篩選（歷史資料仍可透過月結明細查看）。
export const DAILY_BONUS_TYPE_OPTIONS = [
  { value: "referral", label: BONUS_TYPE_LABEL.referral },
  { value: "repurchase", label: BONUS_TYPE_LABEL.repurchase },
  { value: "business_bonus", label: BONUS_TYPE_LABEL.business_bonus },
];

// 月結白名單：Batch 3 起加入 national_share（月結全國分紅）。
export const MONTHLY_BONUS_TYPE_OPTIONS = [
  { value: "monthly_vip", label: BONUS_TYPE_LABEL.monthly_vip },
  { value: "rank_rebate", label: BONUS_TYPE_LABEL.rank_rebate },
  { value: "rank_diff_rebate", label: BONUS_TYPE_LABEL.rank_diff_rebate },
  { value: "national_share", label: BONUS_TYPE_LABEL.national_share },
];

