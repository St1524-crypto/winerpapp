import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Building2, Plus, Search, Check, X, Pencil, ExternalLink, ShieldCheck, Wallet, Users, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { useAuth } from "@/hooks/use-auth";
import {
  useBusinessAccounts, ACCOUNT_LEVEL_LABELS, ACCOUNT_STATUS_LABELS,
  ACCOUNT_LEVEL_TONE, ACCOUNT_STATUS_TONE, type BusinessAccount, type AccountLevel, type AccountStatus,
} from "@/hooks/use-business-accounts";
import { BusinessAccountFormDialog } from "@/components/b2b/BusinessAccountFormDialog";
import { ForbiddenScreen } from "@/components/ForbiddenScreen";

export const Route = createFileRoute("/_authenticated/b2b/accounts")({
  component: BusinessAccountsPage,
});

function BusinessAccountsPage() {
  const { roles } = useAuth();
  const canManage = roles.includes("super_admin") || roles.includes("sales");

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<AccountStatus | "all">("all");
  const [level, setLevel] = useState<AccountLevel | "all">("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<BusinessAccount | null>(null);

  const { data, loading, refresh } = useBusinessAccounts({ search, status, level });

  const stats = useMemo(() => {
    const total = data.length;
    const approved = data.filter((d) => d.status === "approved").length;
    const pending = data.filter((d) => d.status === "pending").length;
    const totalCredit = data.reduce((s, d) => s + Number(d.credit_limit), 0);
    const usedCredit = data.reduce((s, d) => s + Number(d.credit_used), 0);
    return { total, approved, pending, totalCredit, usedCredit };
  }, [data]);

  if (!canManage && roles.length > 0) return <ForbiddenScreen requiredRoles={["super_admin", "sales"]} pageName="B2B 廠商會員" />;

  async function approve(row: BusinessAccount) {
    const { error } = await supabase.from("business_accounts" as any).update({ status: "approved" }).eq("id", row.id);
    if (error) return toast.error(error.message);
    toast.success(`已核准：${row.company_name}`);
    refresh();
  }
  async function reject(row: BusinessAccount) {
    const { error } = await supabase.from("business_accounts" as any).update({ status: "rejected" }).eq("id", row.id);
    if (error) return toast.error(error.message);
    toast.success(`已拒絕：${row.company_name}`);
    refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Building2 className="h-6 w-6 text-primary" /> B2B 廠商會員
          </h1>
          <p className="text-sm text-muted-foreground mt-1">經銷商 / 批發商 / 代理商 / VIP 企業會員的審核與管理</p>
        </div>
        <Button onClick={() => { setEditing(null); setDialogOpen(true); }} className="bg-gradient-primary">
          <Plus className="h-4 w-4 mr-1" />新增 B2B 廠商
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={Users} label="廠商總數" value={stats.total} tone="from-sky-500/15 to-sky-500/5" />
        <StatCard icon={ShieldCheck} label="已核准" value={stats.approved} tone="from-emerald-500/15 to-emerald-500/5" />
        <StatCard icon={AlertCircle} label="待審核" value={stats.pending} tone="from-amber-500/15 to-amber-500/5" />
        <StatCard icon={Wallet} label="總信用額度" value={`NT$${stats.totalCredit.toLocaleString()}`} tone="from-violet-500/15 to-violet-500/5" />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="搜尋公司名稱 / 統編 / 聯絡人" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={status} onValueChange={(v) => setStatus(v as any)}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部狀態</SelectItem>
                {Object.entries(ACCOUNT_STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={level} onValueChange={(v) => setLevel(v as any)}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部等級</SelectItem>
                {Object.entries(ACCOUNT_LEVEL_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
          ) : data.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">無 B2B 廠商資料</div>
          ) : (
            <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>公司</TableHead>
                  <TableHead>統編 / 聯絡人</TableHead>
                  <TableHead>等級</TableHead>
                  <TableHead>狀態</TableHead>
                  <TableHead>月結</TableHead>
                  <TableHead>信用使用</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((row) => {
                  const pct = row.credit_limit > 0 ? Math.min(100, (row.credit_used / row.credit_limit) * 100) : 0;
                  return (
                    <TableRow key={row.id}>
                      <TableCell>
                        <div className="font-medium">{row.company_name}</div>
                        <div className="text-xs text-muted-foreground">{row.email ?? "—"}</div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{row.tax_id ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{row.contact_name ?? "—"} · {row.phone ?? "—"}</div>
                      </TableCell>
                      <TableCell><Badge variant="outline" className={ACCOUNT_LEVEL_TONE[row.account_level]}>{ACCOUNT_LEVEL_LABELS[row.account_level]}</Badge></TableCell>
                      <TableCell><Badge variant="outline" className={ACCOUNT_STATUS_TONE[row.status]}>{ACCOUNT_STATUS_LABELS[row.status]}</Badge></TableCell>
                      <TableCell className="text-sm">{row.payment_terms} 天</TableCell>
                      <TableCell className="min-w-[160px]">
                        <div className="text-xs flex justify-between mb-1">
                          <span>NT${Number(row.credit_used).toLocaleString()}</span>
                          <span className="text-muted-foreground">/ NT${Number(row.credit_limit).toLocaleString()}</span>
                        </div>
                        <Progress value={pct} className="h-1.5" />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {row.status === "pending" && (
                            <>
                              <Button size="icon" variant="ghost" onClick={() => approve(row)} title="核准"><Check className="h-4 w-4 text-emerald-600" /></Button>
                              <Button size="icon" variant="ghost" onClick={() => reject(row)} title="拒絕"><X className="h-4 w-4 text-rose-600" /></Button>
                            </>
                          )}
                          <Button size="icon" variant="ghost" onClick={() => { setEditing(row); setDialogOpen(true); }} title="編輯"><Pencil className="h-4 w-4" /></Button>
                          <Button asChild size="icon" variant="ghost" title="詳細頁">
                            <Link to="/b2b/accounts/$id" params={{ id: row.id }}><ExternalLink className="h-4 w-4" /></Link>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <BusinessAccountFormDialog open={dialogOpen} onOpenChange={setDialogOpen} initial={editing} onSaved={refresh} />
    </div>
  );
}

function StatCard({ icon: Icon, label, value, tone }: { icon: any; label: string; value: any; tone: string }) {
  return (
    <Card className={`bg-gradient-to-br ${tone} border-white/30`}>
      <CardContent className="p-4 flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-white/60 dark:bg-black/20 flex items-center justify-center">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div>
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-lg font-bold">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}
