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
import { adminAdjustPoints, getSignupDiscountBonus, setSignupDiscountBonus } from "@/lib/points.functions";
import { toast } from "sonner";
import { Gift } from "lucide-react";

export const Route = createFileRoute("/_authenticated/points-admin")({
  component: PointsAdminPage,
});

function PointsAdminPage() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<any[]>([]);
  const [editUser, setEditUser] = useState<any | null>(null);
  const [form, setForm] = useState({ pointType: "shopping", amount: "0", note: "", source: "topup" });
  const [saving, setSaving] = useState(false);

  const [loading, setLoading] = useState(false);

  async function load(keyword = q) {
    setLoading(true);
    try {
      const term = keyword.trim().replace(/[%,()]/g, "");
      let query = supabase.from("profiles").select("id, name, email, phone, member_no, is_vip, vip_expires_at").limit(100);
      if (term) query = query.or(`name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%,member_no.ilike.%${term}%`);
      const { data, error } = await query;
      if (error) throw error;
      // 帶上錢包
      const ids = (data ?? []).map((p: any) => p.id);
      let wallets: any[] = [];
      if (ids.length) {
        const { data: w } = await supabase.from("member_points_wallet" as any).select("*").in("user_id", ids);
        wallets = w ?? [];
      }
      const wMap = new Map(wallets.map((w: any) => [w.user_id, w]));
      setRows((data ?? []).map((p: any) => ({ ...p, wallet: wMap.get(p.id) })));
    } catch (e: any) {
      toast.error(e.message ?? "載入失敗");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const t = setTimeout(() => load(q), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);


  async function submit() {
    if (!editUser) return;
    const amt = Math.trunc(Number(String(form.amount).replace(/[\s,]/g, "")));
    if (!Number.isFinite(amt) || amt === 0) {
      toast.error("請輸入有效的變動數量（可用 + / - 開頭）");
      return;
    }
    setSaving(true);
    try {
      await adminAdjustPoints({
        data: {
          userId: editUser.id,
          pointType: form.pointType as any,
          amount: amt,
          note: form.note || undefined,
          source: form.source,
        },
      });
      toast.success("點數調整完成");
      setEditUser(null);
      setForm({ pointType: "shopping", amount: "0", note: "", source: "topup" });
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
        <p className="text-sm text-muted-foreground mt-1">為會員儲值購物點、發放貢獻點或調整折扣點。</p>
      </div>

      <SignupBonusCard />

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
                    <TableHead className="text-right">貢獻點</TableHead>
                    <TableHead className="text-right">折扣點</TableHead>
                    <TableHead>VIP</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">搜尋中…</TableCell></TableRow>
                  ) : rows.length === 0 ? (
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
            <div className="grid grid-cols-3 gap-2 rounded-lg border bg-muted/30 p-3 text-center">
              {([
                ["shopping", "購物點", editUser?.wallet?.shopping_points ?? 0],
                ["reward", "貢獻點", editUser?.wallet?.reward_points ?? 0],
                ["discount", "折扣點", editUser?.wallet?.discount_points ?? 0],
              ] as const).map(([key, label, val]) => (
                <div key={key} className={form.pointType === key ? "rounded-md bg-primary/10 py-1" : "py-1"}>
                  <div className="text-xs text-muted-foreground">{label}</div>
                  <div className="text-lg font-semibold tabular-nums">{Number(val).toLocaleString()}</div>
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <Label>點數類型</Label>
              <Select value={form.pointType} onValueChange={(v) => setForm({ ...form, pointType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="shopping">購物點（儲值）</SelectItem>
                  <SelectItem value="reward">貢獻點</SelectItem>
                  <SelectItem value="discount">折扣點</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>變動數量（可直接輸入 +100 或 -100）</Label>
              <div className="flex gap-2">
                <Input
                  inputMode="text"
                  placeholder="例：+1000 或 -500"
                  value={form.amount}
                  onChange={(e) => {
                    const v = e.target.value.replace(/[^0-9+\-]/g, "").replace(/(?!^)[+\-]/g, "");
                    setForm({ ...form, amount: v });
                  }}
                />
                <Button type="button" variant="outline" size="icon" onClick={() => setForm({ ...form, amount: String(Math.abs(Math.trunc(Number(form.amount) || 0))) })}>+</Button>
                <Button type="button" variant="outline" size="icon" onClick={() => setForm({ ...form, amount: String(-Math.abs(Math.trunc(Number(form.amount) || 0))) })}>−</Button>
              </div>
              {(() => {
                const cur = Number(
                  form.pointType === "shopping" ? editUser?.wallet?.shopping_points ?? 0
                  : form.pointType === "reward" ? editUser?.wallet?.reward_points ?? 0
                  : editUser?.wallet?.discount_points ?? 0
                );
                const delta = Math.trunc(Number(form.amount) || 0);
                return (
                  <p className="text-xs text-muted-foreground">
                    調整後：<span className="font-mono font-semibold text-foreground">{(cur + delta).toLocaleString()}</span>（目前 {cur.toLocaleString()}）
                  </p>
                );
              })()}
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

function SignupBonusCard() {
  const [points, setPoints] = useState<number>(1000);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await getSignupDiscountBonus();
        setPoints(Number(r.points ?? 1000));
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function save() {
    setSaving(true);
    try {
      const val = Math.max(0, Math.floor(Number(points) || 0));
      await setSignupDiscountBonus({ data: { points: val } });
      toast.success(`已設定為 ${val} 折扣點`);
    } catch (e: any) {
      toast.error(e.message ?? "儲存失敗");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Gift className="h-4 w-4 text-primary" />
          新會員註冊贈送折扣點
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          遊客快速註冊成功時，系統自動發放折扣點；設為 0 表示停用。
        </p>
        <div className="flex items-end gap-3 max-w-md">
          <div className="flex-1 space-y-1">
            <Label>贈送折扣點</Label>
            <Input
              type="number"
              min={0}
              value={points}
              disabled={loading}
              onChange={(e) => setPoints(Number(e.target.value))}
            />
          </div>
          <Button onClick={save} disabled={saving || loading}>
            {saving ? "儲存中…" : "儲存"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
