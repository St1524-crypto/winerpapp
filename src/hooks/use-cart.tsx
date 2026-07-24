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

// 訪客購物車 session token：使用 256 位隨機值以 hex 表示，
// 由 WebCrypto 產生，不可猜測；僅透過 `x-cart-session` request header 傳送
// （不出現在 URL / Referer / 伺服器 access log），並存放在 localStorage。
// RLS 以此 token 精確比對 carts.session_token，因此 token 就是持有即擁有的憑證。
function generateSessionToken() {
  const bytes = new Uint8Array(32); // 256-bit
  crypto.getRandomValues(bytes);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

function getOrCreateSessionToken() {
  if (typeof window === "undefined") return "";
  let t = localStorage.getItem(SESSION_KEY);
  // 舊格式（UUID，含 "-"）自動升級為 256-bit token，
  // 讓所有訪客獲得更高熵值的憑證。
  if (!t || t.includes("-") || t.length < 48) {
    t = generateSessionToken();
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
  getItemUnitPrice: (item: CartItem) => number;
  getItemUnitReward: (item: CartItem) => number;

}

const CartContext = createContext<CartCtx>({
  cartId: null, items: [], loading: true, count: 0, subtotal: 0,
  open: false, setOpen: () => {},
  addItem: async () => {}, updateQty: async () => {}, removeItem: async () => {}, clear: async () => {}, refresh: async () => {},
  getItemUnitPrice: () => 0,
  getItemUnitReward: () => 0,

});

type BundleAllocInfo = {
  price: number; // bundle_price
  baseSum: number; // Σ(product base price × qty per set)
  productBase: Record<string, number>; // pid → base price snapshot
  itemsPerSet: Record<string, number>; // pid → qty per set
};

export function CartProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const isDealer = useIsDealer();
  const [cartId, setCartId] = useState<string | null>(null);
  const [items, setItems] = useState<CartItem[]>([]);
  const [tiersMap, setTiersMap] = useState<Record<string, WholesaleTier[]>>({});
  const [bundleMap, setBundleMap] = useState<Record<string, BundleAllocInfo>>({});
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
      // find user cart (pick newest if multiple exist)
      const { data: userCarts } = await supabase
        .from("carts")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1);
      const userCart = userCarts?.[0];
      if (userCart) {
        const guestDb = getCartClient(token);
        const { data: guestCarts } = await guestDb
          .from("carts")
          .select("id")
          .eq("session_token", token)
          .is("user_id", null)
          .order("created_at", { ascending: false })
          .limit(1);
        const guestCart = guestCarts?.[0];
        if (guestCart && guestCart.id !== userCart.id) {
          const { data: guestItems } = await guestDb.from("cart_items").select("*").eq("cart_id", guestCart.id);
          for (const gi of guestItems ?? []) {
            await supabase.from("cart_items").insert({ cart_id: userCart.id, product_id: gi.product_id, quantity: gi.quantity });
          }
          await guestDb.from("carts").delete().eq("id", guestCart.id);
        }
        return userCart.id;
      }
      const guestDb = getCartClient(token);
      const { data: guestCarts } = await guestDb
        .from("carts")
        .select("id")
        .eq("session_token", token)
        .is("user_id", null)
        .order("created_at", { ascending: false })
        .limit(1);
      const guestCart = guestCarts?.[0];
      if (guestCart) {
        await supabase.from("carts").update({ user_id: user.id, session_token: null }).eq("id", guestCart.id);
        return guestCart.id;
      }
      const { data: created } = await supabase.from("carts").insert({ user_id: user.id }).select("id").single();
      return created!.id;
    } else {
      const db = getCartClient(token);
      const { data: guestCarts } = await db
        .from("carts")
        .select("id")
        .eq("session_token", token)
        .order("created_at", { ascending: false })
        .limit(1);
      const guestCart = guestCarts?.[0];
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
        .select("*, product:products(id, name, sku, price, image, stock, status)")
        .eq("cart_id", id)
        .order("created_at", { ascending: false });
      const itemList = (data ?? []) as unknown as CartItem[];
      setItems(itemList);
      const pids = Array.from(new Set(itemList.map((i) => i.product_id).filter(Boolean)));
      const tmap = await fetchTiersByProductIds(pids);
      setTiersMap(tmap);

      // ---- Bundle price allocation snapshot ----
      const bundleIds = Array.from(
        new Set(itemList.map((i) => (i as any).bundle_id).filter(Boolean) as string[])
      );
      if (bundleIds.length) {
        const [{ data: bundles }, { data: bItems }] = await Promise.all([
          db.from("repurchase_bundles").select("id, bundle_price").in("id", bundleIds),
          db.from("repurchase_bundle_items").select("bundle_id, product_id, quantity").in("bundle_id", bundleIds),
        ]);
        // product base prices (dealer-effective) come from the cart item's joined product
        const productBase: Record<string, number> = {};
        for (const it of itemList) {
          if (it.product && !productBase[it.product_id]) {
            productBase[it.product_id] = Number(getEffectivePrice(it.product as any, isDealer)) || 0;
          }
        }
        const map: Record<string, BundleAllocInfo> = {};
        for (const b of (bundles ?? []) as any[]) {
          const rows = (bItems ?? []).filter((r: any) => r.bundle_id === b.id);
          const itemsPerSet: Record<string, number> = {};
          let baseSum = 0;
          for (const r of rows as any[]) {
            itemsPerSet[r.product_id] = Number(r.quantity);
            baseSum += (productBase[r.product_id] ?? 0) * Number(r.quantity);
          }
          map[b.id] = {
            price: Number(b.bundle_price),
            baseSum,
            productBase,
            itemsPerSet,
          };
        }
        setBundleMap(map);
      } else {
        setBundleMap({});
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [ensureCart, getDb, isDealer]);

  useEffect(() => { refresh(); }, [refresh]);

  const addItem = async (productId: string, qty = 1) => {
    const id = cartId ?? (await ensureCart());
    if (!cartId) setCartId(id);
    const db = getDb();
    // 只與「非套組」的同商品列合併；套組列（bundle_line_key 非空）永遠獨立
    const existing = items.find((i) => i.product_id === productId && !i.bundle_line_key);
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

  const getItemUnitPrice = (i: CartItem) => {
    // 套組列：以 bundle_price 依基礎單價比例分攤，忽略單品階梯
    const bid = (i as any).bundle_id as string | undefined;
    if (bid && bundleMap[bid]) {
      const info = bundleMap[bid];
      const base = info.productBase[i.product_id] ?? (Number(getEffectivePrice(i.product as any, isDealer)) || 0);
      if (info.baseSum > 0) {
        return Math.round(base * (info.price / info.baseSum));
      }
      // fallback: 平均分攤
      const totalUnits = Object.values(info.itemsPerSet).reduce((s, q) => s + q, 0);
      return totalUnits > 0 ? Math.round(info.price / totalUnits) : 0;
    }
    const base = getEffectivePrice(i.product as any, isDealer);
    const tiers = tiersMap[i.product_id] ?? [];
    return applyWholesalePricing(base, 0, tiers, i.quantity).unitPrice;
  };
  const count = items.reduce((s, i) => s + i.quantity, 0);
  const subtotal = items.reduce((s, i) => s + getItemUnitPrice(i) * i.quantity, 0);

  return (
    <CartContext.Provider value={{ cartId, items, loading, count, subtotal, open, setOpen, addItem, updateQty, removeItem, clear, refresh, getItemUnitPrice }}>
      {children}
    </CartContext.Provider>
  );
}

export const useCart = () => useContext(CartContext);
