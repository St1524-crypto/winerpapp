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
  const showDealer = isDealer && product.wholesale_price > 0 && product.wholesale_price < product.price;
  const outOfStock = product.stock <= 0;

  return (
    <div className="group rounded-2xl overflow-hidden border border-border/60 bg-card hover:shadow-2xl hover:shadow-primary/10 hover:border-primary/40 transition-all duration-300">
      <Link to="/shop/product/$id" params={{ id: product.id }} className="block aspect-square bg-muted overflow-hidden relative">
        {product.image ? (
          <img src={product.image} alt={product.name} className="h-full w-full object-cover group-hover:scale-110 transition-transform duration-500" />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-muted-foreground text-xs">無圖</div>
        )}
        {product.featured && (
          <Badge className="absolute top-3 left-3 bg-gradient-to-r from-primary to-primary/70 border-0">熱銷</Badge>
        )}
        {outOfStock && (
          <div className="absolute inset-0 bg-background/70 backdrop-blur-sm flex items-center justify-center">
            <Badge variant="secondary">已售完</Badge>
          </div>
        )}
      </Link>
      <div className="p-4 space-y-2">
        <Link to="/shop/product/$id" params={{ id: product.id }}>
          <div className="text-sm font-medium line-clamp-2 min-h-[2.5rem] group-hover:text-primary transition-colors">{product.name}</div>
        </Link>
        <div className="text-[11px] text-muted-foreground">{product.sku}</div>
        <div className="flex items-end justify-between pt-1">
          <div>
            <div className="text-lg font-bold text-primary tabular-nums">NT$ {price.toLocaleString()}</div>
            {showDealer && (
              <div className="text-[11px] text-muted-foreground line-through tabular-nums">NT$ {product.price.toLocaleString()}</div>
            )}
          </div>
          <Button
            size="icon"
            variant="secondary"
            disabled={outOfStock}
            onClick={(e) => { e.preventDefault(); addItem(product.id, 1); }}
            className="h-9 w-9 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <ShoppingCart className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
