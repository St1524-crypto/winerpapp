import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, ScrollText, Printer } from "lucide-react";
import { toast } from "sonner";
import { getSystemRuleSheet } from "@/lib/system-rules.functions";

export const Route = createFileRoute("/_authenticated/admin/system-rules")({
  component: SystemRulesPage,
  head: () => ({
    meta: [
      { title: "制度表（日／月／升級條件） — winerp" },
      { name: "description", content: "一次列出日獎金、月獎金與 VIP 升級條件的完整制度設定表。" },
    ],
  }),
});

const pct = (v: any) => (v === null || v === undefined || v === "" ? "—" : `${Number(v)}%`);
const num = (v: any) => (v === null || v === undefined || v === "" ? "—" : Number(v).toLocaleString());

function SystemRulesPage() {
  const load = useServerFn(getSystemRuleSheet);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load()
      .then((d: any) => setData(d))
      .catch((e: any) => toast.error(e?.message ?? "載入失敗"))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> 載入制度表…
      </div>
    );
  }
  if (!data) return <p className="p-6 text-muted-foreground">查無制度資料</p>;

  const tiers: any[] = data.tiers ?? [];
  const s = data.settings;

  return (
    <div className="container mx-auto px-4 py-6 space-y-6 max-w-[1400px]">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ScrollText className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold tracking-tight">制度表</h1>
            <p className="text-sm text-muted-foreground">日獎金 ＋ 月獎金 ＋ 升級條件，一次全數列出</p>
          </div>
        </div>
        <Button variant="outline" onClick={() => window.print()}>
          <Printer className="h-4 w-4 mr-2" />列印
        </Button>
      </div>

      {s && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">結算參數</CardTitle></CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-3 text-sm">
            <div>日結自動：<Badge variant={s.daily_bonus_auto_enabled ? "default" : "outline"}>{s.daily_bonus_auto_enabled ? "啟用" : "停用"}</Badge></div>
            <div>日結週期：{num(s.daily_bonus_cycle_days)} 天</div>
            <div>月結日：每月 {num(s.monthly_bonus_settlement_day)} 日</div>
            <div>月結模式：{s.monthly_bonus_mode ?? "—"}</div>
            <div>發放延遲：{num(s.reward_release_days)} 天（{s.reward_release_mode ?? "—"}）</div>
            <div>月責任額基準：{num(s.vip_required_points)} 點</div>
          </CardContent>
        </Card>
      )}

      {/* 升級條件 */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">一、VIP 升級條件</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>階級</TableHead>
                <TableHead>名稱</TableHead>
                <TableHead className="text-right">累積升級獎勵點</TableHead>
                <TableHead className="text-right">直推 VIP</TableHead>
                <TableHead>輔導條件</TableHead>
                <TableHead>條件邏輯</TableHead>
                <TableHead className="text-right">月責任額</TableHead>
                <TableHead>續約 / 維持</TableHead>
                <TableHead>狀態</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tiers.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.code}{t.legacy_code ? <span className="text-xs text-muted-foreground">（{t.legacy_code}）</span> : null}</TableCell>
                  <TableCell>{t.name}</TableCell>
                  <TableCell className="text-right tabular-nums">{num(t.required_reward_points)}</TableCell>
                  <TableCell className="text-right tabular-nums">{num(t.required_direct_vip)}{t.required_direct_vip_alt ? ` / ${t.required_direct_vip_alt}` : ""}</TableCell>
                  <TableCell>{t.required_mentor_tier ? `${t.required_mentor_tier} × ${num(t.required_mentor_count)}` : "—"}</TableCell>
                  <TableCell>{t.condition_logic ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{num(t.monthly_points_required)}</TableCell>
                  <TableCell className="text-xs">
                    {t.renewal_window_days ? `${num(t.renewal_window_days)} 天內新增 ${num(t.renewal_required_new_vip)} VIP` : "—"}
                    {t.maintenance_window_days ? ` ／ 維持 ${num(t.maintenance_window_days)} 天` : ""}
                  </TableCell>
                  <TableCell><Badge variant={t.status === "active" ? "default" : "outline"}>{t.status}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* 日獎金 */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">二、日獎金制度</CardTitle></CardHeader>
        <CardContent className="space-y-6 overflow-x-auto">
          <div>
            <h3 className="text-sm font-semibold mb-2">各階級日結比例</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>階級</TableHead>
                  <TableHead className="text-right">日推薦級差</TableHead>
                  <TableHead className="text-right">升級推薦</TableHead>
                  <TableHead className="text-right">營業分紅</TableHead>
                  <TableHead className="text-right">消費回饋（分潤）</TableHead>
                  <TableHead className="text-right">全球分紅</TableHead>
                  <TableHead className="text-right">營業分紅上限</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tiers.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.code}</TableCell>
                    <TableCell className="text-right tabular-nums">{pct(t.daily_referral_rate)}</TableCell>
                    <TableCell className="text-right tabular-nums">{pct(t.upgrade_referral_rate)}</TableCell>
                    <TableCell className="text-right tabular-nums">{pct(t.business_bonus_rate)}</TableCell>
                    <TableCell className="text-right tabular-nums">{pct(t.revenue_share_rate)}</TableCell>
                    <TableCell className="text-right tabular-nums">{pct(t.global_bonus_rate)}</TableCell>
                    <TableCell className="text-right tabular-nums">{num(t.upgrade_bonus_cap_amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div>
            <h3 className="text-sm font-semibold mb-2">分紅池（每日總獎勵點 × 比例，合格名單均分）</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>池別</TableHead>
                  <TableHead>代碼</TableHead>
                  <TableHead>適用階級</TableHead>
                  <TableHead className="text-right">比例</TableHead>
                  <TableHead>分配方式</TableHead>
                  <TableHead className="text-right">總收益上限</TableHead>
                  <TableHead>狀態</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data.pools ?? []).map((p: any) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{p.code}</TableCell>
                    <TableCell className="text-xs">{(p.tier_codes ?? []).join("、") || "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{pct(p.bonus_rate)}</TableCell>
                    <TableCell>{p.distribution_method ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{p.apply_total_income_cap ? num(p.total_income_cap_amount) : "—"}</TableCell>
                    <TableCell><Badge variant={p.status === "active" ? "default" : "outline"}>{p.status}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* 月獎金 */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">三、月獎金制度</CardTitle></CardHeader>
        <CardContent className="space-y-6 overflow-x-auto">
          <div>
            <h3 className="text-sm font-semibold mb-2">複購獎金（月結，未達當月責任額直接取消）</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>代數</TableHead>
                  <TableHead className="text-right">比例</TableHead>
                  <TableHead>狀態</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data.repurchase ?? []).map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell>第 {r.generation_level} 代</TableCell>
                    <TableCell className="text-right tabular-nums">{pct(r.bonus_rate)}</TableCell>
                    <TableCell><Badge variant={r.enabled ? "default" : "outline"}>{r.enabled ? "啟用" : "停用"}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div>
            <h3 className="text-sm font-semibold mb-2">月達成分紅（階梯）</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">達成點數門檻</TableHead>
                  <TableHead className="text-right">比例</TableHead>
                  <TableHead>狀態</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data.monthlyTier ?? []).map((m: any) => (
                  <TableRow key={m.id}>
                    <TableCell className="text-right tabular-nums">{num(m.threshold_points)}</TableCell>
                    <TableCell className="text-right tabular-nums">{pct(m.bonus_rate)}</TableCell>
                    <TableCell><Badge variant={m.enabled ? "default" : "outline"}>{m.enabled ? "啟用" : "停用"}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div>
            <h3 className="text-sm font-semibold mb-2">位階超額回饋</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>位階</TableHead>
                  <TableHead>名稱</TableHead>
                  <TableHead className="text-right">責任額</TableHead>
                  <TableHead className="text-right">超額回饋率</TableHead>
                  <TableHead>狀態</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data.rankRebate ?? []).map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.rank_code}</TableCell>
                    <TableCell>{r.rank_name}</TableCell>
                    <TableCell className="text-right tabular-nums">{num(r.required_points)}</TableCell>
                    <TableCell className="text-right tabular-nums">{pct(r.exceeded_rebate_rate)}</TableCell>
                    <TableCell><Badge variant={r.enabled ? "default" : "outline"}>{r.enabled ? "啟用" : "停用"}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div>
            <h3 className="text-sm font-semibold mb-2">全國分紅（月結）</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>階級</TableHead>
                  <TableHead className="text-right">池比例</TableHead>
                  <TableHead className="text-right">每月收益上限</TableHead>
                  <TableHead>生效日</TableHead>
                  <TableHead>狀態</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data.national ?? []).map((n: any) => (
                  <TableRow key={n.id}>
                    <TableCell className="font-medium">{n.tier_code}</TableCell>
                    <TableCell className="text-right tabular-nums">{pct(n.pool_rate)}</TableCell>
                    <TableCell className="text-right tabular-nums">{num(n.income_cap_amount)}</TableCell>
                    <TableCell>{n.effective_from ?? "—"}</TableCell>
                    <TableCell><Badge variant={n.is_active ? "default" : "outline"}>{n.is_active ? "啟用" : "停用"}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        獎金發放依制度拆分：80% 現金錢包、20% 貢獻點；本頁為唯讀彙整，修改請至各設定頁面。
      </p>
    </div>
  );
}
