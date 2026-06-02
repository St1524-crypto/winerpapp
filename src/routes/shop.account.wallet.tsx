import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Wallet, ArrowDownToLine, ArrowUpFromLine, Coins } from "lucide-react";
import { toast } from "sonner";
import {
  getMyCashWallet,
  getMyCashLedger,
  requestTopup,
  requestWithdraw,
  buyShoppingPoints,
} from "@/lib/cash-wallet.functions";

export const Route = createFileRoute("/shop/account/wallet")({
  component: WalletPage,
  head: () => ({ meta: [{ title: "現金錢包 — 源晶商城" }] }),
});

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

function WalletPage() {
  const [balance, setBalance] = useState(0);
  const [ledger, setLedger] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [topupOpen, setTopupOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [buyOpen, setBuyOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const [topupAmount, setTopupAmount] = useState("");
  const [topupMethod, setTopupMethod] = useState("bank_transfer");
  const [topupNote, setTopupNote] = useState("");

  const [wdAmount, setWdAmount] = useState("");
  const [wdBank, setWdBank] = useState("");
  const [wdNote, setWdNote] = useState("");

  const [buyAmount, setBuyAmount] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [w, l] = await Promise.all([getMyCashWallet(), getMyCashLedger()]);
      setBalance(Number((w as any).cash_balance ?? 0));
      setLedger(l as any[]);
    } catch (e: any) { toast.error(e.message ?? "載入失敗"); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function submitTopup() {
    const amt = Number(topupAmount);
    if (!amt || amt <= 0) return toast.error("請輸入有效金額");
    setBusy(true);
    try {
      await requestTopup({ data: { amount: amt, payment_method: topupMethod, note: topupNote || undefined } });
      toast.success("充值申請已送出，等待審核");
      setTopupOpen(false); setTopupAmount(""); setTopupNote("");
      load();
    } catch (e: any) { toast.error(e.message ?? "送出失敗"); }
    finally { setBusy(false); }
  }
  async function submitWithdraw() {
    const amt = Number(wdAmount);
    if (!amt || amt <= 0) return toast.error("請輸入有效金額");
    if (!wdBank.trim()) return toast.error("請填寫匯款帳戶");
    setBusy(true);
    try {
      await requestWithdraw({ data: { amount: amt, bank_info: wdBank.trim(), note: wdNote || undefined } });
      toast.success("提現申請已送出，等待審核");
      setWithdrawOpen(false); setWdAmount(""); setWdBank(""); setWdNote("");
      load();
    } catch (e: any) { toast.error(e.message ?? "送出失敗"); }
    finally { setBusy(false); }
  }
  async function submitBuy() {
    const amt = Number(buyAmount);
    if (!amt || amt <= 0) return toast.error("請輸入有效金額");
    setBusy(true);
    try {
      const r = await buyShoppingPoints({ data: { amount: amt } });
      toast.success(`已購買 ${(r as any).points_added} 購物點`);
      setBuyOpen(false); setBuyAmount("");
      load();
    } catch (e: any) { toast.error(e.message ?? "購買失敗"); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground">
            <Wallet className="h-4 w-4 text-primary" />現金錢包餘額
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? <Skeleton className="h-10 w-40" /> : (
            <div className="text-4xl font-bold tabular-nums">NT$ {balance.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}</div>
          )}
          <div className="flex flex-wrap gap-2 mt-4">
            <Button onClick={() => setTopupOpen(true)} className="bg-gradient-primary">
              <ArrowDownToLine className="h-4 w-4 mr-2" />充值
            </Button>
            <Button onClick={() => setWithdrawOpen(true)} variant="outline">
              <ArrowUpFromLine className="h-4 w-4 mr-2" />提現
            </Button>
            <Button onClick={() => setBuyOpen(true)} variant="outline">
              <Coins className="h-4 w-4 mr-2" />購買購物點
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-3">兌換比率：NT$ 1 = 1 購物點</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">交易紀錄</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>時間</TableHead>
                <TableHead>類型</TableHead>
                <TableHead className="text-right">金額</TableHead>
                <TableHead className="text-right">餘額</TableHead>
                <TableHead>狀態</TableHead>
                <TableHead>備註</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ledger.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">尚無紀錄</TableCell></TableRow>
              ) : ledger.map((t: any) => (
                <TableRow key={t.id}>
                  <TableCell className="text-xs text-muted-foreground">{new Date(t.created_at).toLocaleString()}</TableCell>
                  <TableCell>{TX_LABEL[t.tx_type] ?? t.tx_type}</TableCell>
                  <TableCell className={`text-right font-mono ${Number(t.amount) >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                    {Number(t.amount) >= 0 ? "+" : ""}{Number(t.amount).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right font-mono">{t.balance_after !== null ? Number(t.balance_after).toLocaleString() : "—"}</TableCell>
                  <TableCell><Badge variant="outline" className={STATUS_STYLE[t.status] ?? ""}>{STATUS_LABEL[t.status] ?? t.status}</Badge></TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[280px] truncate">{t.note ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={topupOpen} onOpenChange={setTopupOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>申請充值</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1"><Label>金額 (NT$) *</Label><Input type="number" min="1" value={topupAmount} onChange={(e) => setTopupAmount(e.target.value)} /></div>
            <div className="space-y-1">
              <Label>付款方式 *</Label>
              <select className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm" value={topupMethod} onChange={(e) => setTopupMethod(e.target.value)}>
                <option value="bank_transfer">銀行轉帳</option>
                <option value="atm">ATM</option>
                <option value="cash">現金</option>
                <option value="other">其他</option>
              </select>
            </div>
            <div className="space-y-1"><Label>備註（匯款帳號末五碼 / 說明）</Label><Input value={topupNote} onChange={(e) => setTopupNote(e.target.value)} /></div>
            <p className="text-xs text-muted-foreground">送出後待管理員確認入帳。</p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTopupOpen(false)}>取消</Button>
            <Button onClick={submitTopup} disabled={busy} className="bg-gradient-primary">送出申請</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={withdrawOpen} onOpenChange={setWithdrawOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>申請提現</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1"><Label>金額 (NT$) *</Label><Input type="number" min="1" value={wdAmount} onChange={(e) => setWdAmount(e.target.value)} /></div>
            <div className="space-y-1"><Label>匯款帳戶（銀行 + 戶名 + 帳號） *</Label><Input value={wdBank} onChange={(e) => setWdBank(e.target.value)} placeholder="例：玉山銀行 王小明 1234567890" /></div>
            <div className="space-y-1"><Label>備註</Label><Input value={wdNote} onChange={(e) => setWdNote(e.target.value)} /></div>
            <p className="text-xs text-muted-foreground">目前餘額：NT$ {balance.toLocaleString()}。送出後待管理員審核匯款。</p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setWithdrawOpen(false)}>取消</Button>
            <Button onClick={submitWithdraw} disabled={busy} className="bg-gradient-primary">送出申請</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={buyOpen} onOpenChange={setBuyOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>用現金購買購物點</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1"><Label>消耗現金 (NT$) *</Label><Input type="number" min="1" value={buyAmount} onChange={(e) => setBuyAmount(e.target.value)} /></div>
            <p className="text-sm">將取得購物點：<span className="font-mono font-semibold">{Math.floor(Number(buyAmount) || 0)}</span> 點</p>
            <p className="text-xs text-muted-foreground">目前餘額：NT$ {balance.toLocaleString()}。立即扣款並入點。</p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBuyOpen(false)}>取消</Button>
            <Button onClick={submitBuy} disabled={busy} className="bg-gradient-primary">確認購買</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
