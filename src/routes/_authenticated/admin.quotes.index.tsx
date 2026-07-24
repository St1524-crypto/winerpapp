import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listQuotes } from "@/lib/quotes.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/quotes/")({
  component: QuotesListPage,
});

function QuotesListPage() {
  const fn = useServerFn(listQuotes);
  const { data, isLoading } = useQuery({ queryKey: ["quotes"], queryFn: () => fn() });

  return (
    <div className="container mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">報價單管理</h1>
          <p className="text-sm text-muted-foreground">建立、檢視與管理客戶報價單</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline"><Link to="/admin/quote-settings">公司／銀行設定</Link></Button>
          <Button asChild><Link to="/admin/quotes/new"><Plus className="h-4 w-4 mr-1" />新增報價單</Link></Button>
        </div>
      </div>

      <Card className="p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="text-left p-3">報價單號</th>
              <th className="text-left p-3">客戶</th>
              <th className="text-left p-3">日期</th>
              <th className="text-left p-3">有效期</th>
              <th className="text-right p-3">金額</th>
              <th className="text-left p-3">狀態</th>
              <th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td className="p-4" colSpan={7}>載入中…</td></tr>}
            {!isLoading && (data ?? []).length === 0 && (
              <tr><td className="p-4 text-muted-foreground" colSpan={7}>尚無報價單</td></tr>
            )}
            {(data ?? []).map((q) => (
              <tr key={q.id} className="border-t">
                <td className="p-3 font-mono">{q.quote_no}</td>
                <td className="p-3">{q.customer_name}</td>
                <td className="p-3">{q.quote_date}</td>
                <td className="p-3">{q.valid_until ?? "—"}</td>
                <td className="p-3 text-right">${Number(q.total_amount ?? 0).toLocaleString()}</td>
                <td className="p-3"><Badge variant="outline">{q.status}</Badge></td>
                <td className="p-3 text-right space-x-1">
                  <Button asChild size="sm" variant="ghost">
                    <Link to="/admin/quotes/$quoteId" params={{ quoteId: q.id }}>檢視</Link>
                  </Button>
                  <Button asChild size="sm" variant="ghost">
                    <Link to="/admin/quotes/$quoteId/edit" params={{ quoteId: q.id }}>編輯</Link>
                  </Button>
                </td>

              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
