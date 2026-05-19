import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { useBankAccounts } from "@/hooks/use-finance";
import { bankAccountsRepo, type BankAccount } from "@/services/finance.service";
import { Plus, Landmark, Trash2, Edit3 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/finance/bank-accounts")({ component: BankPage });

function BankPage() {
  const { data, refresh } = useBankAccounts();
  const totalBalance = data.reduce((s, b) => s + Number(b.balance), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="text-xs text-muted-foreground uppercase tracking-wider">所有帳戶總餘額</div>
          <div className="text-2xl font-bold mt-0.5">NT$ {totalBalance.toLocaleString()}</div>
        </div>
        <BankDialog onSaved={refresh} />
      </div>

      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {data.length === 0 && (
          <Card className="col-span-full border-dashed"><CardContent className="py-12 text-center text-muted-foreground">尚未新增銀行帳戶</CardContent></Card>
        )}
        {data.map((b) => (
          <Card key={b.id} className="relative overflow-hidden group hover:shadow-elegant transition-all">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/15 to-transparent pointer-events-none" />
            <CardContent className="relative pt-5 space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 ring-1 ring-primary/30">
                    <Landmark className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <div className="font-semibold">{b.account_name}</div>
                    <div className="text-xs text-muted-foreground">{b.bank_name}</div>
                  </div>
                </div>
                <Badge variant={b.status === "active" ? "default" : "outline"}>{b.status === "active" ? "啟用中" : "停用"}</Badge>
              </div>
              <div className="font-mono text-sm tracking-wider text-muted-foreground">{b.account_no.replace(/(\d{4})/g, "$1 ").trim()}</div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">餘額</div>
                <div className="text-2xl font-bold mt-0.5">{b.currency} {Number(b.balance).toLocaleString()}</div>
              </div>
              <div className="flex gap-1 pt-1">
                <BankDialog account={b} onSaved={refresh}>
                  <Button size="sm" variant="ghost"><Edit3 className="h-3.5 w-3.5 mr-1" />編輯</Button>
                </BankDialog>
                <Button size="sm" variant="ghost" className="text-destructive" onClick={async () => {
                  if (!confirm(`確定刪除「${b.account_name}」？`)) return;
                  await bankAccountsRepo.remove(b.id);
                  toast.success("已刪除");
                  refresh();
                }}>
                  <Trash2 className="h-3.5 w-3.5 mr-1" />刪除
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

function BankDialog({ account, onSaved, children }: { account?: BankAccount; onSaved: () => void; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(account?.account_name ?? "");
  const [bank, setBank] = useState(account?.bank_name ?? "");
  const [no, setNo] = useState(account?.account_no ?? "");
  const [balance, setBalance] = useState(String(account?.balance ?? 0));
  const [currency, setCurrency] = useState(account?.currency ?? "TWD");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!name || !bank || !no) { toast.error("請填寫必填欄位"); return; }
    setSubmitting(true);
    try {
      const input = { account_name: name, bank_name: bank, account_no: no, balance: Number(balance) || 0, currency };
      if (account) await bankAccountsRepo.update(account.id, input);
      else await bankAccountsRepo.create(input);
      toast.success(account ? "已更新" : "已新增帳戶");
      setOpen(false);
      onSaved();
    } catch (e: any) { toast.error(e.message ?? "失敗"); }
    finally { setSubmitting(false); }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {children ?? <Button className="bg-gradient-primary"><Plus className="h-4 w-4 mr-2" />新增銀行帳戶</Button>}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{account ? "編輯銀行帳戶" : "新增銀行帳戶"}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div><Label>帳戶名稱 *</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="例：營運主帳戶" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>銀行名稱 *</Label><Input value={bank} onChange={(e) => setBank(e.target.value)} placeholder="例：玉山銀行" /></div>
            <div><Label>幣別</Label><Input value={currency} onChange={(e) => setCurrency(e.target.value)} /></div>
          </div>
          <div><Label>帳號 *</Label><Input value={no} onChange={(e) => setNo(e.target.value)} className="font-mono" /></div>
          <div><Label>目前餘額</Label><Input type="number" value={balance} onChange={(e) => setBalance(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
          <Button onClick={submit} disabled={submitting} className="bg-gradient-primary">儲存</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
