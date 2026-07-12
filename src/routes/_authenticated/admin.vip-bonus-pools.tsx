import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Pencil, Trash2, Calculator } from "lucide-react";
import { toast } from "sonner";
import {
  adminListVipBonusPools,
  upsertVipBonusPool,
  deleteVipBonusPool,
  previewVipBonusPool,
} from "@/lib/vip-bonus-pools.functions";

export const Route = createFileRoute("/_authenticated/admin/vip-bonus-pools")({
  component: Page,
  head: () => ({ meta: [{ title: "VIP 星級升級分紅池 — winerp" }] }),
  errorComponent: ({ error, reset }) => {
    const router = useRouter();
    return (
      <div className="p-6">
        <p className="text-destructive">載入失敗：{error.message}</p>
        <Button className="mt-2" onClick={() => { reset(); router.invalidate(); }}>重試</Button>
      </div>
    );
  },
});

const emptyPool: any = {
  id: "",
  name: "",
  code: "",
  tier_codes: "",
  bonus_rate: 0.05,
  distribution_method: "equal",
  apply_total_income_cap: true,
  total_income_cap_amount: "",
  sort_order: 0,
  status: "active",
  description: "",
};

function fmt(n: any) {
  if (n === null || n === undefined || n === "") return "—";
  return `NT$${Number(n).toLocaleString()}`;
}

