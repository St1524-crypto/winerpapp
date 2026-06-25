import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, MapPin, Check, ArrowLeft, Wallet, Percent, UserCheck, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCart } from "@/hooks/use-cart";
import { useAddresses } from "@/hooks/use-addresses";
import { useIsDealer, getEffectivePrice } from "@/hooks/use-dealer";
import { buildShippingSnapshot } from "@/lib/order-snapshot";
import { useWallet, useVipStatus } from "@/hooks/use-wallet";
import { applyOrderPoints } from "@/lib/points.functions";
import { signInWithIdentifier } from "@/lib/auth-lookup.functions";
import { quickRegisterAndSignIn } from "@/lib/checkout-register.functions";


export const Route = createFileRoute("/shop/checkout")({
  component: CheckoutPage,
  head: () => ({ meta: [{ title: "結帳 — 源晶商城" }] }),
});

const SHIPPING_FEE = 100;
const FREE_SHIPPING = 2000;

function CheckoutPage() {
  const { user, loading: authLoading } = useAuth();
  const { items, subtotal, clear } = useCart();
  const isDealer = useIsDealer();
  const { addresses, defaultAddress, loading: addrLoading } = useAddresses();
  const { wallet, refresh: refreshWallet } = useWallet();
  const { is_vip } = useVipStatus();
  const navigate = useNavigate();

  const [selectedAddrId, setSelectedAddrId] = useState<string>("");
  const [form, setForm] = useState({ receiver_name: "", phone: "", address: "", notes: "" });
  const [placing, setPlacing] = useState(false);
  const [useShopping, setUseShopping] = useState<number>(0);
  const [useDiscount, setUseDiscount] = useState<number>(0);

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/login" });
  }, [user, authLoading, navigate]);

  // Auto-apply default address whenever the list resolves or default changes
  useEffect(() => {
    if (addrLoading) return;
    if (addresses.length === 0) return;
    const target = defaultAddress ?? addresses[0];
    if (target && target.id !== selectedAddrId) {
      setSelectedAddrId(target.id);
    }
  }, [addresses, defaultAddress, addrLoading]);

  // Sync form snapshot from the selected address using the shared helper
  // (same function the test suite asserts is decoupled from later edits).
  useEffect(() => {
    const a = addresses.find((x) => x.id === selectedAddrId);
    if (a) {
      const snap = buildShippingSnapshot(a);
      setForm({
        receiver_name: snap.receiver_name,
        phone: snap.receiver_phone,
        address: snap.shipping_address,
        notes: form.notes,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAddrId, addresses]);

  const shipping = subtotal >= FREE_SHIPPING || subtotal === 0 ? 0 : SHIPPING_FEE;
  // 折扣點僅 VIP（復購）可用；最多折抵小計
  const maxDiscount = is_vip ? Math.min(wallet.discount_points, subtotal) : 0;
  const discountApplied = Math.max(0, Math.min(Math.floor(useDiscount) || 0, maxDiscount));
  const afterDiscount = Math.max(0, subtotal - discountApplied + shipping);
  // 餘額（購物點）可全額折抵；1 點 = NT$1
  const maxShoppingRedeem = Math.min(wallet.shopping_points, afterDiscount);
  const shoppingApplied = Math.max(0, Math.min(Math.floor(useShopping) || 0, maxShoppingRedeem));
  const total = Math.max(0, afterDiscount - shoppingApplied);
  const canPlace = useMemo(
    () => items.length > 0 && form.receiver_name && form.phone && form.address && !placing,
    [items, form, placing]
  );


  async function placeOrder() {
    if (!user || items.length === 0) return;
    setPlacing(true);
    try {
      const { data: noData, error: noErr } = await supabase.rpc("generate_so_no");
      if (noErr) throw noErr;
      const order_no = noData as string;

      // Derive company_id from the products being ordered (shop is per-tenant via product)
      const productIds = items.map((it) => it.product_id).filter(Boolean) as string[];
      const { data: prodRows, error: pErr } = await supabase
        .from("products")
        .select("id, company_id")
        .in("id", productIds);
      if (pErr) throw pErr;
      const companyId = prodRows?.[0]?.company_id;
      if (!companyId) throw new Error("無法判斷商品所屬公司，請聯絡客服");
      // 取出永久綁定的推薦人（profiles.referred_by），下單時快照到訂單
      const { data: meProf } = await supabase
        .from("profiles").select("referred_by").eq("id", user.id).maybeSingle();
      const referrerId = (meProf as any)?.referred_by ?? null;
      // 風控：禁止自己推薦自己
      const safeReferrerId = referrerId && referrerId !== user.id ? referrerId : null;

      const { data: order, error: oErr } = await supabase
        .from("sales_orders")
        .insert({
          order_no,
          company_id: companyId,
          user_id: user.id,
          customer_name: form.receiver_name,
          customer_email: user.email,
          customer_phone: form.phone,
          receiver_name: form.receiver_name,
          receiver_phone: form.phone,
          shipping_address: form.address,
          notes: form.notes || null,
          subtotal,
          shipping_fee: shipping,
          discount_amount: discountApplied,
          total_amount: total,
          referrer_id: safeReferrerId,
        })
        .select("id")
        .single();
      if (oErr) throw oErr;

      const prodCompanyMap = new Map(prodRows?.map((p: any) => [p.id, p.company_id]) ?? []);

      const rows = items.map((it) => {
        const unit = getEffectivePrice(it.product as any, isDealer);
        return {
          sales_order_id: order.id,
          company_id: (prodCompanyMap.get(it.product_id) as string) ?? companyId,
          product_id: it.product_id,
          product_name: it.product?.name ?? "",
          sku: it.product?.sku ?? null,
          image: it.product?.image ?? null,
          unit_price: unit,
          quantity: it.quantity,
          subtotal: unit * it.quantity,
        };
      });
      const { error: iErr } = await supabase.from("sales_order_items").insert(rows);
      if (iErr) throw iErr;

      // 扣抵錢包點數（餘額/折扣點），並產生交易紀錄
      if (shoppingApplied > 0 || discountApplied > 0) {
        try {
          await applyOrderPoints({
            data: {
              orderId: order.id,
              shopping_redeem: shoppingApplied,
              discount_redeem: discountApplied,
              reward_redeem: 0,
            },
          });
          await refreshWallet();
        } catch (err: any) {
          toast.warning(`訂單已建立，但點數扣抵失敗：${err.message ?? err}`);
        }
      }

      await clear();
      toast.success(`訂單建立成功：${order_no}`);
      navigate({ to: "/shop/account/orders/$id", params: { id: order.id } });

    } catch (e: any) {
      toast.error(e.message ?? "建立訂單失敗");
    } finally {
      setPlacing(false);
    }
  }

  if (authLoading || !user) {
    return <div className="container mx-auto px-4 py-20 flex justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-4">
        <Link to="/shop"><ArrowLeft className="h-4 w-4 mr-1" />返回商城</Link>
      </Button>
      <h1 className="text-2xl font-bold mb-6">結帳</h1>

      <div className="grid lg:grid-cols-[1fr_360px] gap-6">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between">
                <span>收件地址</span>
                <Link to="/shop/account/addresses" className="text-xs text-primary hover:underline font-normal">管理地址</Link>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {addrLoading ? (
                <div className="text-sm text-muted-foreground">載入中...</div>
              ) : addresses.length === 0 ? (
                <div className="text-sm">
                  <p className="text-muted-foreground mb-2">尚無收件地址，請先<Link to="/shop/account/addresses" className="text-primary underline mx-1">新增地址</Link>或於下方手動填寫。</p>
                </div>
              ) : (
                <RadioGroup value={selectedAddrId} onValueChange={setSelectedAddrId} className="grid sm:grid-cols-2 gap-2">
                  {addresses.map((a) => (
                    <label
                      key={a.id}
                      htmlFor={`addr-${a.id}`}
                      className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition ${
                        selectedAddrId === a.id ? "border-primary bg-primary/5" : "border-border/60 hover:border-primary/40"
                      }`}
                    >
                      <RadioGroupItem id={`addr-${a.id}`} value={a.id} className="mt-1" />
                      <div className="flex-1 min-w-0 text-sm">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="font-medium">{a.receiver_name}</span>
                          {a.is_default && <Badge className="text-[10px] px-1.5 py-0 gap-0.5"><Check className="h-2.5 w-2.5" />預設</Badge>}
                        </div>
                        <div className="text-xs text-muted-foreground">{a.phone}</div>
                        <div className="text-xs text-muted-foreground truncate">{[a.postal_code, a.city, a.address].filter(Boolean).join(" ")}</div>
                      </div>
                    </label>
                  ))}
                </RadioGroup>
              )}

              <Separator />

              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>收件人 *</Label>
                  <Input value={form.receiver_name} onChange={(e) => setForm({ ...form, receiver_name: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <Label>聯絡電話 *</Label>
                  <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1"><MapPin className="h-3 w-3" />收件地址 *</Label>
                <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>訂單備註</Label>
                <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="lg:sticky lg:top-20 h-fit">
          <CardHeader><CardTitle className="text-base">訂單摘要</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {items.map((it) => (
                <div key={it.id} className="flex items-center gap-2">
                  <div className="h-10 w-10 rounded bg-muted overflow-hidden shrink-0">
                    {it.product?.image && <img src={it.product.image} className="h-full w-full object-cover" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-xs">{it.product?.name}</div>
                    <div className="text-[11px] text-muted-foreground">× {it.quantity}</div>
                  </div>
                  <div className="tabular-nums text-xs">NT$ {(getEffectivePrice(it.product as any, isDealer) * it.quantity).toLocaleString()}</div>
                </div>
              ))}
              {items.length === 0 && <div className="text-muted-foreground text-center py-4">購物車為空</div>}
            </div>
            <Separator />
            <div className="flex justify-between"><span className="text-muted-foreground">小計</span><span className="tabular-nums">NT$ {subtotal.toLocaleString()}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">運費</span><span className="tabular-nums">{shipping === 0 ? "免運" : `NT$ ${shipping}`}</span></div>

            {/* 折扣點折抵（限 VIP 復購） */}
            <div className="space-y-1 pt-1">
              <div className="flex items-center justify-between text-xs">
                <Label className="flex items-center gap-1 text-muted-foreground font-normal">
                  <Percent className="h-3 w-3" />折扣點折抵
                  {!is_vip && <span className="text-[10px] text-muted-foreground">（限 VIP 復購）</span>}
                </Label>
                <span className="text-muted-foreground">可用 {wallet.discount_points.toLocaleString()}</span>
              </div>
              <div className="flex gap-2">
                <Input type="number" min={0} max={maxDiscount} value={useDiscount}
                  disabled={!is_vip || maxDiscount === 0}
                  onChange={(e) => setUseDiscount(Math.max(0, Math.min(maxDiscount, +e.target.value || 0)))}
                  className="h-8 text-xs" />
                <Button type="button" size="sm" variant="outline" className="h-8 text-xs px-2"
                  disabled={!is_vip || maxDiscount === 0}
                  onClick={() => setUseDiscount(maxDiscount)}>全部</Button>
              </div>
              {discountApplied > 0 && (
                <div className="flex justify-between text-xs text-success">
                  <span>已折抵</span><span className="tabular-nums">- NT$ {discountApplied.toLocaleString()}</span>
                </div>
              )}
            </div>

            {/* 餘額（購物點）折抵 */}
            <div className="space-y-1 pt-1">
              <div className="flex items-center justify-between text-xs">
                <Label className="flex items-center gap-1 text-muted-foreground font-normal">
                  <Wallet className="h-3 w-3" />餘額支付
                </Label>
                <span className="text-muted-foreground">可用 {wallet.shopping_points.toLocaleString()}</span>
              </div>
              <div className="flex gap-2">
                <Input type="number" min={0} max={maxShoppingRedeem} value={useShopping}
                  disabled={maxShoppingRedeem === 0}
                  onChange={(e) => setUseShopping(Math.max(0, Math.min(maxShoppingRedeem, +e.target.value || 0)))}
                  className="h-8 text-xs" />
                <Button type="button" size="sm" variant="outline" className="h-8 text-xs px-2"
                  disabled={maxShoppingRedeem === 0}
                  onClick={() => setUseShopping(maxShoppingRedeem)}>全部</Button>
              </div>
              {shoppingApplied > 0 && (
                <div className="flex justify-between text-xs text-success">
                  <span>已使用餘額</span><span className="tabular-nums">- NT$ {shoppingApplied.toLocaleString()}</span>
                </div>
              )}
            </div>

            <Separator />
            <div className="flex justify-between font-semibold text-base"><span>應付總計</span><span className="tabular-nums text-primary">NT$ {total.toLocaleString()}</span></div>

            <Button className="w-full mt-2" disabled={!canPlace} onClick={placeOrder}>
              {placing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}送出訂單
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
