import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { listOpenGroupBuys } from "@/lib/group-buy.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/group-buy-admin")({
  component: GroupBuyAdmin,
});

function GroupBuyAdmin() {
  const fn = useServerFn(listOpenGroupBuys);
  const { data, isLoading } = useQuery({ queryKey: ["admin", "group-buys"], queryFn: () => fn() });
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">拼團管理</h1>
      <Card>
        <CardHeader><CardTitle>進行中拼團</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? "載入中…" : (
            <table className="w-full text-sm">
              <thead><tr className="text-left border-b"><th className="py-2">商品</th><th>進度</th><th>單價</th><th>截止</th><th>狀態</th></tr></thead>
              <tbody>
                {(data?.groupBuys ?? []).map((g: any) => (
                  <tr key={g.id} className="border-b">
                    <td className="py-2">{g.products?.name}</td>
                    <td>{g.current_count}/{g.target_count}</td>
                    <td>NT${Number(g.unit_price).toLocaleString()}</td>
                    <td>{new Date(g.expires_at).toLocaleDateString("zh-TW")}</td>
                    <td><Badge>{g.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