function Page() {
  const listFn = useServerFn(adminListVipBonusPools);
  const saveFn = useServerFn(upsertVipBonusPool);
  const delFn = useServerFn(deleteVipBonusPool);
  const previewFn = useServerFn(previewVipBonusPool);

  const [rows, setRows] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<any>({ ...emptyPool });

  // 試算
  const [previewPoolId, setPreviewPoolId] = useState("");
  const [dailyTotal, setDailyTotal] = useState(100000);
  const [eligible, setEligible] = useState(10);
  const [result, setResult] = useState<any>(null);

  async function load() {
    try { setRows((await listFn()) as any[]); } catch (e: any) { toast.error(e.message); }
  }
  useEffect(() => { load(); }, []);

  function edit(r: any) {
    setForm({
      ...emptyPool,
      ...r,
      tier_codes: Array.isArray(r.tier_codes) ? r.tier_codes.join(",") : (r.tier_codes ?? ""),
      total_income_cap_amount: r.total_income_cap_amount ?? "",
      description: r.description ?? "",
      code: r.code ?? "",
    });
    setOpen(true);
  }
  function add() { setForm({ ...emptyPool }); setOpen(true); }

  async function save() {
    try {
      const payload: any = {
        ...form,
        bonus_rate: Number(form.bonus_rate) || 0,
        sort_order: Number(form.sort_order) || 0,
        tier_codes: String(form.tier_codes || "")
          .split(",").map((s: string) => s.trim()).filter(Boolean),
        total_income_cap_amount: form.total_income_cap_amount === "" ? null : Number(form.total_income_cap_amount),
        code: form.code || null,
        description: form.description || null,
      };
      if (!payload.id) delete payload.id;
      await saveFn({ data: payload });
      toast.success("已儲存");
      setOpen(false);
      load();
    } catch (e: any) { toast.error(e.message); }
  }

  async function remove(id: string) {
    if (!confirm("確定停用刪除此分紅池？")) return;
    try { await delFn({ data: { id } }); toast.success("已刪除"); load(); }
    catch (e: any) { toast.error(e.message); }
  }

  async function runPreview() {
    try {
      const r = await previewFn({ data: {
        poolId: previewPoolId,
        dailyTotalRewardPoints: Number(dailyTotal),
        eligibleMemberCount: Number(eligible),
      }});
      setResult(r);
    } catch (e: any) { toast.error(e.message); }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">VIP 星級升級分紅池</h1>
        <div className="flex gap-2">
          <Badge variant="secondary">第一階段：設定 / 試算（未接核心發放）</Badge>
          <Button onClick={add}><Plus className="h-4 w-4 mr-1" />新增分紅池</Button>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>分紅池列表</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>名稱</TableHead>
                <TableHead>代碼</TableHead>
                <TableHead>適用星級</TableHead>
                <TableHead>比例</TableHead>
                <TableHead>總收益上限</TableHead>
                <TableHead>狀態</TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-xs">{r.code}</TableCell>
                  <TableCell>{(r.tier_codes ?? []).join(" / ") || "—"}</TableCell>
                  <TableCell>{(Number(r.bonus_rate) * 100).toFixed(2)}%</TableCell>
                  <TableCell className="text-xs">
                    {r.apply_total_income_cap ? fmt(r.total_income_cap_amount) : "不套用"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={r.status === "active" ? "default" : "secondary"}>{r.status}</Badge>
                  </TableCell>
                  <TableCell className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => edit(r)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(r.id)}><Trash2 className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Calculator className="h-5 w-5" />每日試算（不寫入）</CardTitle></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          <div className="space-y-1">
            <Label>分紅池</Label>
            <select className="w-full border rounded h-9 px-2 bg-background"
              value={previewPoolId} onChange={(e) => setPreviewPoolId(e.target.value)}>
              <option value="">請選擇</option>
              {rows.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div className="space-y-1">
            <Label>每日營業總獎勵點</Label>
            <Input type="number" value={dailyTotal} onChange={(e) => setDailyTotal(Number(e.target.value))} />
          </div>
          <div className="space-y-1">
            <Label>符合資格人數</Label>
            <Input type="number" value={eligible} onChange={(e) => setEligible(Number(e.target.value))} />
          </div>
          <div className="flex items-end">
            <Button disabled={!previewPoolId} onClick={runPreview}>試算</Button>
          </div>
          {result && (
            <div className="md:col-span-4 grid grid-cols-2 md:grid-cols-5 gap-2 text-sm">
              <Field label="比例" value={`${(Number(result.bonus_rate) * 100).toFixed(2)}%`} />
              <Field label="池總金額" value={fmt(result.pool_amount)} />
              <Field label="符合人數" value={String(result.eligible_member_count)} />
              <Field label="每人可領" value={fmt(result.per_member_amount)} />
              <Field label="狀態" value={result.status} />
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{form.id ? "編輯" : "新增"}分紅池</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>名稱</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div><Label>代碼</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
            <div className="col-span-2"><Label>適用星級（逗號分隔，例 1,2,3）</Label>
              <Input value={form.tier_codes} onChange={(e) => setForm({ ...form, tier_codes: e.target.value })} />
            </div>
            <div><Label>分紅比例（0.05 = 5%）</Label>
              <Input type="number" step="0.0001" value={form.bonus_rate}
                onChange={(e) => setForm({ ...form, bonus_rate: e.target.value })} />
            </div>
            <div><Label>分配方式</Label>
              <select className="w-full border rounded h-9 px-2 bg-background"
                value={form.distribution_method}
                onChange={(e) => setForm({ ...form, distribution_method: e.target.value })}>
                <option value="equal">平均分配</option>
              </select>
            </div>
            <div className="flex items-center gap-2 pt-6">
              <Switch checked={!!form.apply_total_income_cap}
                onCheckedChange={(v) => setForm({ ...form, apply_total_income_cap: v })} />
              <Label>套用總收益上限</Label>
            </div>
            <div><Label>總收益上限金額</Label>
              <Input type="number" value={form.total_income_cap_amount}
                onChange={(e) => setForm({ ...form, total_income_cap_amount: e.target.value })}
                disabled={!form.apply_total_income_cap} />
            </div>
            <div><Label>排序</Label>
              <Input type="number" value={form.sort_order}
                onChange={(e) => setForm({ ...form, sort_order: e.target.value })} />
            </div>
            <div><Label>狀態</Label>
              <select className="w-full border rounded h-9 px-2 bg-background"
                value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="active">啟用</option><option value="inactive">停用</option>
              </select>
            </div>
            <div className="col-span-2"><Label>說明</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
            <Button onClick={save}>儲存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border p-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}
