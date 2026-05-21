import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableHead, TableHeader, TableRow, TableCell } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Coins, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { adminAdjustPoints } from "@/lib/points.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/points-admin")({
  component: PointsAdminPage,
});

function PointsAdminPage() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<any[]>([]);
  const [editUser, setEditUser] = useState<any | null>(null);
  const [form, setForm] = useState({ pointType: "shopping", amount: 0, note: "", source: "topup" });
  const [saving, setSaving] = useState(false);

  async function load() {
    let query = supabase.from("profiles").select("id, name, email, phone, member_no, is_vip, vip_expires_at").limit(100);
    if (q.trim()) query = query.or(`name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%,member_no.ilike.%${q}%`);
    const { data } = await query;
    // 帶上錢包
    const ids = (data ?? []).map((p: any) => p.id);
    let wallets: any[] = [];
    if (ids.length) {
      const { data: w } = await supabase.from("member_points_wallet" as any).select("*").in("user_id", ids);
      wallets = w ?? [];
    }
    const wMap = new Map(wallets.map((w: any) => [w.user_id, w]));
    setRows((data ?? []).map((p: any) => ({ ...p, wallet: wMap.get(p.id) })));
  }

  useEffect(() => {
    load();
  }, []);

  async function submit() {
    if (!editUser) return;
    setSaving(true);
    try {
      await adminAdjustPoints({
        data: {
          userId: editUser.id,
          pointType: form.pointType as any,
          amount: Math.floor(Number(form.amount) || 0),
          note: form.note || undefined,
          source: form.source,
        },
      });
      toast.success("點數調整完成");
      setEditUser(null);
      setForm({ pointType: "shopping", amount: 0, note: "", source: "topup" });
      load();
    } catch (e: any) {
      toast.error(e.message ?? "失敗");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <Coins className="h-6 w-6 text-primary" />點數管理
        </h1>
        <p className="text-sm text-muted-foreground mt-1">為會員儲值購物點、發放獎勵點或調整折扣點。</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">會員列表</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="搜尋姓名 / Email / 電話 / 會員編號"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && load()}
            />
          </div>

          <div className="rounded-lg border overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead>會員</TableHead>
                    <TableHead>聯絡方式</TableHead>
                    <TableHead className="text-right">購物點</TableHead>
                    <TableHead className="text-right">獎勵點</TableHead>
                    <TableHead className="text-right">折扣點</TableHead>
                    <TableHead>VIP</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">無資料</TableCell></TableRow>
                  ) : rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div className="font-medium">{r.name ?? "—"}</div>
                        <div className="text-xs text-muted-foreground font-mono">{r.member_no}</div>
                      </TableCell>
                      <TableCell className="text-xs">
                        <div>{r.email ?? "—"}</div>
                        <div className="text-muted-foreground">{r.phone ?? "—"}</div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{(r.wallet?.shopping_points ?? 0).toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums">{(r.wallet?.reward_points ?? 0).toLocaleString()}</TableCell>
                      <TableCell className="text-right tabular-nums">{(r.wallet?.discount_points ?? 0).toLocaleString()}</TableCell>
                      <TableCell className="text-xs">{r.is_vip ? `VIP · ${r.vip_expires_at ? new Date(r.vip_expires_at).toLocaleDateString() : "—"}` : "—"}</TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => setEditUser(r)}>調整點數</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!editUser} onOpenChange={(v) => !v && setEditUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>調整點數 — {editUser?.name ?? editUser?.email}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>點數類型</Label>
              <Select value={form.pointType} onValueChange={(v) => setForm({ ...form, pointType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="shopping">購物點（儲值）</SelectItem>
                  <SelectItem value="reward">獎勵點</SelectItem>
                  <SelectItem value="discount">折扣點</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>變動數量（正數=增加，負數=扣除）</Label>
              <Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: +e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>來源</Label>
              <Select value={form.source} onValueChange={(v) => setForm({ ...form, source: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="topup">儲值</SelectItem>
                  <SelectItem value="admin_adjust">管理員調整</SelectItem>
                  <SelectItem value="vip_bonus">VIP 獎勵</SelectItem>
                  <SelectItem value="referral">推廣獎勵</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>備註</Label>
              <Input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditUser(null)}>取消</Button>
            <Button onClick={submit} disabled={saving}>{saving ? "處理中…" : "確認"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
