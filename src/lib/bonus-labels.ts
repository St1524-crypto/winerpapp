// 集中管理 bonus_type / status 中文對照，避免 JSX 中散落硬編碼字串。

export const BONUS_TYPE_LABEL: Record<string, string> = {
  referral: "推薦獎勵",
  repurchase: "復購獎勵",
  monthly_vip: "月 VIP 獎勵",
  rank_rebate: "階級回饋",
  rank_diff_rebate: "階級差額回饋",
  business_bonus: "消費回饋",
  upgrade_bonus: "升級分紅",
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

export const DAILY_BONUS_TYPE_OPTIONS = [
  { value: "referral", label: BONUS_TYPE_LABEL.referral },
  { value: "repurchase", label: BONUS_TYPE_LABEL.repurchase },
];

export const MONTHLY_BONUS_TYPE_OPTIONS = [
  { value: "monthly_vip", label: BONUS_TYPE_LABEL.monthly_vip },
  { value: "rank_rebate", label: BONUS_TYPE_LABEL.rank_rebate },
  { value: "rank_diff_rebate", label: BONUS_TYPE_LABEL.rank_diff_rebate },
];
