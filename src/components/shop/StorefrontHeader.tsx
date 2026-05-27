import { Link, useNavigate } from "@tanstack/react-router";
import { ShoppingCart, Search, User, Menu, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useCart } from "@/hooks/use-cart";
import { useAuth } from "@/hooks/use-auth";
import { useCurrentCompany } from "@/hooks/use-current-company";
import { CompanyLogo } from "@/components/company-logo";
import { useState } from "react";

export function StorefrontHeader() {
  const { count, setOpen } = useCart();
  const { user } = useAuth();
  const { current } = useCurrentCompany();
  const [q, setQ] = useState("");
  const navigate = useNavigate();

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    navigate({ to: "/shop/products", search: { q } as any });
  };

  const brandName = current?.company_name ?? "源晶商城";
  const brandInitial = brandName.charAt(0);

  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-xl">
      <div className="container mx-auto flex h-16 items-center gap-4 px-4">
        <Link to="/shop" className="flex items-center gap-2 shrink-0">
          <CompanyLogo
            src={current?.logo_url}
            alt={brandName}
            fallbackInitial={brandInitial}
            size="md"
            className="rounded-xl bg-white shadow-lg shadow-primary/20 ring-1 ring-primary/30"
          />
          <div className="hidden sm:block">
            <div className="text-sm font-semibold leading-tight">{brandName}</div>
            <div className="text-[10px] text-muted-foreground leading-tight">YJ Store</div>
          </div>
        </Link>

        <form onSubmit={submitSearch} className="flex-1 max-w-xl hidden md:flex relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜尋商品、品牌、SKU..."
            className="pl-9 h-10 bg-muted/40 border-border/50 focus-visible:bg-background"
          />
        </form>

        <nav className="hidden lg:flex items-center gap-1 text-sm">
          <Link to="/shop" className="px-3 py-1.5 rounded-md hover:bg-accent">首頁</Link>
          <Link to="/shop/products" className="px-3 py-1.5 rounded-md hover:bg-accent">全部商品</Link>
        </nav>

        <div className="flex items-center gap-1 ml-auto">
          <Button variant="ghost" size="icon" className="hidden md:flex" asChild>
            <Link to={user ? "/shop/account" : "/login"}>
              <User className="h-5 w-5" />
            </Link>
          </Button>
          <Button variant="ghost" size="icon" className="hidden sm:flex" asChild>
            <Link to={user ? "/shop/account" : "/login"}>
              <Heart className="h-5 w-5" />
            </Link>
          </Button>
          <Button variant="ghost" size="icon" className="relative" onClick={() => setOpen(true)}>
            <ShoppingCart className="h-5 w-5" />
            {count > 0 && (
              <Badge className="absolute -top-1 -right-1 h-5 min-w-5 px-1 rounded-full text-[10px] tabular-nums">{count}</Badge>
            )}
          </Button>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72">
              <SheetHeader>
                <SheetTitle>選單</SheetTitle>
              </SheetHeader>
              <nav className="mt-6 flex flex-col gap-1 text-sm">
                <Link to="/shop" className="px-3 py-2 rounded-md hover:bg-accent">首頁</Link>
                <Link to="/shop/products" className="px-3 py-2 rounded-md hover:bg-accent">全部商品</Link>
                <Link to={user ? "/shop/account" : "/login"} className="px-3 py-2 rounded-md hover:bg-accent">會員中心</Link>
                <Link to={user ? "/shop/account/orders" : "/login"} className="px-3 py-2 rounded-md hover:bg-accent">我的訂單</Link>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
      <div className="md:hidden border-t border-border/60 px-4 py-2">
        <form onSubmit={submitSearch} className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜尋商品..." className="pl-9 h-9 bg-muted/40" />
        </form>
      </div>
    </header>
  );
}
