import { AlertTriangle, FileSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { bonusRuleMeta, vipStatusLabel } from "@/lib/bonus-rules";
import { bonusStatusLabel, bonusTypeLabel } from "@/lib/bonus-labels";

/**
 * 顯示單筆獎金的 calculation_detail 快照（中文欄位）。
 * - 若 calculation_detail 為空，顯示明確提示：本筆尚未寫入演算快照，僅顯示既有欄位推導結果。
 * - 不會自行補資料，僅呈現 bonus_records 已有欄位。
 * - 核心結算欄位補寫由 Codex 於 processRepurchase / processUpgrade / settle_monthly_bonus / settle_daily_bonus 完成。
 */
export function BonusCalculationDetailDialog({
  record,
  mode,
  members,
  orders,
  tiers,
}: {
  record: any;
  mode: "daily" | "monthly";
  members: Record<string, any>;
  orders?: Record<string, any>;
  tiers?: Record<string, string>;
}) {
  const detail = record?.calculation_detail && typeof record.calculation_detail === "object"
    ? record.calculation_detail
    : null;
  const missing = !detail;
  const isBackfilled = detail?.backfill_mode === "derived_from_existing_bonus_records";

  const owner = members?.[record?.member_id] ?? {};
  const source = members?.[record?.source_member_id];
  const released = members?.[record?.released_member_id];
  const order = orders?.[record?.source_order_id];
  const vip = vipStatusLabel(owner, record?.settlement_date);
  const meta = bonusRuleMeta(record?.bonus_type);
  const tierLabel = tiers?.[record?.member_id] ?? detail?.tier_snapshot?.current_tier ?? "—";

  const n = (v: unknown, fb = 0) => {
    const parsed = Number(v ?? fb);
    return Number.isFinite(parsed) ? parsed : fb;
  };
  const fmtN = (v: unknown) => n(v).toLocaleString();

  const releasedPts = record?.status === "released" ? n(record?.bonus_points) : 0;
  const shouldPts = n(record?.bonus_points);

  // 依模式決定欄位
  const dailyFields: Array<{ label: string; value: React.ReactNode }> = [
    { label: "訂單產生獎勵點", value: fmtN(detail?.source_reward_points ?? detail?.order_reward_points ?? record?.base_amount) },
    { label: "來源訂單", value: order?.order_no ?? (record?.source_order_id ?? "—") },
    { label: "來源會員", value: source ? `${source.name} (${source.member_no ?? "—"})` : "—" },
    { label: "領取會員", value: released ? `${released.name} (${released.member_no ?? "—"})` : (owner?.name ? `${owner.name} (${owner.member_no ?? "—"})` : "—") },
    { label: "VIP 是否有效", value: <Badge variant={vip.valid ? "default" : "destructive"} title={vip.reason}>{vip.label}</Badge> },
    { label: "VIP 到期日", value: owner?.vip_expires_at ?? "—" },
    { label: "責任額是否完成", value: record?.required_points_passed === true ? <Badge>已達成</Badge> : record?.required_points_passed === false ? <Badge variant="destructive">未達成</Badge> : "—" },
    { label: "適用制度", value: meta.rule },
    { label: "應發點數", value: fmtN(shouldPts) },
    { label: "實發點數", value: fmtN(releasedPts) },
    { label: "取消 / 失敗原因", value: record?.fail_reason ?? record?.release_redirect_reason ?? "—" },
  ];

  const selfPts = n(detail?.self_points ?? detail?.source_self_points);
  const firstGenPts = n(detail?.first_generation_points ?? detail?.source_first_generation_points);
  const requiredPts = n(detail?.required_points ?? detail?.source_required_points);
  const totalBasePts = n(detail?.total_base_points ?? detail?.source_total_base_points ?? record?.base_amount);
  const excessPts = n(detail?.excess_points ?? detail?.source_excess_points, Math.max(selfPts - requiredPts, 0));

  const monthlyFields: Array<{ label: string; value: React.ReactNode }> = [
    { label: "自我消費", value: fmtN(selfPts) },
    { label: "第一代消費", value: fmtN(firstGenPts) },
    { label: "月達成基礎點數", value: fmtN(totalBasePts) },
    { label: "超額點數", value: fmtN(excessPts) },
    { label: "責任額", value: fmtN(requiredPts) },
    { label: "是否達成", value: record?.required_points_passed === true ? <Badge>已達成</Badge> : record?.required_points_passed === false ? <Badge variant="destructive">未達成</Badge> : "—" },
    { label: "適用 VIP 階級", value: tierLabel },
    { label: "適用制度", value: meta.rule },
    { label: "應發點數", value: fmtN(shouldPts) },
    { label: "實發點數", value: fmtN(releasedPts) },
  ];

  const fields = mode === "daily" ? dailyFields : monthlyFields;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
          <FileSearch className="h-3.5 w-3.5 mr-1" />詳情
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {mode === "daily" ? "日獎金演算快照" : "月獎金演算快照"} — {bonusTypeLabel(record?.bonus_type)}
          </DialogTitle>
          <DialogDescription>
            狀態：{bonusStatusLabel(record?.status)}　結算日：{record?.settlement_date ?? "—"}
          </DialogDescription>
        </DialogHeader>

        {missing && (
          <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-600 shrink-0" />
            <div className="text-amber-900 dark:text-amber-200">
              此筆獎金尚未寫入演算快照（calculation_detail 為空），僅顯示既有欄位推導結果。
              <div className="text-xs mt-1 text-amber-800 dark:text-amber-300">
                需 Codex 於 {mode === "daily" ? "processRepurchase / processUpgrade / settle_daily_bonus" : "settle_monthly_bonus"} 寫入快照後才會呈現完整演算來源。
              </div>
            </div>
          </div>
        )}

        {isBackfilled && (
          <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-600 shrink-0" />
            <div className="text-amber-900 dark:text-amber-200">
              此筆為歷史回填資料，僅依既有 bonus_records 推導，非原始即時計算快照。
              <div className="text-xs mt-1 text-amber-800 dark:text-amber-300">
                需 Codex 於 {mode === "daily" ? "processRepurchase / processUpgrade / settle_daily_bonus" : "settle_monthly_bonus"} 原生寫入 calculation_detail 後，新資料才會呈現完整演算來源。
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-sm mt-2">
          {fields.map((f) => (
            <div key={f.label} className="flex justify-between border-b py-1.5 gap-3">
              <span className="text-muted-foreground shrink-0">{f.label}</span>
              <span className="text-right font-medium break-all">{f.value ?? "—"}</span>
            </div>
          ))}
        </div>

        {detail && (
          <details className="text-xs mt-2">
            <summary className="cursor-pointer text-muted-foreground">原始 calculation_detail JSON</summary>
            <pre className="mt-2 rounded bg-muted p-2 overflow-auto max-h-64 text-[11px]">
              {JSON.stringify(detail, null, 2)}
            </pre>
          </details>
        )}
      </DialogContent>
    </Dialog>
  );
}
