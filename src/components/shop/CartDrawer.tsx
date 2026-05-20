import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Minus, Plus, Trash2, ShoppingBag } from "lucide-react";
import { useCart } from "@/hooks/use-cart";
import { useIsDealer, getEffectivePrice } from "@/hooks/use-dealer";
import { Link } from "@tanstack/react-router";

const SHIPPING_THRESHOLD = 2000;
const SHIPPING_FEE = 150;

export function CartDrawer() {
  const { open, setOpen, items, count, subtotal, updateQty, removeItem } = useCart();
  const isDealer = useIsDealer();
  const shipping = subtotal >= SHIPPING_THRESHOLD || subtotal === 0 ? 0 : SHIPPING_FEE;
  const total = subtotal + shipping;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent className="w-full sm:max-w-md flex flex-col p-0">
        <SheetHeader className="px-6 py-4 border-b">
          <SheetTitle className="flex items-center gap-2">
            <ShoppingBag className="h-5 w-5" />
            購物車 <span className="text-sm font-normal text-muted-foreground">({count} 件商品)</span>
          </SheetTitle>
        </SheetHeader>

        <div className="flex-1 overflow-auto px-6 py-4 space-y-3">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
              <ShoppingBag className="h-16 w-16 mb-3 opacity-30" />
              <p className="text-sm">購物車空空如也</p>
              <Button variant="link" onClick={() => setOpen(false)} asChild>
                <Link to="/shop/products">去逛逛 →</Link>
              </Button>
            </div>
          ) : (
            items.map((it) => (
              <div key={it.id} className="flex gap-3 p-3 rounded-lg border border-border/60 bg-card">
                <div className="h-16 w-16 rounded-md bg-muted overflow-hidden shrink-0">
                  {it.product?.image ? (
                    <img src={it.product.image} alt={it.product.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-xs text-muted-foreground">無圖</div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{it.product?.name ?? "商品"}</div>
                  <div className="text-xs text-muted-foreground">{it.product?.sku}</div>
                  <div className="text-sm font-semibold text-primary mt-1">NT$ {getEffectivePrice(it.product as any, isDealer).toLocaleString()}</div>
                </div>
                <div className="flex flex-col items-end justify-between">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeItem(it.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                  <div className="flex items-center gap-1 border rounded-md">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => updateQty(it.id, it.quantity - 1)}><Minus className="h-3 w-3" /></Button>
                    <span className="w-7 text-center text-sm tabular-nums">{it.quantity}</span>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => updateQty(it.id, it.quantity + 1)}><Plus className="h-3 w-3" /></Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {items.length > 0 && (
          <div className="border-t px-6 py-4 space-y-2 bg-muted/30">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">商品小計</span>
              <span className="tabular-nums">NT$ {subtotal.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">運費</span>
              <span className="tabular-nums">{shipping === 0 ? <span className="text-emerald-500">免運</span> : `NT$ ${shipping}`}</span>
            </div>
            {subtotal < SHIPPING_THRESHOLD && subtotal > 0 && (
              <p className="text-[11px] text-muted-foreground">再消費 NT$ {(SHIPPING_THRESHOLD - subtotal).toLocaleString()} 享免運</p>
            )}
            <div className="flex justify-between text-base font-semibold pt-2 border-t">
              <span>合計</span>
              <span className="text-primary tabular-nums">NT$ {total.toLocaleString()}</span>
            </div>
            <Button className="w-full mt-2" size="lg" onClick={() => setOpen(false)} asChild>
              <Link to="/shop/checkout">前往結帳</Link>
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
