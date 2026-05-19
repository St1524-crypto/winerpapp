import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useTransactions, useBankAccounts } from "@/hooks/use-finance";
import { transactionsRepo, type TxType } from "@/services/finance.service";
import { Plus, Trash2, ArrowDownCircle, ArrowUpCircle } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/finance/transactions")({ component: TxPage });

const CATEGORIES = {
  income: ["銷售收入", "服務收入", "利息收入", "雜項收入"],
  expense: ["進貨成本", "薪資支出", "租金水電", "行銷費用", "運輸物流", "雜項支出"],
  transfer: ["帳戶轉帳"],
};

const PAYMENT_METHODS = ["cash", "bank_transfer", "credit_card", "atm", "line_pay", "other"];
const PM_LABEL: Record<string, string> = {
  cash: "現金", bank_transfer: "銀行轉帳", credit_card: "信用卡", atm: "ATM", line_pay: "LINE Pay", other: "其他",
};

function TxPage() {
  const [filter, setFilter] = useState<TxType | "all">("all");
  const { data, summary, refresh } = useTransactions(filter === "all" ? {} : { type: filter });
  const { data: banks } = useBankAccounts();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as any)}>
          <TabsList>
            <TabsTrigger value="all">全部</TabsTrigger>
            <TabsTrigger value="income">收入</TabsTrigger>
            <TabsTrigger value="expense">支出</TabsTrigger>
            <TabsTrigger value="transfer">轉帳</TabsTrigger>
          </TabsList>
        </Tabs>
        <NewTxDialog banks={banks} onCreated={refresh} />
      </div>

      <div className="grid gap-4 grid-cols-3">
        <Card><CardContent className="pt-5"><div className="text-xs text-muted-foreground uppercase tracking-wider">總收入</div><div className="text-xl font-bold mt-1 text-success">NT$ {summary.income.toLocaleString()}</div></CardContent></Card>
        <Card><CardContent className="pt-5"><div className="text-xs text-muted-foreground uppercase tracking-wider">總支出</div><div className="text-xl font-bold mt-1 text-warning">NT$ {summary.expense.toLocaleString()}</div></CardContent></Card>
        <Card><CardContent className="pt-5"><div className="text-xs text-muted-foreground uppercase tracking-wider">淨額</div><div className={`text-xl font-bold mt-1 ${summary.net >= 0 ? "text-primary" : "text-destructive"}`}>NT$ {summary.net.toLocaleString()}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">交易紀錄</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                  <th className="pb-3 font-medium">日期</th>
                  <th className="pb-3 font-medium">類型</th>
                  <th className="pb-3 font-medium">分類</th>
                  <th className="pb-3 font-medium">說明</th>
                  <th className="pb-3 font-medium">付款</th>
                  <th className="pb-3 font-medium text-right">金額</th>
                  <th className="pb-3 font-medium text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.length === 0 && (
                  <tr><td colSpan={7} className="py-8 text-center text-muted-foreground">尚無交易紀錄</td></tr>
                )}
                {data.map((t) => (
                  <tr key={t.id} className="hover:bg-muted/30 transition-colors">
                    <td className="py-3 text-xs">{new Date(t.occurred_at).toLocaleDateString()}</td>
                    <td className="py-3">
                      {t.type === "income" ? (
                        <Badge variant="secondary" className="gap-1 text-success"><ArrowDownCircle className="h-3 w-3" />收入</Badge>
                      ) : t.type === "expense" ? (
                        <Badge variant="secondary" className="gap-1 text-warning"><ArrowUpCircle className="h-3 w-3" />支出</Badge>
                      ) : <Badge variant="outline">轉帳</Badge>}
                    </td>
                    <td className="py-3">{t.category}</td>
                    <td className="py-3 text-muted-foreground">{t.description ?? "-"}</td>
                    <td className="py-3 text-xs">{PM_LABEL[t.payment_method] ?? t.payment_method}</td>
                    <td className={`py-3 text-right font-semibold ${t.type === "income" ? "text-success" : "text-warning"}`}>
                      {t.type === "income" ? "+" : "-"} NT$ {Number(t.amount).toLocaleString()}
                    </td>
                    <td className="py-3 text-right">
                      <Button size="icon" variant="ghost" onClick={async () => {
                        if (!confirm("確定刪除此交易？")) return;
                        await transactionsRepo.remove(t.id);
                        toast.success("已刪除");
                        refresh();
                      }}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function NewTxDialog({ banks, onCreated }: { banks: any[]; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<TxType>("income");
  const [category, setCategory] = useState(CATEGORIES.income[0]);
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("bank_transfer");
  const [bankId, setBankId] = useState<string>("");
  const [reference, setReference] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!amount || Number(amount) <= 0) { toast.error("請輸入金額"); return; }
    setSubmitting(true);
    try {
      await transactionsRepo.create({
        type, category, amount: Number(amount), payment_method: paymentMethod,
        bank_account_id: bankId || null, reference_no: reference || null, description: description || null,
        occurred_at: new Date().toISOString(),
      });
      toast.success("交易已新增");
      setOpen(false);
      setAmount(""); setReference(""); setDescription("");
      onCreated();
    } catch (e: any) {
      toast.error(e.message ?? "新增失敗");
    } finally { setSubmitting(false); }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button className="bg-gradient-primary"><Plus className="h-4 w-4 mr-2" />新增交易</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>新增財務交易</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>類型</Label>
              <Select value={type} onValueChange={(v) => { setType(v as TxType); setCategory(CATEGORIES[v as TxType][0]); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="income">收入</SelectItem>
                  <SelectItem value="expense">支出</SelectItem>
                  <SelectItem value="transfer">轉帳</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>分類</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES[type].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>金額</Label>
              <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
            </div>
            <div>
              <Label>付款方式</Label>
              <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PAYMENT_METHODS.map((p) => <SelectItem key={p} value={p}>{PM_LABEL[p]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>銀行帳戶（選填）</Label>
            <Select value={bankId || "none"} onValueChange={(v) => setBankId(v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="無" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">無</SelectItem>
                {banks.map((b) => <SelectItem key={b.id} value={b.id}>{b.account_name} · {b.bank_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>參考單號</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="例：SO-20260519-0001" />
          </div>
          <div>
            <Label>備註</Label>
            <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
          <Button onClick={submit} disabled={submitting} className="bg-gradient-primary">儲存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
