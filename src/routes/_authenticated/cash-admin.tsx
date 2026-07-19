import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Wallet, CheckCircle2, XCircle, Plus, Minus, Search, Coins } from "lucide-react";
import { toast } from "sonner";
import {
  adminListCashTx,
  adminProcessCashTx,
  adminAdjustCash,
  adminListMemberCashWallets,
  adminBuyShoppingPointsWithCash,
} from "@/lib/cash-wallet.functions";

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
  const [walletQuery, setWalletQuery] = useState("");
  const [walletRows, setWalletRows] = useState<any[]>([]);
  const [walletLoading, setWalletLoading] = useState(true);
  const [buyOpen, setBuyOpen] = useState(false);
  const [buyMember, setBuyMember] = useState<any | null>(null);
  const [buyAmount, setBuyAmount] = useState("");
  const [buyNote, setBuyNote] = useState("");
  const [buyBusy, setBuyBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminListCashTx({ data: { status } });
      setRows(data as any[]);
    } catch (e: any) { toast.error(e.message ?? "載入失敗"); }
    finally { setLoading(false); }
  }, [status]);

  useEffect(() => { load(); }, [load]);

  const loadWallets = useCallback(async () => {
    setWalletLoading(true);
    try {
      const data = await adminListMemberCashWallets({ data: { query: walletQuery, limit: 100 } });
      setWalletRows((data as any)?.members ?? []);
    } catch (e: any) {
      toast.error(e.message ?? "載入會員現金錢包餘額失敗");
    } finally {
      setWalletLoading(false);
    }
  }, [walletQuery]);

  useEffect(() => { loadWallets(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  function openBuyPoints(member: any) {
    setBuyMember(member);
    setBuyAmount("");
    setBuyNote("");
    setBuyOpen(true);
  }

  async function confirmBuyPoints() {
    if (!buyMember) return;
    const amount = Number(buyAmount);
    const cashBalance = Number(buyMember.wallet?.cash_balance ?? 0);
    if (!amount || amount <= 0) return toast.error("請輸入大於 0 的購買金額");
    if (amount > cashBalance) return toast.error(`會員現金餘額不足，目前餘額 NT$ ${cashBalance.toLocaleString()}`);

    setBuyBusy(true);
    try {
      const result: any = await adminBuyShoppingPointsWithCash({
        data: { userId: buyMember.id, amount, note: buyNote || undefined },
      });
      const pointsAdded = Number(result?.points_added ?? Math.floor(amount));
      toast.success(`購買完成，已增加 ${pointsAdded.toLocaleString()} 購物點`);
      setBuyOpen(false);
      setBuyMember(null);
      setBuyAmount("");
      setBuyNote("");
      await Promise.all([loadWallets(), load()]);
    } catch (e: any) {
      toast.error(e.message ?? "代會員購買購物點失敗");
    } finally {
      setBuyBusy(false);
    }
  }

  return (
    <div className="max-w-[1600px] mx-auto space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Wallet className="h-6 w-6 text-primary" />現金錢包審核</h1>
          <p className="text-sm text-muted-foreground mt-1">審核會員交易，查詢現金錢包餘額，並代會員用現金餘額購買購物點。</p>
        </div>
        <Button onClick={() => setAdjOpen(true)} variant="outline"><Plus className="h-4 w-4 mr-2" />手動調整餘額</Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Coins className="h-4 w-4 text-primary" />會員現金錢包餘額查詢</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault();
              loadWallets();
            }}
          >
            <Input
              value={walletQuery}
              onChange={(event) => setWalletQuery(event.target.value)}
              placeholder="搜尋姓名 / Email / 電話 / 會員編號"
              className="sm:max-w-md"
            />
            <Button type="submit" variant="outline" disabled={walletLoading}>
              <Search className="h-4 w-4 mr-2" />查詢
            </Button>
          </form>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>會員</TableHead>
                <TableHead>聯絡方式</TableHead>
                <TableHead className="text-right">現金餘額</TableHead>
                <TableHead className="text-right">購物點</TableHead>
                <TableHead className="text-right">貢獻點</TableHead>
                <TableHead className="text-right">折扣點</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {walletLoading ? Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}><TableCell colSpan={7}><Skeleton className="h-8 w-full" /></TableCell></TableRow>
              )) : walletRows.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-10">查無會員錢包資料</TableCell></TableRow>
              ) : walletRows.map((member: any) => {
                const wallet = member.wallet ?? {};
                const cashBalance = Number(wallet.cash_balance ?? 0);
                return (
                  <TableRow key={member.id}>
                    <TableCell>
                      <div className="text-sm font-medium">{member.name ?? "未命名會員"}</div>
                      <div className="text-xs text-muted-foreground font-mono">{member.member_no ?? member.id}</div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      <div>{member.phone ?? "—"}</div>
                      <div>{member.email ?? ""}</div>
                    </TableCell>
                    <TableCell className="text-right font-mono">NT$ {cashBalance.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-mono">{Number(wallet.shopping_points ?? 0).toLocaleString()}</TableCell>
                    <TableCell className="text-right font-mono">{Number(wallet.reward_points ?? 0).toLocaleString()}</TableCell>
                    <TableCell className="text-right font-mono">{Number(wallet.discount_points ?? 0).toLocaleString()}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" disabled={cashBalance <= 0} onClick={() => openBuyPoints(member)}>
                        <Coins className="h-4 w-4 mr-1" />購買購物點
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

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

      <AlertDialog open={buyOpen} onOpenChange={setBuyOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>代會員用現金餘額購買購物點</AlertDialogTitle>
            <AlertDialogDescription>
              此操作會立即扣除會員現金錢包餘額，並增加同額購物點。送出前請再次確認會員與金額。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <div className="font-medium">{buyMember?.name ?? "未選擇會員"}</div>
              <div className="text-xs text-muted-foreground font-mono">{buyMember?.member_no ?? buyMember?.id ?? ""}</div>
              <div className="mt-2">目前現金餘額：<span className="font-mono">NT$ {Number(buyMember?.wallet?.cash_balance ?? 0).toLocaleString()}</span></div>
            </div>
            <div className="space-y-1">
              <Label>購買金額 / 購物點數 *</Label>
              <Input type="number" min="1" value={buyAmount} onChange={(event) => setBuyAmount(event.target.value)} />
              <p className="text-xs text-muted-foreground">目前規則：NT$ 1 = 1 購物點。</p>
            </div>
            <div className="space-y-1">
              <Label>備註</Label>
              <Input value={buyNote} onChange={(event) => setBuyNote(event.target.value)} placeholder="例如：客服代購、門市協助" />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={buyBusy}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={buyBusy || !Number(buyAmount)}
              onClick={(event) => {
                event.preventDefault();
                confirmBuyPoints();
              }}
            >
              {buyBusy ? "處理中..." : "確認購買"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
