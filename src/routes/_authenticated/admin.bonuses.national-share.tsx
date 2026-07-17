import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowLeft, Info, AlertTriangle, FileText, Settings2 } from "lucide-react";
import { useAuth, type AppRole } from "@/hooks/use-auth";
import { ForbiddenScreen } from "@/components/ForbiddenScreen";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

const ALLOWED: AppRole[] = ["super_admin", "admin", "finance"];

export const Route = createFileRoute("/_authenticated/admin/bonuses/national-share")({
  component: Guard,
});

function Guard() {
  const { roles, loading } = useAuth();
  if (loading)
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  if (!roles.some((r) => ALLOWED.includes(r)))
    return <ForbiddenScreen requiredRoles={ALLOWED} pageName="全國分紅（月結）" />;
  return <Page />;
}

function currentYyyymm() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function Page() {
  const [yyyymm, setYyyymm] = useState<string>(currentYyyymm());

  const period = useMemo(() => {
    if (!/^\d{6}$/.test(yyyymm)) return null;
    const y = yyyymm.slice(0, 4);
    const m = yyyymm.slice(4, 6);
    return { from: `${y}-${m}-01`, to: `${y}-${m}-31`, label: `${y}-${m}` };
  }, [yyyymm]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">全國分紅（月結，STAR5~DIRECTOR）</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            全國分紅已改為月結，由 <code>settle_monthly_bonus</code> 於月結批次中呼叫{" "}
            <code>settle_monthly_national_share</code> 統一產生。本頁提供月份切換與月結明細跳轉，不再提供手動日結入口。
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/admin/bonuses">
            <ArrowLeft className="mr-2 h-4 w-4" />
            返回獎金營運中心
          </Link>
        </Button>
      </div>

      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Info className="h-4 w-4" />
            全國分紅（月結）規則
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-xs text-muted-foreground">
          <div>1. 每月 pool = 當月營業總獎勵點 × <code>national_bonus_pool_settings.pool_rate</code>（每級獨立）</div>
          <div>2. 對象：STAR5 / STAR6 / STAR7 / DIRECTOR（有效 VIP）</div>
          <div>3. 每月累計上限：STAR5 20 萬 / STAR6 30 萬 / STAR7 40 萬 / DIRECTOR 50 萬</div>
          <div>4. VIP 必須 is_vip=true、vip_expires_at 不為空、且不早於結算月月底</div>
          <div>5. 達每月上限者停止發放；接近上限者只發到剩餘額度</div>
          <div>6. 產生的 <code>bonus_records.bonus_type = 'national_share'</code>、<code>status = 'waiting_release'</code>，實際發放仍由既有 release 流程處理</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">月份選擇</CardTitle>
          <CardDescription className="text-xs">
            選擇欲檢視的結算月份（YYYYMM）。月結全國分紅由 <code>settle_monthly_bonus(_yyyymm)</code>{" "}
            統一觸發，本頁不再提供手動執行入口。
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="space-y-1 md:col-span-1">
            <Label>結算月份（YYYYMM）</Label>
            <Input
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              value={yyyymm}
              onChange={(e) => setYyyymm(e.target.value.replace(/[^\d]/g, "").slice(0, 6))}
              placeholder="例如：202607"
            />
            <div className="text-xs text-muted-foreground">
              {period ? `對應期間：${period.from} ~ ${period.to}` : "格式錯誤，請輸入 6 碼 YYYYMM"}
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-2 md:col-span-2">
            <Button asChild variant="outline" disabled={!period}>
              <Link
                to="/admin/bonuses/monthly-details"
                search={
                  period
                    ? ({
                        dateFrom: period.from,
                        dateTo: period.to,
                        bonusType: "national_share",
                      } as any)
                    : undefined
                }
              >
                <FileText className="mr-2 h-4 w-4" />
                前往月獎金明細（預帶 national_share）
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/admin/bonuses/national-share-settings">
                <Settings2 className="mr-2 h-4 w-4" />
                全國分紅設定（每月累計上限）
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-amber-500/50 bg-amber-500/10">
        <CardContent className="flex items-start gap-2 py-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div className="text-xs text-amber-800 dark:text-amber-300 space-y-1">
            <div>
              全國分紅已於 Batch 3 由日結改為月結；日結明細頁不再提供 <code>national_share</code>{" "}
              分類。歷史日結資料（若存在）將顯示為「舊制全國分紅紀錄」，僅供追溯，不再重算。
            </div>
            <div>
              本頁不會寫入 wallet / reward_wallet_logs / point_transactions；實際入帳仍需經既有
              release_bonus_rewards 流程。
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
