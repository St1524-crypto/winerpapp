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
import { signInWithIdentifier } from "@/lib/auth-lookup.functions";
import { quickRegisterAndSignIn, requestGuestSignupOtp } from "@/lib/checkout-register.functions";
import { createSalesOrderWithPointPayments } from "@/lib/order-point-payments.functions";


export const Route = createFileRoute("/shop/checkout")({
  component: CheckoutPage,
  head: () => ({ meta: [{ title: "結帳 — 源晶商城" }] }),
});

const SHIPPING_FEE = 100;
const FREE_SHIPPING = 2000;

function CheckoutPage() {
  const { user, loading: authLoading } = useAuth();
  const { items, clear, getItemUnitPrice, getItemUnitReward } = useCart();
  const isDealer = useIsDealer();
  const subtotal = useMemo(
    () => items.reduce((s, it) => s + getItemUnitPrice(it) * it.quantity, 0),
    [items, getItemUnitPrice]
  );
  const { addresses, defaultAddress, loading: addrLoading } = useAddresses();
  const { wallet, refresh: refreshWallet } = useWallet();
  const { is_vip } = useVipStatus();
  const navigate = useNavigate();

  const [selectedAddrId, setSelectedAddrId] = useState<string>("");
  const [form, setForm] = useState({ receiver_name: "", phone: "", address: "", notes: "" });
  const [placing, setPlacing] = useState(false);
  const [useShopping, setUseShopping] = useState<number>(0);
  const [useDiscount, setUseDiscount] = useState<number>(0);
  const [useReward, setUseReward] = useState<number>(0);

  // Guest checkout: no auto-redirect; render inline auth UI below.

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
  const afterShopping = Math.max(0, afterDiscount - shoppingApplied);
  const maxRewardRedeem = Math.min(wallet.reward_points, afterShopping);
  const rewardApplied = Math.max(0, Math.min(Math.floor(useReward) || 0, maxRewardRedeem));
  const pointOffsetTotal = discountApplied + shoppingApplied + rewardApplied;
  const total = Math.max(0, afterShopping - rewardApplied);
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

      const prodCompanyMap = new Map(prodRows?.map((p: any) => [p.id, p.company_id]) ?? []);

      const rows = items.map((it) => {
        const unit = getItemUnitPrice(it);
        return {
          company_id: (prodCompanyMap.get(it.product_id) as string) ?? companyId,
          product_id: it.product_id,
          product_name: it.product?.name ?? "",
          sku: it.product?.sku ?? null,
          image: it.product?.image ?? null,
          unit_price: unit,
          quantity: it.quantity,
          subtotal: unit * it.quantity,
          bundle_id: (it as any).bundle_id ?? null,
          bundle_line_key: (it as any).bundle_line_key ?? null,
        };
      });

      const pointPayments: Array<{
        point_type: "discount" | "shopping" | "reward";
        points_used: number;
        amount_offset: number;
        note: string;
      }> = [];
      if (discountApplied > 0) {
        pointPayments.push({
          point_type: "discount",
          points_used: discountApplied,
          amount_offset: discountApplied,
          note: "Checkout discount point offset",
        });
      }
      if (shoppingApplied > 0) {
        pointPayments.push({
          point_type: "shopping",
          points_used: shoppingApplied,
          amount_offset: shoppingApplied,
          note: "Checkout shopping point offset",
        });
      }
      if (rewardApplied > 0) {
        pointPayments.push({
          point_type: "reward",
          points_used: rewardApplied,
          amount_offset: rewardApplied,
          note: "Checkout reward point offset",
        });
      }

      const order = await createSalesOrderWithPointPayments({
        data: {
          order: {
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
            discount_amount: pointOffsetTotal,
            total_amount: subtotal + shipping,
            payment_status: total <= 0 ? "paid" : "pending",
            referrer_id: safeReferrerId,
          },
          items: rows,
          payments: [],
          pointPayments,
        },
      });
      const orderId = (order as any)?.id;
      if (!orderId) throw new Error("訂單建立失敗，請重新整理後再試。");
      if (pointPayments.length > 0) await refreshWallet();

      await clear();
      toast.success(`訂單建立成功：${order_no}`);
      navigate({ to: "/shop/checkout/success/$id", params: { id: orderId } });

    } catch (e: any) {
      toast.error(formatCheckoutPointPaymentError(e));
    } finally {
      setPlacing(false);
    }
  }

  if (authLoading) {
    return <div className="container mx-auto px-4 py-20 flex justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  if (!user) {
    return <GuestAuthPanel />;
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
                  <div className="tabular-nums text-xs">NT$ {(getItemUnitPrice(it) * it.quantity).toLocaleString()}</div>
                </div>
              ))}
              {items.length === 0 && <div className="text-muted-foreground text-center py-4">購物車為空</div>}
            </div>
            {items.some((it) => (it as any).bundle_id) && (
              <div className="rounded-md border border-primary/30 bg-primary/5 p-2 text-[11px] leading-relaxed text-muted-foreground">
                <div className="font-medium text-primary mb-0.5">🎁 套組結帳說明</div>
                本次購物含復購優惠套組。套組一律以 <b>bundle_price</b> 計價（忽略單品階梯價），可與 <b>折扣點 / 購物點 / 貢獻點</b> 併用折抵應付金額；折抵<b>不影響</b>套組獎勵點（bundle_reward_points）發放，仍以「完整套組數 × 每組獎勵點」結算。
              </div>
            )}
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
                  <Wallet className="h-3 w-3" />購物點支付
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
            <div className="space-y-1 pt-1">
              <div className="flex items-center justify-between text-xs">
                <Label className="flex items-center gap-1 text-muted-foreground font-normal">
                  <Wallet className="h-3 w-3" />貢獻點折抵
                </Label>
                <span className="text-muted-foreground">可用 {wallet.reward_points.toLocaleString()}</span>
              </div>
              <div className="flex gap-2">
                <Input type="number" min={0} max={maxRewardRedeem} value={useReward}
                  disabled={maxRewardRedeem === 0}
                  onChange={(e) => setUseReward(Math.max(0, Math.min(maxRewardRedeem, +e.target.value || 0)))}
                  className="h-8 text-xs" />
                <Button type="button" size="sm" variant="outline" className="h-8 text-xs px-2"
                  disabled={maxRewardRedeem === 0}
                  onClick={() => setUseReward(maxRewardRedeem)}>全用</Button>
              </div>
              {rewardApplied > 0 && (
                <div className="flex justify-between text-xs text-success">
                  <span>已折抵貢獻點</span><span className="tabular-nums">- NT$ {rewardApplied.toLocaleString()}</span>
                </div>
              )}
            </div>

            <Separator />
            {pointOffsetTotal > 0 && (
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>點數折抵合計</span><span className="tabular-nums">- NT$ {pointOffsetTotal.toLocaleString()}</span>
              </div>
            )}
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

