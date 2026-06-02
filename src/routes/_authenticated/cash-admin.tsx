import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Wallet, CheckCircle2, XCircle, Plus, Minus } from "lucide-react";
import { toast } from "sonner";
import { adminListCashTx, adminProcessCashTx, adminAdjustCash } from "@/lib/cash-wallet.functions";

export const Route = createFileRoute("/_authenticated/cash-admin")({ component: Page });

const TX_LABEL: Record<string, string> = {
  topup: "充值", withdraw: "提現", buy_points: "購買購物點", refund: "退款", adjust: "管理員調整",
};
const STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  approved: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  completed: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  rejected: "bg-red-500/15 text-red-500 border-red-500/30",
};
const STATUS_LABEL: Record<string, string> = {
  pending: "待處理", approved: "已核准", completed: "已完成", rejected: "已拒絕",
};

function Page() {
  const [status, setStatus] = useState<"pending" | "approved" | "rejected" | "completed" | "all">("pending");
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [adjOpen, setAdjOpen] = useState(false);
  const [adjUserId, setAdjUserId] = useState("");
  const [adjAmount, setAdjAmount] = useState("");
  const [adjNote, setAdjNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminListCashTx({ data: { status } });
      setRows(data as any[]);
    } catch (e: any) { toast.error(e.message ?? "載入失敗"); }
    finally { setLoading(false); }
  }, [status]);

  useEffect(() => { load(); }, [load]);

  async function act(id: string, action: "approve" | "reject") {
    setBusyId(id);
    try {
      await adminProcessCashTx({ data: { txId: id, action } });
      toast.success(action === "approve" ? "已核准" : "已拒絕");
      load();
    } catch (e: any) { toast.error(e.message ?? "操作失敗"); }
    finally { setBusyId(null); }
  }

  async function submitAdjust() {
    const amt = Number(adjAmount);
    if (!adjUserId.trim()) return toast.error("請填會員 UUID");
    if (!amt) return toast.error("請輸入金額");
    try {
      await adminAdjustCash({ data: { userId: adjUserId.trim(), amount: amt, note: adjNote || undefined } });
      toast.success("調整完成");
      setAdjOpen(false); setAdjUserId(""); setAdjAmount(""); setAdjNote("");
      load();
    } catch (e: any) { toast.error(e.message ?? "調整失敗"); }
  }

  return (
    <div className="max-w-[1600px] mx-auto space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Wallet className="h-6 w-6 text-primary" />現金錢包審核</h1>
          <p className="text-sm text-muted-foreground mt-1">審核會員的現金充值 / 提現 / 購買購物點交易。</p>
        </div>
        <Button onClick={() => setAdjOpen(true)} variant="outline"><Plus className="h-4 w-4 mr-2" />手動調整餘額</Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">交易清單</CardTitle>
          <Tabs value={status} onValueChange={(v) => setStatus(v as any)} className="mt-2">
            <TabsList>
              <TabsTrigger value="pending">待處理</TabsTrigger>
              <TabsTrigger value="approved">已核准</TabsTrigger>
              <TabsTrigger value="rejected">已拒絕</TabsTrigger>
              <TabsTrigger value="completed">已完成</TabsTrigger>
              <TabsTrigger value="all">全部</TabsTrigger>
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>時間</TableHead>
                <TableHead>會員</TableHead>
                <TableHead>類型</TableHead>
                <TableHead className="text-right">金額</TableHead>
                <TableHead>狀態</TableHead>
                <TableHead>備註 / 帳戶</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}><TableCell colSpan={7}><Skeleton className="h-8 w-full" /></TableCell></TableRow>
              )) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-10">尚無資料</TableCell></TableRow>
              ) : rows.map((t: any) => (
                <TableRow key={t.id}>
                  <TableCell className="text-xs text-muted-foreground">{new Date(t.created_at).toLocaleString()}</TableCell>
                  <TableCell>
                    <div className="text-sm font-medium">{t.member?.name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground font-mono">{t.member?.member_no ?? ""} · {t.member?.phone ?? t.member?.email ?? ""}</div>
                  </TableCell>
                  <TableCell>{TX_LABEL[t.tx_type] ?? t.tx_type}</TableCell>
                  <TableCell className={`text-right font-mono ${Number(t.amount) >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                    {Number(t.amount) >= 0 ? "+" : ""}{Number(t.amount).toLocaleString()}
                  </TableCell>
                  <TableCell><Badge variant="outline" className={STATUS_STYLE[t.status] ?? ""}>{STATUS_LABEL[t.status] ?? t.status}</Badge></TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[300px]">
                    {t.payment_method && <div>付款：{t.payment_method}</div>}
                    {t.bank_info && <div>帳戶：{t.bank_info}</div>}
                    {t.note && <div className="truncate">{t.note}</div>}
                  </TableCell>
                  <TableCell className="text-right">
                    {t.status === "pending" ? (
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="outline" disabled={busyId === t.id} onClick={() => act(t.id, "approve")} className="text-emerald-600 border-emerald-500/40 hover:bg-emerald-500/10">
                          <CheckCircle2 className="h-4 w-4 mr-1" />核准
                        </Button>
                        <Button size="sm" variant="outline" disabled={busyId === t.id} onClick={() => act(t.id, "reject")} className="text-red-500 border-red-500/40 hover:bg-red-500/10">
                          <XCircle className="h-4 w-4 mr-1" />拒絕
                        </Button>
                      </div>
                    ) : <span className="text-xs text-muted-foreground">—</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={adjOpen} onOpenChange={setAdjOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>手動調整會員現金餘額</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1"><Label>會員 ID (UUID) *</Label><Input value={adjUserId} onChange={(e) => setAdjUserId(e.target.value)} className="font-mono" /></div>
            <div className="space-y-1">
              <Label>金額（正：加值 / 負：扣除） *</Label>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" onClick={() => setAdjAmount(adjAmount.startsWith("-") ? adjAmount.slice(1) : "-" + adjAmount)}>
                  {adjAmount.startsWith("-") ? <Plus className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
                </Button>
                <Input type="number" value={adjAmount} onChange={(e) => setAdjAmount(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1"><Label>備註</Label><Input value={adjNote} onChange={(e) => setAdjNote(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAdjOpen(false)}>取消</Button>
            <Button onClick={submitAdjust} className="bg-gradient-primary">送出</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
