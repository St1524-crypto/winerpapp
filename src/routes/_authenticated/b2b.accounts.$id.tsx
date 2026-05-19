import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Building2, Mail, Phone, MapPin, Wallet, Calendar, FileText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  useBusinessAccount, ACCOUNT_LEVEL_LABELS, ACCOUNT_STATUS_LABELS,
  ACCOUNT_LEVEL_TONE, ACCOUNT_STATUS_TONE,
} from "@/hooks/use-business-accounts";

export const Route = createFileRoute("/_authenticated/b2b/accounts/$id")({
  component: BusinessAccountDetail,
});

function BusinessAccountDetail() {
  const { id } = Route.useParams();
  const { data, loading } = useBusinessAccount(id);
  const [statements, setStatements] = useState<any[]>([]);

  useEffect(() => {
    if (!id) return;
    supabase.from("account_statements" as any).select("*").eq("business_account_id", id).order("statement_month", { ascending: false })
      .then(({ data }) => setStatements((data ?? []) as any[]));
  }, [id]);

  if (loading) return <div className="space-y-4"><Skeleton className="h-8 w-64" /><Skeleton className="h-64" /></div>;
  if (!data) return <div className="text-center py-12 text-muted-foreground">找不到此 B2B 廠商</div>;

  const pct = data.credit_limit > 0 ? Math.min(100, (data.credit_used / data.credit_limit) * 100) : 0;
  const available = Math.max(0, Number(data.credit_limit) - Number(data.credit_used));

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="-ml-2">
        <Link to="/b2b/accounts"><ArrowLeft className="h-4 w-4 mr-1" />返回廠商列表</Link>
      </Button>

      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="flex gap-4 items-start">
          <div className="h-14 w-14 rounded-xl bg-gradient-primary flex items-center justify-center text-white">
            <Building2 className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">{data.company_name}</h1>
            <div className="flex gap-2 mt-2">
              <Badge variant="outline" className={ACCOUNT_LEVEL_TONE[data.account_level]}>{ACCOUNT_LEVEL_LABELS[data.account_level]}</Badge>
              <Badge variant="outline" className={ACCOUNT_STATUS_TONE[data.status]}>{ACCOUNT_STATUS_LABELS[data.status]}</Badge>
              <Badge variant="outline">月結 {data.payment_terms} 天</Badge>
            </div>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Card className="md:col-span-2">
          <CardHeader><CardTitle className="text-base">公司資料</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-4 text-sm">
            <InfoRow icon={FileText} label="統一編號" value={data.tax_id ?? "—"} />
            <InfoRow icon={Building2} label="聯絡人" value={data.contact_name ?? "—"} />
            <InfoRow icon={Phone} label="電話" value={data.phone ?? "—"} />
            <InfoRow icon={Mail} label="Email" value={data.email ?? "—"} />
            <InfoRow icon={MapPin} label="地址" value={data.address ?? "—"} className="col-span-2" />
            {data.notes && <InfoRow icon={FileText} label="備註" value={data.notes} className="col-span-2" />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Wallet className="h-4 w-4" />信用額度</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="text-xs text-muted-foreground">總額度</div>
              <div className="text-2xl font-bold">NT${Number(data.credit_limit).toLocaleString()}</div>
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span>已使用 NT${Number(data.credit_used).toLocaleString()}</span>
                <span className="text-muted-foreground">{pct.toFixed(0)}%</span>
              </div>
              <Progress value={pct} className="h-2" />
            </div>
            <div className="pt-2 border-t">
              <div className="text-xs text-muted-foreground">可用額度</div>
              <div className="text-lg font-semibold text-emerald-600">NT${available.toLocaleString()}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><Calendar className="h-4 w-4" />月結帳單</CardTitle></CardHeader>
        <CardContent>
          {statements.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">尚無月結帳單</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>結帳月份</TableHead>
                  <TableHead>應收</TableHead>
                  <TableHead>已付</TableHead>
                  <TableHead>未付</TableHead>
                  <TableHead>到期日</TableHead>
                  <TableHead>狀態</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {statements.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.statement_month}</TableCell>
                    <TableCell>NT${Number(s.total_amount).toLocaleString()}</TableCell>
                    <TableCell className="text-emerald-600">NT${Number(s.paid_amount).toLocaleString()}</TableCell>
                    <TableCell className="text-rose-600">NT${Number(s.unpaid_amount).toLocaleString()}</TableCell>
                    <TableCell>{s.due_date ?? "—"}</TableCell>
                    <TableCell><Badge variant="outline">{s.status}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value, className }: any) {
  return (
    <div className={className}>
      <div className="text-xs text-muted-foreground flex items-center gap-1"><Icon className="h-3 w-3" />{label}</div>
      <div className="mt-1">{value}</div>
    </div>
  );
}
