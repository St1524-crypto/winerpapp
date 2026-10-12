import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
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

  // Guests never touch cart tables directly: every guest operation goes through
  // token-checked database functions (guest_cart_*). Signed-in users use RLS.
  const rpc = supabase as any;
  const ensureCart = useCallback(async () => {
    const token = getOrCreateSessionToken();
    if (user) {
      const { data, error } = await rpc.rpc("guest_cart_claim", { _token: token || null });
      if (error) throw error;
      return data as string;
    }
    const { data, error } = await rpc.rpc("guest_cart_ensure", { _token: token });
    if (error) throw error;
    return data as string;
  }, [user]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const id = await ensureCart();
      setCartId(id);
      const db = supabase;
      const PRODUCT_COLS = "id, name, sku, price, image, stock, status, wholesale_only, reward_points, discount_points_max";
      let itemList: CartItem[];
      if (user) {
        const { data } = await supabase
          .from("cart_items")
          .select(`*, product:products(${PRODUCT_COLS})`)
          .eq("cart_id", id)
          .order("created_at", { ascending: false });
        itemList = (data ?? []) as unknown as CartItem[];
      } else {
        const { data: rows } = await rpc.rpc("guest_cart_items", { _token: getOrCreateSessionToken() });
        const list = (rows ?? []) as any[];
        const ids = Array.from(new Set(list.map((r) => r.product_id)));
        const { data: prods } = ids.length
          ? await supabase.from("products").select(PRODUCT_COLS).in("id", ids)
          : { data: [] as any[] };
        const pm = new Map(((prods ?? []) as any[]).map((p) => [p.id, p]));
        itemList = list.map((r) => ({ ...r, product: pm.get(r.product_id) ?? null })) as CartItem[];
      }
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
  }, [ensureCart, user, isDealer]);

  useEffect(() => { refresh(); }, [refresh]);

  const addItem = async (productId: string, qty = 1) => {
    const id = cartId ?? (await ensureCart());
    if (!cartId) setCartId(id);
    if (!user) {
      await rpc.rpc("guest_cart_add", { _token: getOrCreateSessionToken(), _product_id: productId, _qty: qty });
      toast.success("已加入購物車");
      await refresh();
      setOpen(true);
      return;
    }
    const db = supabase;
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
    if (!user) await rpc.rpc("guest_cart_set_qty", { _token: getOrCreateSessionToken(), _item_id: itemId, _qty: qty });
    else await supabase.from("cart_items").update({ quantity: qty }).eq("id", itemId);
    await refresh();
  };

  const removeItem = async (itemId: string) => {
    if (!user) await rpc.rpc("guest_cart_set_qty", { _token: getOrCreateSessionToken(), _item_id: itemId, _qty: 0 });
    else await supabase.from("cart_items").delete().eq("id", itemId);
    await refresh();
  };

  const clear = async () => {
    if (!cartId) return;
    if (!user) await rpc.rpc("guest_cart_clear", { _token: getOrCreateSessionToken() });
    else await supabase.from("cart_items").delete().eq("cart_id", cartId);
    await refresh();
  };

  // 合格 VIP / 經銷商可套用 VIP 批發階梯（RLS 已限制非合格身分讀不到），
  // 其他人只套用公開的零售多件優惠階梯。
  const tiersForItem = (i: CartItem) => {
    const all = tiersMap[i.product_id] ?? [];
    const vip = all.filter((t) => t.visibility === "vip" || t.visibility === "dealer");
    return vip.length > 0 ? vip : all.filter((t) => (t.visibility ?? "all") === "all");
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
    const tiers = tiersForItem(i);
    return applyWholesalePricing(base, 0, tiers, i.quantity).unitPrice;
  };
  const getItemUnitReward = (i: CartItem) => {
    // 套組不用單品獎勵點階梯（獎勵點由套組層另計）
    const bid = (i as any).bundle_id as string | undefined;
    if (bid) return 0;
    const baseReward = Number((i.product as any)?.reward_points ?? 0) || 0;
    const basePrice = Number(getEffectivePrice(i.product as any, isDealer)) || 0;
    const tiers = tiersForItem(i);
    return applyWholesalePricing(basePrice, baseReward, tiers, i.quantity).unitRewardPoints;
  };

  const count = items.reduce((s, i) => s + i.quantity, 0);
  const subtotal = items.reduce((s, i) => s + getItemUnitPrice(i) * i.quantity, 0);

  return (
    <CartContext.Provider value={{ cartId, items, loading, count, subtotal, open, setOpen, addItem, updateQty, removeItem, clear, refresh, getItemUnitPrice, getItemUnitReward }}>
      {children}
    </CartContext.Provider>
  );
}

export const useCart = () => useContext(CartContext);
