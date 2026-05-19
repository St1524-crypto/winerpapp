import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useReceivables } from "@/hooks/use-finance";
import { receivablesRepo, deriveStatus } from "@/services/finance.service";
import { Plus, DollarSign } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/finance/receivable")({ component: ARPage });

const STATUS_LABEL: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  paid: { label: "已收款", variant: "default" },
  partial: { label: "部分收款", variant: "secondary" },
  unpaid: { label: "未收款", variant: "outline" },
  overdue: { label: "逾期", variant: "destructive" },
  due_soon: { label: "即將到期", variant: "secondary" },
};

function ARPage() {
  const [filter, setFilter] = useState("all");
  const { data, refresh } = useReceivables(filter === "all" ? undefined : filter);

  const total = data.reduce((s, r) => s + Number(r.total_amount), 0);
  const paid = data.reduce((s, r) => s + Number(r.paid_amount), 0);
  const open = total - paid;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <Tabs value={filter} onValueChange={setFilter}>
          <TabsList>
            <TabsTrigger value="all">全部</TabsTrigger>
            <TabsTrigger value="unpaid">未收款</TabsTrigger>
            <TabsTrigger value="partial">部分收款</TabsTrigger>
            <TabsTrigger value="paid">已收款</TabsTrigger>
          </TabsList>
        </Tabs>
        <NewARDialog onCreated={refresh} />
      </div>

      <div className="grid gap-4 grid-cols-3">
        <Card><CardContent className="pt-5"><div className="text-xs text-muted-foreground uppercase tracking-wider">應收總額</div><div className="text-xl font-bold mt-1">NT$ {total.toLocaleString()}</div></CardContent></Card>
        <Card><CardContent className="pt-5"><div className="text-xs text-muted-foreground uppercase tracking-wider">已收款</div><div className="text-xl font-bold mt-1 text-success">NT$ {paid.toLocaleString()}</div></CardContent></Card>
        <Card><CardContent className="pt-5"><div className="text-xs text-muted-foreground uppercase tracking-wider">未收款</div><div className="text-xl font-bold mt-1 text-warning">NT$ {open.toLocaleString()}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">應收帳款明細</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                  <th className="pb-3 font-medium">客戶</th>
                  <th className="pb-3 font-medium">發票號</th>
                  <th className="pb-3 font-medium">到期日</th>
                  <th className="pb-3 font-medium text-right">總額</th>
                  <th className="pb-3 font-medium text-right">已收</th>
                  <th className="pb-3 font-medium text-right">未收</th>
                  <th className="pb-3 font-medium">狀態</th>
                  <th className="pb-3 font-medium text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.length === 0 && <tr><td colSpan={8} className="py-8 text-center text-muted-foreground">尚無應收帳款</td></tr>}
                {data.map((r) => {
                  const status = deriveStatus(r.due_date, r.status);
                  const meta = STATUS_LABEL[status] ?? STATUS_LABEL.unpaid;
                  const unpaid = Number(r.total_amount) - Number(r.paid_amount);
                  return (
                    <tr key={r.id} className="hover:bg-muted/30 transition-colors">
                      <td className="py-3 font-medium">{r.customer_name}</td>
                      <td className="py-3 font-mono text-xs">{r.invoice_no}</td>
                      <td className="py-3 text-xs">{r.due_date ?? "-"}</td>
                      <td className="py-3 text-right">NT$ {Number(r.total_amount).toLocaleString()}</td>
                      <td className="py-3 text-right text-success">NT$ {Number(r.paid_amount).toLocaleString()}</td>
                      <td className={`py-3 text-right font-semibold ${unpaid > 0 ? "text-warning" : ""}`}>NT$ {unpaid.toLocaleString()}</td>
                      <td className="py-3"><Badge variant={meta.variant}>{meta.label}</Badge></td>
                      <td className="py-3 text-right">
                        {unpaid > 0 && <PayDialog id={r.id} maxAmount={unpaid} onPaid={refresh} />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function NewARDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [customer, setCustomer] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [total, setTotal] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!customer || !invoiceNo || !total) { toast.error("請填寫必填欄位"); return; }
    setSubmitting(true);
    try {
      await receivablesRepo.create({
        customer_name: customer,
        invoice_no: invoiceNo,
        total_amount: Number(total),
        paid_amount: 0,
        due_date: dueDate || null,
        status: "unpaid",
      });
      toast.success("應收帳款已建立");
      setOpen(false);
      setCustomer(""); setInvoiceNo(""); setTotal(""); setDueDate("");
      onCreated();
    } catch (e: any) { toast.error(e.message ?? "建立失敗"); }
    finally { setSubmitting(false); }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button className="bg-gradient-primary"><Plus className="h-4 w-4 mr-2" />新增應收</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>新增應收帳款</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div><Label>客戶名稱 *</Label><Input value={customer} onChange={(e) => setCustomer(e.target.value)} /></div>
          <div><Label>發票/單號 *</Label><Input value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} placeholder="INV-20260519-0001" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>總額 *</Label><Input type="number" value={total} onChange={(e) => setTotal(e.target.value)} /></div>
            <div><Label>到期日</Label><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></div>
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

function PayDialog({ id, maxAmount, onPaid }: { id: string; maxAmount: number; onPaid: () => void }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(maxAmount));

  async function submit() {
    const n = Number(amount);
    if (!n || n <= 0) { toast.error("請輸入有效金額"); return; }
    try {
      await receivablesRepo.recordPayment(id, n);
      toast.success("已記錄收款");
      setOpen(false);
      onPaid();
    } catch (e: any) { toast.error(e.message ?? "失敗"); }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="outline" className="gap-1"><DollarSign className="h-3.5 w-3.5" />收款</Button></DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>記錄收款</DialogTitle></DialogHeader>
        <div>
          <Label>收款金額（未收：NT$ {maxAmount.toLocaleString()}）</Label>
          <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
          <Button onClick={submit} className="bg-gradient-primary">確認收款</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
