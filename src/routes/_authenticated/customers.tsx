import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentCompany } from "@/hooks/use-current-company";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Plus, Search, Pencil, Trash2, Users, Receipt, Mail, Phone, Building2 } from "lucide-react";

interface Customer {
  id: string;
  customer_no: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  shipping_address: string | null;
  source: string | null;
  notes: string | null;
  created_at: string;
}

interface OrderRow {
  id: string;
  order_no: string;
  total_amount: number;
  order_status: string;
  payment_status: string;
  created_at: string;
}

const empty = { name: "", email: "", phone: "", company: "", shipping_address: "", source: "", notes: "" };

const SOURCES = ["官網", "電話", "展會", "介紹", "社群", "廣告", "其他"];

const STATUS_LABEL: Record<string, string> = {
  pending: "待處理", processing: "處理中", shipped: "已出貨",
  delivered: "已送達", completed: "已完成", cancelled: "已取消",
  paid: "已付款", unpaid: "未付款", refunded: "已退款",
};

function Page() {
  const { currentCompanyId } = useCurrentCompany();
  const [list, setList] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [delId, setDelId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...empty });
  const [historyOf, setHistoryOf] = useState<Customer | null>(null);
  const [history, setHistory] = useState<OrderRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("customers")
      .select("id, customer_no, name, email, phone, company, shipping_address, source, notes, created_at")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setList((data ?? []) as Customer[]);
    setLoading(false);
  }
  useEffect(() => { load(); }, [currentCompanyId]);

  const filtered = useMemo(() => list.filter((c) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return [c.customer_no, c.name, c.email, c.phone, c.company, c.source].some((v) => v?.toLowerCase().includes(s));
  }), [list, search]);

  function openNew() {
    if (!currentCompanyId) { toast.error("請先選擇公司"); return; }
    setEditing(null); setForm({ ...empty }); setOpen(true);
  }
  function openEdit(c: Customer) {
    setEditing(c);
    setForm({
      name: c.name, email: c.email ?? "", phone: c.phone ?? "",
      company: c.company ?? "",
      shipping_address: c.shipping_address ?? "",
      source: c.source ?? "",
      notes: c.notes ?? "",
    });
    setOpen(true);
  }

  async function save() {
    if (!form.name.trim()) { toast.error("姓名為必填"); return; }
    if (!currentCompanyId) { toast.error("尚未選擇公司"); return; }
    const payload = {
      name: form.name.trim(),
      email: form.email.trim() || null,
      phone: form.phone.trim() || null,
      company: form.company.trim() || null,
      shipping_address: form.shipping_address.trim() || null,
      source: form.source.trim() || null,
      notes: form.notes.trim() || null,
    };
    const res = editing
      ? await supabase.from("customers").update(payload).eq("id", editing.id)
      : await supabase.from("customers").insert({ ...payload, company_id: currentCompanyId });
    if (res.error) toast.error(res.error.message);
    else { toast.success(editing ? "已更新" : "已新增"); setOpen(false); load(); }
  }

  async function remove() {
    if (!delId) return;
    const { error } = await supabase.from("customers").delete().eq("id", delId);
    if (error) toast.error(error.message); else { toast.success("已刪除"); load(); }
    setDelId(null);
  }

  async function openHistory(c: Customer) {
    setHistoryOf(c);
    setHistory([]);
    setHistoryLoading(true);
    const { data, error } = await supabase
      .from("sales_orders")
      .select("id, order_no, total_amount, order_status, payment_status, created_at")
      .eq("customer_id", c.id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) toast.error(error.message);
    else setHistory((data ?? []) as OrderRow[]);
    setHistoryLoading(false);
  }

  const totalSpent = useMemo(
    () => history.reduce((s, o) => s + Number(o.total_amount || 0), 0),
    [history],
  );

  return (
    <div className="max-w-[1600px] mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Users className="h-6 w-6 text-primary" />客戶管理
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            B2B 客戶資料、聯絡窗口與交易紀錄
          </p>
        </div>
        <Button onClick={openNew} className="bg-gradient-primary">
          <Plus className="h-4 w-4 mr-1" />新增客戶
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="relative max-w-md">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="搜尋姓名、Email、電話、公司..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>客戶編號</TableHead>
                <TableHead>姓名</TableHead>
                <TableHead>公司</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>電話</TableHead>
                <TableHead>收件地址</TableHead>
                <TableHead>來源</TableHead>
                <TableHead>建立日期</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}><TableCell colSpan={9}><Skeleton className="h-8 w-full" /></TableCell></TableRow>
              )) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-10">
                    {search ? "查無符合條件的客戶" : "尚無客戶，點擊右上角新增"}
                  </TableCell>
                </TableRow>
              ) : filtered.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono text-xs">{c.customer_no ?? "—"}</TableCell>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {c.company ? (
                      <span className="inline-flex items-center gap-1">
                        <Building2 className="h-3 w-3" />{c.company}
                      </span>
                    ) : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {c.email ? (
                      <span className="inline-flex items-center gap-1">
                        <Mail className="h-3 w-3" />{c.email}
                      </span>
                    ) : "—"}
                  </TableCell>
                  <TableCell>
                    {c.phone ? (
                      <span className="inline-flex items-center gap-1">
                        <Phone className="h-3 w-3" />{c.phone}
                      </span>
                    ) : "—"}
                  </TableCell>
                  <TableCell className="max-w-[220px] truncate text-xs text-muted-foreground">
                    {c.shipping_address ?? "—"}
                  </TableCell>
                  <TableCell>
                    {c.source ? <Badge variant="outline">{c.source}</Badge> : <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {new Date(c.created_at).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" title="交易紀錄" onClick={() => openHistory(c)}>
                      <Receipt className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" title="編輯" onClick={() => openEdit(c)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" title="刪除" onClick={() => setDelId(c.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* 新增/編輯 */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "編輯客戶" : "新增客戶"}</DialogTitle>
            {editing?.customer_no && (
              <DialogDescription>客戶編號：<span className="font-mono">{editing.customer_no}</span></DialogDescription>
            )}
          </DialogHeader>
          <div className="grid sm:grid-cols-2 gap-4 py-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>姓名 *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>公司</Label>
              <Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>電話</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>收件地址</Label>
              <Input value={form.shipping_address} onChange={(e) => setForm({ ...form, shipping_address: e.target.value })} placeholder="完整收件地址" />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>客戶來源</Label>
              <Input
                list="customer-source-options"
                value={form.source}
                onChange={(e) => setForm({ ...form, source: e.target.value })}
                placeholder="例如：官網、電話、展會、介紹..."
              />
              <datalist id="customer-source-options">
                {SOURCES.map((s) => <option key={s} value={s} />)}
              </datalist>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>備註</Label>
              <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>取消</Button>
            <Button onClick={save} className="bg-gradient-primary">
              {editing ? "儲存變更" : "建立"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 交易紀錄 */}
      <Dialog open={!!historyOf} onOpenChange={(v) => !v && setHistoryOf(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-primary" />
              {historyOf?.name} 的交易紀錄
            </DialogTitle>
            <DialogDescription>
              共 {history.length} 筆訂單，累計金額 ${totalSpent.toLocaleString()}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[420px] overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>訂單編號</TableHead>
                  <TableHead>日期</TableHead>
                  <TableHead>訂單狀態</TableHead>
                  <TableHead>付款狀態</TableHead>
                  <TableHead className="text-right">金額</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {historyLoading ? Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}><TableCell colSpan={5}><Skeleton className="h-6 w-full" /></TableCell></TableRow>
                )) : history.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      尚無交易紀錄
                    </TableCell>
                  </TableRow>
                ) : history.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-mono text-xs">{o.order_no}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(o.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{STATUS_LABEL[o.order_status] ?? o.order_status}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={o.payment_status === "paid" ? "default" : "secondary"}>
                        {STATUS_LABEL[o.payment_status] ?? o.payment_status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      ${Number(o.total_amount).toLocaleString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!delId} onOpenChange={(v) => !v && setDelId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>確認刪除此客戶？</AlertDialogTitle>
            <AlertDialogDescription>此動作無法復原。歷史訂單會保留但不再連結至客戶資料。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={remove}>刪除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/customers")({ component: Page });
