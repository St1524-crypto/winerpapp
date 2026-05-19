import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePayables } from "@/hooks/use-finance";
import { payablesRepo, deriveStatus } from "@/services/finance.service";
import { Plus, DollarSign } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/finance/payable")({ component: APPage });

const STATUS_LABEL: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  paid: { label: "已付款", variant: "default" },
  partial: { label: "部分付款", variant: "secondary" },
  unpaid: { label: "未付款", variant: "outline" },
  overdue: { label: "逾期", variant: "destructive" },
  due_soon: { label: "即將到期", variant: "secondary" },
};

function APPage() {
  const [filter, setFilter] = useState("all");
  const { data, refresh } = usePayables(filter === "all" ? undefined : filter);

  const total = data.reduce((s, p) => s + Number(p.total_amount), 0);
  const paid = data.reduce((s, p) => s + Number(p.paid_amount), 0);
  const open = total - paid;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <Tabs value={filter} onValueChange={setFilter}>
          <TabsList>
            <TabsTrigger value="all">全部</TabsTrigger>
            <TabsTrigger value="unpaid">未付款</TabsTrigger>
            <TabsTrigger value="partial">部分付款</TabsTrigger>
            <TabsTrigger value="paid">已付款</TabsTrigger>
          </TabsList>
        </Tabs>
        <NewAPDialog onCreated={refresh} />
      </div>

      <div className="grid gap-4 grid-cols-3">
        <Card><CardContent className="pt-5"><div className="text-xs text-muted-foreground uppercase tracking-wider">應付總額</div><div className="text-xl font-bold mt-1">NT$ {total.toLocaleString()}</div></CardContent></Card>
        <Card><CardContent className="pt-5"><div className="text-xs text-muted-foreground uppercase tracking-wider">已付款</div><div className="text-xl font-bold mt-1 text-success">NT$ {paid.toLocaleString()}</div></CardContent></Card>
        <Card><CardContent className="pt-5"><div className="text-xs text-muted-foreground uppercase tracking-wider">未付款</div><div className="text-xl font-bold mt-1 text-warning">NT$ {open.toLocaleString()}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">應付帳款明細</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                  <th className="pb-3 font-medium">供應商</th>
                  <th className="pb-3 font-medium">帳單號</th>
                  <th className="pb-3 font-medium">到期日</th>
                  <th className="pb-3 font-medium text-right">總額</th>
                  <th className="pb-3 font-medium text-right">已付</th>
                  <th className="pb-3 font-medium text-right">未付</th>
                  <th className="pb-3 font-medium">狀態</th>
                  <th className="pb-3 font-medium text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data.length === 0 && <tr><td colSpan={8} className="py-8 text-center text-muted-foreground">尚無應付帳款</td></tr>}
                {data.map((p) => {
                  const status = deriveStatus(p.due_date, p.status);
                  const meta = STATUS_LABEL[status] ?? STATUS_LABEL.unpaid;
                  const unpaid = Number(p.total_amount) - Number(p.paid_amount);
                  return (
                    <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                      <td className="py-3 font-medium">{p.vendor_name}</td>
                      <td className="py-3 font-mono text-xs">{p.bill_no}</td>
                      <td className="py-3 text-xs">{p.due_date ?? "-"}</td>
                      <td className="py-3 text-right">NT$ {Number(p.total_amount).toLocaleString()}</td>
                      <td className="py-3 text-right text-success">NT$ {Number(p.paid_amount).toLocaleString()}</td>
                      <td className={`py-3 text-right font-semibold ${unpaid > 0 ? "text-warning" : ""}`}>NT$ {unpaid.toLocaleString()}</td>
                      <td className="py-3"><Badge variant={meta.variant}>{meta.label}</Badge></td>
                      <td className="py-3 text-right">
                        {unpaid > 0 && <PayDialog id={p.id} maxAmount={unpaid} onPaid={refresh} />}
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

function NewAPDialog({ onCreated }: { onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [vendor, setVendor] = useState("");
  const [billNo, setBillNo] = useState("");
  const [total, setTotal] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!vendor || !billNo || !total) { toast.error("請填寫必填欄位"); return; }
    setSubmitting(true);
    try {
      await payablesRepo.create({
        vendor_name: vendor, bill_no: billNo,
        total_amount: Number(total), paid_amount: 0,
        due_date: dueDate || null, status: "unpaid",
      });
      toast.success("應付帳款已建立");
      setOpen(false);
      setVendor(""); setBillNo(""); setTotal(""); setDueDate("");
      onCreated();
    } catch (e: any) { toast.error(e.message ?? "建立失敗"); }
    finally { setSubmitting(false); }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button className="bg-gradient-primary"><Plus className="h-4 w-4 mr-2" />新增應付</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>新增應付帳款</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div><Label>供應商名稱 *</Label><Input value={vendor} onChange={(e) => setVendor(e.target.value)} /></div>
          <div><Label>帳單號 *</Label><Input value={billNo} onChange={(e) => setBillNo(e.target.value)} placeholder="BILL-20260519-0001" /></div>
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
      await payablesRepo.recordPayment(id, n);
      toast.success("已記錄付款");
      setOpen(false);
      onPaid();
    } catch (e: any) { toast.error(e.message ?? "失敗"); }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="outline" className="gap-1"><DollarSign className="h-3.5 w-3.5" />付款</Button></DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>記錄付款</DialogTitle></DialogHeader>
        <div>
          <Label>付款金額（未付：NT$ {maxAmount.toLocaleString()}）</Label>
          <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>取消</Button>
          <Button onClick={submit} className="bg-gradient-primary">確認付款</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
