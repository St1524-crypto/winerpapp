// 前端統一名稱映射：sidebar / 頁面標題 / meta title / 表格顯示都必須從這裡讀。
// 這是唯一真實來源 (Single Source of Truth)，避免各處硬編碼字串造成不同步。
//
// 使用方式：
//   import { BONUS_PAGE_LABELS, poolDisplayName } from "@/lib/bonus-pool-labels";
//   <h1>{BONUS_PAGE_LABELS.vipUpgradePool}</h1>
//   <TableCell>{poolDisplayName(row)}</TableCell>
//
// 如需新增/修改分紅池顯示名稱，只改此檔即可全站生效。

/** 頁面 / 選單 / meta title 共用的固定文案 */
export const BONUS_PAGE_LABELS = {
  /** 一星至七星至董事 共同分紅池 */
  sharedRankPool: "共同分紅池",
  /** VIP V/S/T/E/A 星級營業分紅池（原「消費回饋池」） */
  vipUpgradePool: "營業分紅池",
  vipUpgradeBonusCap: "VIP 營業分紅上限",
  vipBusinessBonusCap: "VIP 消費回饋上限",
  /** V/S/T/E/A 只領消費回饋，故此上限對應「消費回饋總收益上限」 */
  vipBusinessBonusTotalEarnings: "消費回饋總收益上限",
} as const;

/** 產生一致的瀏覽器 tab 標題（`<meta title>`） */
export function pageMetaTitle(label: string, brand = "winerp") {
  return `${label} — ${brand}`;
}

/**
 * 資料表中 pool.code → 對外顯示名稱。
 * DB 內的 name 欄位可能是舊字串，統一由此覆寫，確保與 sidebar / 頁面標題一致。
 * 未列入者回退到資料庫 name。
 */
export const POOL_CODE_LABELS: Record<string, string> = {
  // 一~七星 + 董事 共同分紅池
  shared_rank_pool: BONUS_PAGE_LABELS.sharedRankPool,
  // VIP 星級營業分紅池
  vip_star_upgrade_pool: BONUS_PAGE_LABELS.vipUpgradePool,
};

/** 依 pool row 取得統一顯示名稱（優先用 code 映射，退回 name） */
export function poolDisplayName(row: { code?: string | null; name?: string | null } | null | undefined): string {
  if (!row) return "—";
  const byCode = row.code ? POOL_CODE_LABELS[row.code] : undefined;
  return byCode ?? row.name ?? "—";
}
