import { useState } from "react";
import { CheckCircle2, Download, Loader2, PlayCircle, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuth, type AppRole } from "@/hooks/use-auth";
import { adminRunBonusRecalculation } from "@/lib/bonus.functions";

const APPLY_ROLES: AppRole[] = ["super_admin", "admin"];

type Mode = "correction" | "clawback";

function n(v: unknown) {
  return Number(v ?? 0).toLocaleString("zh-TW");
}

function summaryOf(result: any) {
  const before = result?.before ?? {};
  const after = result?.after ?? {};
  return {
    beforeRecords: Number(before.total_records ?? 0),
    beforePoints: Number(before.total_points ?? 0),
    afterRecords: Number(after.total_records ?? before.total_records ?? 0),
    afterPoints: Number(after.total_points ?? before.total_points ?? 0),
    releasedRecords: Number(after.released_records ?? before.released_records ?? 0),
    settlePoints: Number(
      result?.settlement_rpc?.points ?? result?.settlement_rpc?.total_points ?? 0,
    ),
  };
}

function DeltaCell({ label, before, after }: { label: string; before: number; after: number }) {
  const delta = after - before;
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm tabular-nums">
        {n(before)} → <span className="font-semibold">{n(after)}</span>
      </div>
      <div
        className={`text-xs tabular-nums ${
          delta > 0 ? "text-emerald-600" : delta < 0 ? "text-destructive" : "text-muted-foreground"
        }`}
      >
        差異 {delta > 0 ? "+" : ""}
        {n(delta)}
      </div>
    </div>
  );
}

export function MonthlyBackfillDialog({
  open,
  onOpenChange,
  ym,
  label,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  ym: string;
  label: string;
  onDone?: () => void;
}) {
  const { roles } = useAuth();
  const canApply = roles.some((r) => APPLY_ROLES.includes(r));

  const [mode, setMode] = useState<Mode>("correction");
  const [busy, setBusy] = useState(false);
  const [dryResult, setDryResult] = useState<any | null>(null);
  const [applyResult, setApplyResult] = useState<any | null>(null);

  const applyBlocked = dryResult?.blocked || dryResult?.apply_allowed === false;
  const step = applyResult ? 3 : dryResult ? 2 : 1;

  async function run(dryRun: boolean, runMode: Mode = mode) {
    setBusy(true);
    try {
      const res: any = await adminRunBonusRecalculation({
        data: { scope: "monthly", target: ym, dryRun, mode: runMode },
      });
      if (dryRun) {
        setDryResult(res);
        setApplyResult(null);
        if (res?.blocked || res?.apply_allowed === false) {
          toast.warning(res?.reason ?? res?.apply_block_reason ?? "此月份不允許直接補結");
        } else {
          toast.success("Dry-run 完成，請確認差異後執行補結");
        }
      } else {
        setApplyResult(res);
        toast.success("補結完成");
        onDone?.();
      }
    } catch (e: any) {
      toast.error(e?.message ?? "執行失敗");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setDryResult(null);
    setApplyResult(null);
    setMode("correction");
  }

  function downloadJson() {
    const payload = { ym, mode, dryRun: dryResult, apply: applyResult };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `monthly_backfill_${ym}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const shown = applyResult ?? dryResult;
  const s = shown ? summaryOf(shown) : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>月獎金補結 — {label}</DialogTitle>
          <DialogDescription>
            先執行 Dry-run 預覽差異，確認無誤後再一鍵執行正式補結（不直接異動錢包）。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* 步驟導引 */}
          <div className="flex items-center gap-2 text-xs">
            {["1. Dry-run 預覽", "2. 確認差異", "3. 正式補結"].map((t, i) => (
              <Badge key={t} variant={step > i ? "default" : "outline"}>
                {step > i + 1 ? <CheckCircle2 className="mr-1 h-3 w-3" /> : null}
                {t}
              </Badge>
            ))}
          </div>

          <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
            模式：
            <span className="font-medium text-foreground">
              {mode === "correction" ? "更正重算（補未發放的獎金）" : "追回已發放（產生負向紀錄）"}
            </span>
            <div className="mt-1">
              補結會重新計算 {label} 整月獎金；若該月已有 released 紀錄，系統會阻擋更正並建議改走追回。
            </div>
          </div>

          {applyBlocked && !applyResult && (
            <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm dark:bg-amber-950/30">
              <div className="font-medium text-amber-900 dark:text-amber-200">
                不允許直接補結：{dryResult?.reason ?? dryResult?.apply_block_reason}
              </div>
              <Button
                size="sm"
                variant="destructive"
                disabled={busy}
                onClick={() => {
                  setMode("clawback");
                  run(true, "clawback");
                }}
              >
                改用追回 Dry-run
              </Button>
            </div>
          )}

          {s && (
            <div className="space-y-2">
              <div className="text-sm font-medium">
                {applyResult ? "補結後差異摘要" : "Dry-run 差異摘要"}
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <DeltaCell label="獎金筆數" before={s.beforeRecords} after={s.afterRecords} />
                <DeltaCell label="獎金點數" before={s.beforePoints} after={s.afterPoints} />
                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">已發放筆數 / 本次應結點數</div>
                  <div className="mt-1 text-sm tabular-nums">
                    {n(s.releasedRecords)} / <span className="font-semibold">{n(s.settlePoints)}</span>
                  </div>
                  <div className="text-xs text-muted-foreground font-mono">
                    run {String(shown?.run_id ?? "-").slice(0, 8)}
                  </div>
                </div>
              </div>
              <details className="rounded-md border p-3">
                <summary className="cursor-pointer text-xs font-medium">原始 JSON</summary>
                <pre className="mt-2 max-h-64 overflow-auto rounded bg-muted p-2 text-[11px]">
                  {JSON.stringify(shown, null, 2)}
                </pre>
              </details>
            </div>
          )}
        </div>

        <DialogFooter className="flex-wrap gap-2">
          {shown && (
            <Button variant="ghost" onClick={downloadJson}>
              <Download className="mr-2 h-4 w-4" />
              下載報告
            </Button>
          )}
          <Button variant="outline" onClick={() => run(true)} disabled={busy}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlayCircle className="mr-2 h-4 w-4" />}
            {dryResult ? "重新 Dry-run" : "執行 Dry-run"}
          </Button>
          <Button
            variant={mode === "clawback" ? "destructive" : "default"}
            disabled={busy || !dryResult || applyBlocked || !canApply || Boolean(applyResult)}
            title={!canApply ? "只有 super_admin / admin 可執行正式補結" : undefined}
            onClick={() => run(false)}
          >
            <ShieldAlert className="mr-2 h-4 w-4" />
            一鍵執行正式補結
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
