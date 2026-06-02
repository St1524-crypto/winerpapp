import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, TrendingUp, Search, Crown } from "lucide-react";
import { adminListReferralOverview, processOrderCommission, adminUpdateSponsor } from "@/lib/referral.functions";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth, type AppRole } from "@/hooks/use-auth";
import { ForbiddenScreen } from "@/components/ForbiddenScreen";

const REFERRAL_ADMIN_ROLES: AppRole[] = ["super_admin", "admin", "finance", "sales"];

export const Route = createFileRoute("/_authenticated/admin/referrals")({
  component: AdminReferralsGuard,
});

function AdminReferralsGuard() {
  const { roles, loading } = useAuth();
  if (loading) {
    return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }
  if (!roles.some((r) => REFERRAL_ADMIN_ROLES.includes(r))) {
    return <ForbiddenScreen requiredRoles={REFERRAL_ADMIN_ROLES} pageName="推廣總覽 / 結算" />;
  }
  return <AdminReferralsPage />;
}

function AdminReferralsPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [orderNo, setOrderNo] = useState("");
  const [processing, setProcessing] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editUserId, setEditUserId] = useState("");
  const [editSponsorCode, setEditSponsorCode] = useState("");

  async function load() {
    setLoading(true);
    try {
      const res = await adminListReferralOverview();
      setData(res);
    } catch (e: any) {
      toast.error(e.message ?? "載入失敗");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function settleOrder() {
    if (!orderNo.trim()) return;
    setProcessing(true);
    try {
      // 以訂單編號查 id
      const { data: o } = await supabase.from("sales_orders").select("id").eq("order_no", orderNo.trim()).maybeSingle();
      if (!o) { toast.error("找不到此訂單"); return; }
      const res = await processOrderCommission({ data: { orderId: (o as any).id } });
      toast.success(`已結算 +${res.points} 點（比例 ${res.rate}%）`);
      setOrderNo("");
      load();
    } catch (e: any) {
      toast.error(e.message ?? "結算失敗");
    } finally {
      setProcessing(false);
    }
  }

  async function saveSponsor() {
    try {
      let sponsorId: string | null = null;
      if (editSponsorCode.trim()) {
        const code = editSponsorCode.trim().toUpperCase();
        const { data: r } = await supabase.from("profiles").select("id").or(`referral_code.eq.${code},member_no.eq.${code}`).maybeSingle();
        if (!r) { toast.error("找不到推薦人"); return; }
        sponsorId = (r as any).id;
      }
      await adminUpdateSponsor({ data: { userId: editUserId, sponsorId } });
      toast.success("已更新");
      setEditOpen(false);
      load();
    } catch (e: any) {
      toast.error(e.message ?? "更新失敗");
    }
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  if (!data) return null;

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <TrendingUp className="h-6 w-6 text-primary" />VIP 推廣管理
        </h1>
        <p className="text-sm text-muted-foreground mt-1">推廣排行、佣金結算、推薦關係調整</p>
      </div>

      {/* 手動結算 */}
      <Card>
        <CardHeader><CardTitle className="text-base">結算訂單佣金</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">輸入已付款的訂單編號，系統將依推薦人 VIP 方案比例發放獎勵點。每筆訂單只能結算一次。</p>
          <div className="flex gap-2 max-w-md">
            <Input placeholder="訂單編號（如 SO000123）" value={orderNo} onChange={(e) => setOrderNo(e.target.value)} />
            <Button onClick={settleOrder} disabled={processing || !orderNo.trim()}>
              {processing && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}結算
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 排行榜 */}
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Crown className="h-4 w-4" />推廣排行榜</CardTitle></CardHeader>
        <CardContent>
          {data.ranking.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">尚無紀錄</p>
          ) : (
            <Table>
              <TableHeader><TableRow><TableHead>#</TableHead><TableHead>會員</TableHead><TableHead>身份</TableHead><TableHead className="text-right">推廣訂單</TableHead><TableHead className="text-right">總業績</TableHead><TableHead className="text-right">總點數</TableHead></TableRow></TableHeader>
              <TableBody>
                {data.ranking.map((r: any, i: number) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-bold tabular-nums">{i + 1}</TableCell>
                    <TableCell>{r.name} <span className="text-xs text-muted-foreground font-mono ml-1">{r.member_no}</span></TableCell>
                    <TableCell>{r.is_vip ? <Badge className="bg-amber-500/15 text-amber-700 border-0">VIP</Badge> : <span className="text-xs text-muted-foreground">一般</span>}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.count}</TableCell>
                    <TableCell className="text-right tabular-nums">NT$ {Number(r.total_base).toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums font-medium text-primary">{Number(r.total_points).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* 最近紀錄 */}
      <Card>
        <CardHeader><CardTitle className="text-base">最近 200 筆佣金紀錄</CardTitle></CardHeader>
        <CardContent>
          {data.recent.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">尚無紀錄</p>
          ) : (
            <Table>
              <TableHeader><TableRow><TableHead>時間</TableHead><TableHead className="text-right">訂單金額</TableHead><TableHead className="text-right">比例</TableHead><TableHead className="text-right">點數</TableHead><TableHead>狀態</TableHead></TableRow></TableHeader>
              <TableBody>
                {data.recent.map((l: any) => (
                  <TableRow key={l.id}>
                    <TableCell className="text-xs">{new Date(l.created_at).toLocaleString()}</TableCell>
                    <TableCell className="text-right tabular-nums text-xs">NT$ {Number(l.base_amount).toLocaleString()}</TableCell>
                    <TableCell className="text-right text-xs">{l.rate_percent}%</TableCell>
                    <TableCell className="text-right tabular-nums font-medium text-primary">+{l.points}</TableCell>
                    <TableCell><Badge variant={l.status === "granted" ? "default" : "secondary"}>{l.status}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>修改推薦歸屬</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>會員 ID</Label><Input value={editUserId} onChange={(e) => setEditUserId(e.target.value)} /></div>
            <div><Label>推薦人 (推薦碼或會員編號，留空 = 取消)</Label><Input value={editSponsorCode} onChange={(e) => setEditSponsorCode(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditOpen(false)}>取消</Button>
            <Button onClick={saveSponsor}>儲存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
