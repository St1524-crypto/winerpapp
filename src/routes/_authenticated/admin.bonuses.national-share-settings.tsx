import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Loader2, Info, Save, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { useAuth, type AppRole } from "@/hooks/use-auth";
import { ForbiddenScreen } from "@/components/ForbiddenScreen";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  adminListNationalBonusPoolSettings,
  adminUpdateNationalBonusPoolSetting,
} from "@/lib/bonus.functions";

const ALLOWED: AppRole[] = ["super_admin", "admin", "finance"];
const WRITE_ROLES: AppRole[] = ["super_admin", "admin"];

const TIER_LABEL: Record<string, string> = {
  STAR5: "STAR5 五星",
  STAR6: "STAR6 六星",
  STAR7: "STAR7 七星",
  DIRECTOR: "DIRECTOR 董事",
};

const TIER_CAP_HINT: Record<string, string> = {
  STAR5: "STAR5：每月累計上限 20 萬",
  STAR6: "STAR6：每月累計上限 30 萬",
  STAR7: "STAR7：每月累計上限 40 萬",
  DIRECTOR: "DIRECTOR：每月累計上限 50 萬",
};


export const Route = createFileRoute("/_authenticated/admin/bonuses/national-share-settings")({
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
    return <ForbiddenScreen requiredRoles={ALLOWED} pageName="全國分紅設定" />;
  return <Page />;
}

type Row = {
  id: string;
  tier_code: string;
  pool_rate: number;
  income_cap_amount: number;
  is_active: boolean;
  effective_from: string;
  updated_at: string;
};

type Draft = {
  pool_rate: string;
  income_cap_amount: string;
  is_active: boolean;
  effective_from: string;
};

function Page() {
  const { roles } = useAuth();
  const canWrite = roles.some((r) => WRITE_ROLES.includes(r));
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const list = (await adminListNationalBonusPoolSettings()) as Row[];
      setRows(list);
      const d: Record<string, Draft> = {};
      for (const r of list) {
        d[r.id] = {
          pool_rate: String(r.pool_rate ?? 0),
          income_cap_amount: String(r.income_cap_amount ?? 0),
          is_active: !!r.is_active,
          effective_from: r.effective_from ?? "",
        };
      }
      setDrafts(d);
    } catch (e: any) {
      toast.error("讀取失敗", { description: e?.message ?? String(e) });
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  function updateDraft(id: string, patch: Partial<Draft>) {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  async function save(id: string) {
    const d = drafts[id];
    if (!d) return;
    const pool_rate = Number(d.pool_rate);
    const income_cap_amount = Number(d.income_cap_amount);
    if (!Number.isFinite(pool_rate) || pool_rate < 0) {
      toast.error("分紅比例格式錯誤");
      return;
    }
    if (!Number.isFinite(income_cap_amount) || income_cap_amount < 0) {
      toast.error("每月累計上限格式錯誤");
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.effective_from)) {
      toast.error("生效日期格式錯誤");
      return;
    }
    setBusyId(id);
    try {
      await adminUpdateNationalBonusPoolSetting({
        data: {
          id,
          pool_rate,
          income_cap_amount,
          is_active: d.is_active,
          effective_from: d.effective_from,
        },
      });
      toast.success("已儲存");
      setConfirmId(null);
      await load();
    } catch (e: any) {
      toast.error("儲存失敗", { description: e?.message ?? String(e) });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/admin/bonuses">
            <ArrowLeft className="mr-1 h-4 w-4" />
            返回獎金營運中心
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Info className="h-5 w-5" /> 全國分紅設定（月結，STAR5 ~ DIRECTOR）
          </CardTitle>
          <CardDescription>
            依「新 VIP / 星級制度」設定四級全國分紅參數。全國分紅為月結，由 settle_monthly_bonus 統一觸發，本頁只修改設定，不會立即發放。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <div>1. 全國分紅 = 當月營業總獎勵點 × 分紅比例，於四級 pool 分別計算並於月結時發放。</div>
          <div>2. 僅有效 VIP（is_vip = true 且 vip_expires_at ≥ 結算日）可參與；vip_expires_at 為空視同過期。</div>
          <div>3. 每會員每級「每月累計」達到「每月累計上限」後停止發放，接近上限時只發剩餘額。</div>
          <div>4. 每月累計上限：STAR5 20 萬 / STAR6 30 萬 / STAR7 40 萬 / DIRECTOR 50 萬。</div>
          <div>5. 本頁不會執行月結，發放請於月結流程（settle_monthly_bonus）統一觸發。</div>
        </CardContent>
      </Card>


      {!canWrite && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="py-4 text-sm text-amber-600 dark:text-amber-400 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            您目前的角色為財務（finance），可查看設定但不可修改。
          </CardContent>
        </Card>
      )}

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            尚未建立任何 STAR5 ~ DIRECTOR 全國分紅設定。
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {rows.map((r) => {
            const d = drafts[r.id];
            if (!d) return null;
            const dirty =
              d.pool_rate !== String(r.pool_rate) ||
              d.income_cap_amount !== String(r.income_cap_amount) ||
              d.is_active !== r.is_active ||
              d.effective_from !== r.effective_from;
            return (
              <Card key={r.id}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between text-base">
                    <span>{TIER_LABEL[r.tier_code] ?? r.tier_code}</span>
                    <span className="text-xs text-muted-foreground font-normal">
                      更新於 {new Date(r.updated_at).toLocaleString()}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid gap-2">
                    <Label>分紅比例（0 ~ 1，例：0.02 = 2%）</Label>
                    <Input
                      type="number"
                      step="0.0001"
                      min={0}
                      max={1}
                      value={d.pool_rate}
                      disabled={!canWrite || busyId === r.id}
                      onChange={(e) => updateDraft(r.id, { pool_rate: e.target.value })}
                    />
                    <div className="text-xs text-muted-foreground">
                      顯示：{(Number(d.pool_rate || 0) * 100).toFixed(2)}%
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label>每月累計上限（點）</Label>
                    <Input
                      type="number"
                      step="1"
                      min={0}
                      value={d.income_cap_amount}
                      disabled={!canWrite || busyId === r.id}
                      onChange={(e) => updateDraft(r.id, { income_cap_amount: e.target.value })}
                    />
                    <div className="text-xs text-muted-foreground">
                      {TIER_CAP_HINT[r.tier_code] ?? "每月累計上限（本會員該級別每月最高可領獎勵點）"}
                    </div>
                  </div>


                  <div className="grid gap-2">
                    <Label>生效日期</Label>
                    <Input
                      type="date"
                      value={d.effective_from}
                      disabled={!canWrite || busyId === r.id}
                      onChange={(e) => updateDraft(r.id, { effective_from: e.target.value })}
                    />
                  </div>

                  <div className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <div className="text-sm font-medium">啟用此級別</div>
                      <div className="text-xs text-muted-foreground">停用後不會納入全國分紅</div>
                    </div>
                    <Switch
                      checked={d.is_active}
                      disabled={!canWrite || busyId === r.id}
                      onCheckedChange={(v) => updateDraft(r.id, { is_active: v })}
                    />
                  </div>

                  <div className="flex gap-2 pt-1">
                    <Button
                      disabled={!canWrite || busyId === r.id || !dirty}
                      onClick={() => setConfirmId(r.id)}
                    >
                      {busyId === r.id ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="mr-2 h-4 w-4" />
                      )}
                      儲存
                    </Button>
                    {dirty && (
                      <Button
                        variant="outline"
                        disabled={busyId === r.id}
                        onClick={() =>
                          updateDraft(r.id, {
                            pool_rate: String(r.pool_rate),
                            income_cap_amount: String(r.income_cap_amount),
                            is_active: r.is_active,
                            effective_from: r.effective_from,
                          })
                        }
                      >
                        還原
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <AlertDialog open={confirmId !== null} onOpenChange={(o) => !o && setConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認儲存全國分紅設定？</AlertDialogTitle>
            <AlertDialogDescription>
              本操作會更新該級別的全國分紅設定並寫入 audit_logs。
              本頁不會立即執行發放，也不會修改任何 bonus_records / wallet 紀錄。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busyId !== null}>取消</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmId && save(confirmId)} disabled={busyId !== null}>
              確認儲存
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
