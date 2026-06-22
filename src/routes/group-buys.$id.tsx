import { createFileRoute, useNavigate, useRouter, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { getGroupBuy, joinGroupBuy } from "@/lib/group-buy.functions";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";

export const Route = createFileRoute("/group-buys/$id")({
  component: GroupBuyDetail,
});

function GroupBuyDetail() {
  const { id } = Route.useParams();
  const router = useRouter();
  const navigate = useNavigate();
  const auth = useAuth();
  const fetchDetail = useServerFn(getGroupBuy);
  const joinFn = useServerFn(joinGroupBuy);
  const { data, isLoading } = useQuery({
    queryKey: ["group-buy", id],
    queryFn: () => fetchDetail({ data: { id } }),
  });
  const [qty, setQty] = useState(1);
  const [pm, setPm] = useState<"points" | "bank_transfer" | "mixed">("bank_transfer");
  const [pointsUsed, setPointsUsed] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  if (isLoading) return <div className="p-8 text-center">載入中…</div>;
  if (!data) return <div className="p-8 text-center">拼團不存在</div>;
  const { groupBuy: gb, orders } = data;
  const remaining = gb.target_count - gb.current_count;
  const subtotal = Number(gb.unit_price) * qty;

  async function handleJoin() {
    if (!auth.user) { navigate({ to: "/login" }); return; }
    setSubmitting(true);
    try {
      await joinFn({ data: { groupBuyId: id, quantity: qty, paymentMethod: pm, pointsUsed } });
      toast.success(pm === "bank_transfer" || pm === "mixed" ? "下單成功！請完成匯款" : "下單成功，已扣購物點");
      router.invalidate();
    } catch (e: any) {
      toast.error(e?.message ?? "下單失敗");
    } finally { setSubmitting(false); }
  }

  return (
    <div className="min-h-screen bg-muted/30 py-8 px-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <Link to="/group-buys" className="text-sm text-primary hover:underline">← 返回列表</Link>
        <div className="grid md:grid-cols-2 gap-6">
          <Card>
            {gb.products?.image && <img src={gb.products.image} alt="" className="w-full h-64 object-cover" />}
            <CardHeader>
              <CardTitle>{gb.products?.name}</CardTitle>
              <p className="text-2xl text-primary font-bold">NT$ {Number(gb.unit_price).toLocaleString()}</p>
              <Badge>{gb.status === "open" ? "進行中" : gb.status}</Badge>
            </CardHeader>
            <CardContent>
              <div className="text-sm text-muted-foreground mb-2">{gb.products?.description}</div>
              <div className="flex items-center justify-between text-sm mb-1">
                <span>進度 {gb.current_count}/{gb.target_count} 人</span>
                <span>還差 {remaining} 人</span>
              </div>
              <Progress value={(gb.current_count / gb.target_count) * 100} />
              <p className="text-xs text-muted-foreground mt-2">截止 {new Date(gb.expires_at).toLocaleString("zh-TW")}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>加入拼團</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {gb.status !== "open" ? (
                <p className="text-center text-muted-foreground">此團已結束</p>
              ) : (
                <>
                  <div>
                    <Label>數量（最多 2 單）</Label>
                    <Input type="number" min={1} max={Math.min(2, remaining)} value={qty}
                      onChange={(e) => setQty(Math.max(1, Math.min(2, Number(e.target.value))))} />
                  </div>
                  <div>
                    <Label>付款方式</Label>
                    <RadioGroup value={pm} onValueChange={(v) => setPm(v as any)}>
                      <div className="flex items-center space-x-2"><RadioGroupItem value="bank_transfer" id="bt" /><label htmlFor="bt">銀行匯款</label></div>
                      <div className="flex items-center space-x-2"><RadioGroupItem value="points" id="pt" /><label htmlFor="pt">全額購物點</label></div>
                      <div className="flex items-center space-x-2"><RadioGroupItem value="mixed" id="mx" /><label htmlFor="mx">購物點 + 匯款</label></div>
                    </RadioGroup>
                  </div>
                  {pm === "mixed" && (
                    <div>
                      <Label>使用購物點</Label>
                      <Input type="number" min={0} max={subtotal} value={pointsUsed}
                        onChange={(e) => setPointsUsed(Math.max(0, Math.min(subtotal, Number(e.target.value))))} />
                    </div>
                  )}
                  <div className="border-t pt-3 flex justify-between font-bold">
                    <span>合計</span>
                    <span>NT$ {subtotal.toLocaleString()}</span>
                  </div>
                  <Button className="w-full" disabled={submitting || remaining < qty} onClick={handleJoin}>
                    {submitting ? "處理中…" : auth.user ? "確認下單" : "登入後加入"}
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle>已加入成員（{orders.length}）</CardTitle></CardHeader>
          <CardContent>
            {orders.length === 0 ? (
              <p className="text-sm text-muted-foreground">尚無成員加入</p>
            ) : (
              <ul className="space-y-2">
                {orders.map((o: any) => (
                  <li key={o.id} className="flex items-center justify-between text-sm">
                    <span>會員 × {o.quantity}</span>
                    <Badge variant={o.status === "paid" ? "default" : "secondary"}>
                      {o.status === "paid" ? "已付款" : o.status === "pending_payment" ? "待付款" : o.status}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
