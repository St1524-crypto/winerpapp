import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Crown, TrendingUp, Users, Coins, Loader2, Copy, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getMyVipEarnings } from "@/lib/referral.functions";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/my-referrals")({
  component: MyReferralsPage,
});

function MyReferralsPage() {
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<{ referral_code: string | null; marketing_slug: string | null; is_vip: boolean }>({ referral_code: null, marketing_slug: null, is_vip: false });

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [res, { data: p }] = await Promise.all([
        getMyVipEarnings(),
        supabase.from("profiles").select("referral_code, marketing_slug, is_vip").eq("id", user.id).maybeSingle(),
      ]);
      setData(res);
      setProfile({
        referral_code: (p as any)?.referral_code ?? null,
        marketing_slug: (p as any)?.marketing_slug ?? null,
        is_vip: !!(p as any)?.is_vip,
      });
      setLoading(false);
    })();
  }, [user]);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!data) return null;

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const myUrl = `${origin}/u/${profile.marketing_slug || profile.referral_code || ""}`;

  function copy() { navigator.clipboard.writeText(myUrl); toast.success("專屬連結已複製"); }
  function share() {
    if (navigator.share) navigator.share({ url: myUrl }).catch(() => {});
    else copy();
  }

  const s = data.stats;
  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Crown className="h-6 w-6 text-primary" />我的推廣收益
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {profile.is_vip ? "VIP 會員 — 旗下消費獎勵自動歸屬於您" : "升級 VIP 後旗下消費可獲得回饋點數"}
        </p>
      </div>

      {/* 專屬連結 */}
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="p-4 space-y-2">
          <p className="text-xs text-muted-foreground">您的專屬推廣網址</p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="text-sm font-mono bg-background px-3 py-1.5 rounded border break-all flex-1 min-w-[200px]">{myUrl}</code>
            <Button size="sm" variant="outline" onClick={copy}><Copy className="h-3.5 w-3.5 mr-1" />複製</Button>
            <Button size="sm" onClick={share}><Share2 className="h-3.5 w-3.5 mr-1" />分享</Button>
          </div>
        </CardContent>
      </Card>

      {/* 統計卡 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat icon={Coins} label="今日獎勵" value={s.today_points} suffix="點" />
        <Stat icon={TrendingUp} label="本月獎勵" value={s.month_points} suffix="點" />
        <Stat icon={Coins} label="累積獎勵" value={s.total_points} suffix="點" />
        <Stat icon={Users} label="團隊會員" value={s.team_count} suffix="人" />
      </div>

      {/* 團隊名單 */}
      <Card>
        <CardHeader><CardTitle className="text-base">團隊會員（旗下推薦會員）</CardTitle></CardHeader>
        <CardContent>
          {data.team.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">尚無推薦會員</p>
          ) : (
            <Table>
              <TableHeader><TableRow><TableHead>會員編號</TableHead><TableHead>姓名</TableHead><TableHead>電話</TableHead><TableHead>身份</TableHead><TableHead>加入時間</TableHead></TableRow></TableHeader>
              <TableBody>
                {data.team.map((t: any) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-mono text-xs">{t.member_no}</TableCell>
                    <TableCell>{t.name}</TableCell>
                    <TableCell className="text-xs">{t.phone ?? "—"}</TableCell>
                    <TableCell>{t.is_vip ? <Badge className="bg-amber-500/15 text-amber-700 border-0">VIP</Badge> : <span className="text-xs text-muted-foreground">一般</span>}</TableCell>
                    <TableCell className="text-xs">{new Date(t.created_at).toLocaleDateString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* 點數明細 */}
      <Card>
        <CardHeader><CardTitle className="text-base">獎勵明細</CardTitle></CardHeader>
        <CardContent>
          {data.logs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">尚無獎勵紀錄</p>
          ) : (
            <Table>
              <TableHeader><TableRow><TableHead>時間</TableHead><TableHead>消費會員</TableHead><TableHead className="text-right">訂單金額</TableHead><TableHead className="text-right">比例</TableHead><TableHead className="text-right">獲得點數</TableHead><TableHead>狀態</TableHead></TableRow></TableHeader>
              <TableBody>
                {data.logs.map((l: any) => (
                  <TableRow key={l.id}>
                    <TableCell className="text-xs">{new Date(l.created_at).toLocaleString()}</TableCell>
                    <TableCell className="text-xs">{l.buyer_name} <span className="text-muted-foreground">{l.buyer_no}</span></TableCell>
                    <TableCell className="text-right tabular-nums text-xs">NT$ {Number(l.base_amount).toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums text-xs">{l.rate_percent}%</TableCell>
                    <TableCell className="text-right tabular-nums font-medium text-primary">+{l.points}</TableCell>
                    <TableCell><Badge variant={l.status === "granted" ? "default" : "secondary"}>{l.status === "granted" ? "已發放" : l.status}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ icon: Icon, label, value, suffix }: any) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
          <Icon className="h-3.5 w-3.5" />{label}
        </div>
        <div className="text-2xl font-bold tabular-nums">{Number(value).toLocaleString()} <span className="text-xs text-muted-foreground font-normal">{suffix}</span></div>
      </CardContent>
    </Card>
  );
}
