import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShoppingCart } from "lucide-react";
import { useCart } from "@/hooks/use-cart";
import { useIsDealer, getEffectivePrice } from "@/hooks/use-dealer";
import type { Product } from "@/types/product";

export function ProductCard({ product }: { product: Product }) {
  const { addItem } = useCart();
  const isDealer = useIsDealer();
  const price = getEffectivePrice(product, isDealer);
  const showDealer = false;
  const outOfStock = product.stock <= 0;

  return (
    <div className="group rounded-xl sm:rounded-2xl overflow-hidden border border-border/60 bg-card hover:shadow-2xl hover:shadow-primary/10 hover:border-primary/40 transition-all duration-300">
      <Link to="/shop/product/$id" params={{ id: product.id }} className="block aspect-square bg-muted overflow-hidden relative">
        {product.image ? (
          <img src={product.image} alt={product.name} loading="lazy" className="h-full w-full object-cover group-hover:scale-110 transition-transform duration-500" />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-muted-foreground text-xs">無圖</div>
        )}
        {product.featured && (
          <Badge className="absolute top-2 left-2 sm:top-3 sm:left-3 text-[10px] sm:text-xs px-1.5 py-0.5 bg-gradient-to-r from-primary to-primary/70 border-0">熱銷</Badge>
        )}
        {outOfStock && (
          <div className="absolute inset-0 bg-background/70 backdrop-blur-sm flex items-center justify-center">
            <Badge variant="secondary">已售完</Badge>
          </div>
        )}
      </Link>
      <div className="p-2.5 sm:p-4 space-y-1.5 sm:space-y-2">
        <Link to="/shop/product/$id" params={{ id: product.id }}>
          <div className="text-[13px] sm:text-sm font-medium line-clamp-2 min-h-[2.25rem] sm:min-h-[2.5rem] leading-snug group-hover:text-primary transition-colors">{product.name}</div>
        </Link>
        <div className="text-[10px] sm:text-[11px] text-muted-foreground truncate">{product.sku}</div>
        <div className="flex items-end justify-between gap-2 pt-0.5 sm:pt-1">
          <div className="min-w-0">
            <div className="text-base sm:text-lg font-bold text-primary tabular-nums truncate">NT$ {price.toLocaleString()}</div>
            {showDealer && (
              <div className="text-[10px] sm:text-[11px] text-muted-foreground line-through tabular-nums">NT$ {product.price.toLocaleString()}</div>
            )}
          </div>
          <Button
            size="icon"
            variant="secondary"
            disabled={outOfStock}
            aria-label="加入購物車"
            onClick={(e) => { e.preventDefault(); addItem(product.id, 1); }}
            className="h-8 w-8 sm:h-9 sm:w-9 shrink-0 rounded-full sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
          >
            <ShoppingCart className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </Button>
        </div>
      </div>
    </div>

  );
}
