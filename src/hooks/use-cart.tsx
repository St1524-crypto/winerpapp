import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getCartClient } from "@/integrations/supabase/cart-client";
import { useAuth } from "@/hooks/use-auth";
import { useIsDealer, getEffectivePrice } from "@/hooks/use-dealer";
import { applyWholesalePricing, fetchTiersByProductIds } from "@/lib/wholesale-pricing";
import type { WholesaleTier } from "@/types/product";
import type { CartItem } from "@/types/shop";
import { toast } from "sonner";

const SESSION_KEY = "yj_cart_token";

function getOrCreateSessionToken() {
  if (typeof window === "undefined") return "";
  let t = localStorage.getItem(SESSION_KEY);
  if (!t) {
    t = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, t);
  }
  return t;
}

interface CartCtx {
  cartId: string | null;
  items: CartItem[];
  loading: boolean;
  count: number;
  subtotal: number;
  open: boolean;
  setOpen: (v: boolean) => void;
  addItem: (productId: string, qty?: number) => Promise<void>;
  updateQty: (itemId: string, qty: number) => Promise<void>;
  removeItem: (itemId: string) => Promise<void>;
  clear: () => Promise<void>;
  refresh: () => Promise<void>;
}

const CartContext = createContext<CartCtx>({
  cartId: null, items: [], loading: true, count: 0, subtotal: 0,
  open: false, setOpen: () => {},
  addItem: async () => {}, updateQty: async () => {}, removeItem: async () => {}, clear: async () => {}, refresh: async () => {},
});

export function CartProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const isDealer = useIsDealer();
  const [cartId, setCartId] = useState<string | null>(null);
  const [items, setItems] = useState<CartItem[]>([]);
  const [tiersMap, setTiersMap] = useState<Record<string, WholesaleTier[]>>({});
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  // Pick the right Supabase client: authenticated users use the regular
  // client (RLS scopes by auth.uid()); guests use a client that injects the
  // `x-cart-session` header so RLS can match the cart row by session token.
  const getDb = useCallback(() => {
    if (user) return supabase;
    const token = getOrCreateSessionToken();
    return getCartClient(token);
  }, [user]);

  const ensureCart = useCallback(async () => {
    const token = getOrCreateSessionToken();
    if (user) {
      // find user cart
      const { data: userCart } = await supabase.from("carts").select("*").eq("user_id", user.id).maybeSingle();
      if (userCart) {
        // merge guest cart if any — use the guest client so RLS lets us read it
        const guestDb = getCartClient(token);
        const { data: guestCart } = await guestDb.from("carts").select("id").eq("session_token", token).is("user_id", null).maybeSingle();
        if (guestCart && guestCart.id !== userCart.id) {
          const { data: guestItems } = await guestDb.from("cart_items").select("*").eq("cart_id", guestCart.id);
          for (const gi of guestItems ?? []) {
            await supabase.from("cart_items").insert({ cart_id: userCart.id, product_id: gi.product_id, quantity: gi.quantity });
          }
          await guestDb.from("carts").delete().eq("id", guestCart.id);
        }
        return userCart.id;
      }
      // promote guest cart to user cart, or create new
      const guestDb = getCartClient(token);
      const { data: guestCart } = await guestDb.from("carts").select("id").eq("session_token", token).is("user_id", null).maybeSingle();
      if (guestCart) {
        await supabase.from("carts").update({ user_id: user.id, session_token: null }).eq("id", guestCart.id);
        return guestCart.id;
      }
      const { data: created } = await supabase.from("carts").insert({ user_id: user.id }).select("id").single();
      return created!.id;
    } else {
      const db = getCartClient(token);
      const { data: guestCart } = await db.from("carts").select("id").eq("session_token", token).maybeSingle();
      if (guestCart) return guestCart.id;
      const { data: created } = await db.from("carts").insert({ session_token: token }).select("id").single();
      return created!.id;
    }
  }, [user]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const id = await ensureCart();
      setCartId(id);
      const db = getDb();
      const { data } = await db
        .from("cart_items")
        .select("*, product:products(id, name, sku, price, wholesale_price, image, stock, status)")
        .eq("cart_id", id)
        .order("created_at", { ascending: false });
      const itemList = (data ?? []) as unknown as CartItem[];
      setItems(itemList);
      const pids = Array.from(new Set(itemList.map((i) => i.product_id).filter(Boolean)));
      const tmap = await fetchTiersByProductIds(pids);
      setTiersMap(tmap);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [ensureCart, getDb]);

  useEffect(() => { refresh(); }, [refresh]);

  const addItem = async (productId: string, qty = 1) => {
    const id = cartId ?? (await ensureCart());
    if (!cartId) setCartId(id);
    const db = getDb();
    const existing = items.find((i) => i.product_id === productId);
    if (existing) {
      await db.from("cart_items").update({ quantity: existing.quantity + qty }).eq("id", existing.id);
    } else {
      await db.from("cart_items").insert({ cart_id: id, product_id: productId, quantity: qty });
    }
    toast.success("已加入購物車");
    await refresh();
    setOpen(true);
  };

  const updateQty = async (itemId: string, qty: number) => {
    if (qty <= 0) return removeItem(itemId);
    await getDb().from("cart_items").update({ quantity: qty }).eq("id", itemId);
    await refresh();
  };

  const removeItem = async (itemId: string) => {
    await getDb().from("cart_items").delete().eq("id", itemId);
    await refresh();
  };

  const clear = async () => {
    if (!cartId) return;
    await getDb().from("cart_items").delete().eq("cart_id", cartId);
    await refresh();
  };

  const count = items.reduce((s, i) => s + i.quantity, 0);
  const subtotal = items.reduce((s, i) => {
    const base = getEffectivePrice(i.product as any, isDealer);
    const tiers = tiersMap[i.product_id] ?? [];
    const { unitPrice } = applyWholesalePricing(base, 0, tiers, i.quantity);
    return s + unitPrice * i.quantity;
  }, 0);

  return (
    <CartContext.Provider value={{ cartId, items, loading, count, subtotal, open, setOpen, addItem, updateQty, removeItem, clear, refresh }}>
      {children}
    </CartContext.Provider>
  );
}

export const useCart = () => useContext(CartContext);
