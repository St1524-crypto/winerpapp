import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { listOpenGroupBuys } from "@/lib/group-buy.functions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Users, Clock } from "lucide-react";

export const Route = createFileRoute("/group-buys/")({
  head: () => ({
    meta: [
      { title: "好處多多樂拼購 — 進行中的拼團" },
      { name: "description", content: "瀏覽進行中的拼團活動，6 人成團享中獎好禮。" },
    ],
  }),
  component: GroupBuysPage,
});

function GroupBuysPage() {
  const fetchList = useServerFn(listOpenGroupBuys);
  const { data, isLoading } = useQuery({ queryKey: ["group-buys", "open"], queryFn: () => fetchList() });

  return (
    <div className="min-h-screen bg-muted/30 py-8 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8 text-center">
          <h1 className="text-3xl md:text-4xl font-bold mb-2">🎉 好處多多樂拼購</h1>
          <p className="text-muted-foreground">6 人成團，中獎者贏 80% 購物點，發起人賺 10% 獎勵！</p>
          <Link to="/recruit" className="inline-block mt-3 text-sm text-primary hover:underline">
            想了解 VIP 制度？問問 AI 招商顧問 →
          </Link>
        </div>
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">載入中…</div>
        ) : !data?.groupBuys.length ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">目前沒有進行中的拼團</CardContent></Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.groupBuys.map((gb: any) => {
              const pct = (gb.current_count / gb.target_count) * 100;
              const hoursLeft = Math.max(0, Math.floor((new Date(gb.expires_at).getTime() - Date.now()) / 3600_000));
              return (
                <Card key={gb.id} className="overflow-hidden hover:shadow-lg transition">
                  {gb.products?.image && (
                    <img src={gb.products.image} alt={gb.products.name} className="w-full h-40 object-cover" />
                  )}
                  <CardHeader>
                    <CardTitle className="text-base">{gb.products?.name}</CardTitle>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-primary font-bold text-lg">NT$ {Number(gb.unit_price).toLocaleString()}</span>
                      <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />{hoursLeft}h 剩</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="flex items-center gap-1"><Users className="h-3 w-3" />{gb.current_count}/{gb.target_count} 人</span>
                        <span>{Math.round(pct)}%</span>
                      </div>
                      <Progress value={pct} />
                    </div>
                    <Link to="/group-buys/$id" params={{ id: gb.id }}>
                      <Button className="w-full">查看詳情 / 加入</Button>
                    </Link>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