function formatCheckoutPointPaymentError(error: unknown) {
  const message = error instanceof Error ? error.message : String((error as any)?.message ?? error ?? "");
  if (message.includes("insufficient discount points")) return "折扣點餘額不足，請調整折抵點數後再送出。";
  if (message.includes("insufficient shopping points")) return "購物點餘額不足，請調整折抵點數後再送出。";
  if (message.includes("insufficient reward points")) return "貢獻點餘額不足，請調整折抵點數後再送出。";
  if (message.includes("point offset total cannot exceed") || message.includes("Point offset total cannot exceed")) {
    return "點數折抵不可超過訂單金額，請重新確認。";
  }
  if (message.includes("cash payment total cannot exceed") || message.includes("Cash payment total cannot exceed")) {
    return "現金付款不可超過扣除點數後的應付金額。";
  }
  if (message.includes("duplicate point_type") || message.includes("Duplicate point type")) {
    return "同一種點數不可重複折抵，請重新整理後再試。";
  }
  if (message.includes("cannot use another member point balance")) {
    return "不可使用其他會員的點數餘額。";
  }
  return message || "建立訂單失敗，請重新整理後再試。";
}

function GuestAuthPanel() {
  const { count } = useCart();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [busy, setBusy] = useState(false);

  // signin
  const [loginPhone, setLoginPhone] = useState("");
  const [loginPw, setLoginPw] = useState("");

  // signup
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);

  async function doLogin(e: React.FormEvent) {
    e.preventDefault();
    const id = loginPhone.trim().replace(/[\s-]/g, "");
    if (!/^\+?\d{8,15}$/.test(id)) { toast.error("手機格式錯誤"); return; }
    if (!loginPw) { toast.error("密碼錯誤，請重新輸入"); return; }
    setBusy(true);
    try {
      const res = await signInWithIdentifier({ data: { identifier: id, password: loginPw } })
        .catch(() => ({ ok: false as const, error: "invalid_credentials" }));
      if (!res.ok) { toast.error("密碼錯誤，請重新輸入"); return; }
      const { error } = await supabase.auth.setSession(res.session);
      if (error) throw error;
      toast.success("登入成功，繼續結帳");
    } catch (err: any) {
      toast.error(err.message ?? "登入失敗");
    } finally {
      setBusy(false);
    }
  }

  async function doSendOtp() {
    const cleanPhone = phone.trim().replace(/[\s-]/g, "");
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { toast.error("Email 格式錯誤"); return; }
    if (!/^\+?\d{8,15}$/.test(cleanPhone)) { toast.error("手機格式錯誤"); return; }
    setBusy(true);
    try {
      const res = await requestGuestSignupOtp({
        data: { phone: cleanPhone, email: email.trim() },
      }).catch(() => ({ ok: false as const, error: "send_failed" as const }));
      if (!res.ok) {
        if (res.error === "rate_limited") toast.error("嘗試次數過多，請稍後再試");
        else if (res.error === "phone_invalid") toast.error("手機格式錯誤");
        else toast.error("驗證碼發送失敗，請稍後再試");
        return;
      }
      setOtpSent(true);
      toast.success("驗證碼已寄至您的 Email，10 分鐘內有效");
    } finally {
      setBusy(false);
    }
  }

  async function doRegister(e: React.FormEvent) {
    e.preventDefault();
    const cleanPhone = phone.trim().replace(/[\s-]/g, "");
    if (!name.trim()) { toast.error("姓名不可空白"); return; }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { toast.error("Email 格式錯誤"); return; }
    if (!/^\+?\d{8,15}$/.test(cleanPhone)) { toast.error("手機格式錯誤"); return; }
    if (!address.trim()) { toast.error("地址不可空白"); return; }
    if (!/^\d{6}$/.test(otp.trim())) { toast.error("請輸入 6 位數 Email 驗證碼"); return; }
    setBusy(true);
    try {
      const res = await quickRegisterAndSignIn({
        data: {
          name: name.trim(),
          email: email.trim(),
          phone: cleanPhone,
          address: address.trim(),
          otp: otp.trim(),
        },
      }).catch(() => ({ ok: false as const, error: "create_failed" as const }));
      if (!res.ok) {
        if (res.error === "phone_exists") toast.error("此手機已是會員，請使用會員登入");
        else if (res.error === "phone_invalid") toast.error("手機格式錯誤");
        else if (res.error === "otp_invalid") toast.error("驗證碼錯誤或已過期，請重新取得");
        else toast.error("建立會員失敗，請聯絡客服");
        return;
      }
      const { error } = await supabase.auth.setSession(res.session);
      if (error) throw error;
      toast.success("會員建立成功，繼續結帳");
    } catch (err: any) {
      toast.error(err.message ?? "建立會員失敗，請聯絡客服");
    } finally {
      setBusy(false);
    }
  }


  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <Button asChild variant="ghost" size="sm" className="-ml-2 mb-4">
        <Link to="/shop"><ArrowLeft className="h-4 w-4 mr-1" />返回商城</Link>
      </Button>
      <h1 className="text-2xl font-bold mb-2">結帳前完成身份驗證</h1>
      <p className="text-sm text-muted-foreground mb-6">您目前購物車有 <b>{count}</b> 件商品。請選擇下方任一方式繼續結帳，購物車內容會自動保留。</p>

      <div className="flex gap-2 mb-4">
        <Button variant={mode === "signin" ? "default" : "outline"} className="flex-1" onClick={() => setMode("signin")}>
          <UserCheck className="h-4 w-4 mr-2" />已是會員
        </Button>
        <Button variant={mode === "signup" ? "default" : "outline"} className="flex-1" onClick={() => setMode("signup")}>
          <UserPlus className="h-4 w-4 mr-2" />新會員快速註冊
        </Button>
      </div>

      {mode === "signin" ? (
        <Card>
          <CardHeader><CardTitle className="text-base">會員登入</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={doLogin} className="space-y-3">
              <div className="space-y-1.5">
                <Label>手機號碼 *</Label>
                <Input value={loginPhone} onChange={(e) => setLoginPhone(e.target.value)} placeholder="0912345678" autoComplete="tel" />
              </div>
              <div className="space-y-1.5">
                <Label>密碼 *</Label>
                <Input type="password" value={loginPw} onChange={(e) => setLoginPw(e.target.value)} autoComplete="current-password" />
              </div>
              <Button type="submit" className="w-full" disabled={busy}>
                {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}會員登入並繼續結帳
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">新會員快速註冊</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">預設密碼為 <code className="font-mono">st</code> + 您的行動電話，登入後可至會員中心修改。</p>
          </CardHeader>
          <CardContent>
            <form onSubmit={doRegister} className="space-y-3">
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>姓名 *</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="王小明" />
                </div>
                <div className="space-y-1.5">
                  <Label>行動電話 *</Label>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0912345678" autoComplete="tel" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Email *</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
              </div>
              <div className="space-y-1.5">
                <Label>收件地址 *</Label>
                <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="台北市信義區市府路 1 號" />
              </div>
              <div className="space-y-1.5 rounded-md border border-dashed p-3 bg-muted/30">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-sm">Email 驗證碼 *</Label>
                  <Button type="button" variant="outline" size="sm" onClick={doSendOtp} disabled={busy}>
                    {otpSent ? "重新寄送" : "寄送驗證碼"}
                  </Button>
                </div>
                <Input
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  inputMode="numeric"
                  placeholder="6 位數驗證碼"
                  disabled={!otpSent}
                />
                <p className="text-[11px] text-muted-foreground">
                  為防止濫用註冊，須先驗證 Email 才能建立會員。驗證碼 10 分鐘內有效。
                </p>
              </div>
              <Button type="submit" className="w-full" disabled={busy || !otpSent}>
                {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}建立會員並繼續結帳
              </Button>

            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
