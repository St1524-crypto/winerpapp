import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

/** 取得目前登入會員是否為經銷商，以及是否已載入完成。未登入時為 false。 */
export function useDealerStatus(): { isDealer: boolean; loaded: boolean } {
  const { user } = useAuth();
  const [isDealer, setIsDealer] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!user) { setIsDealer(false); setLoaded(true); return; }
    setLoaded(false);
    let cancelled = false;
    supabase
      .from("profiles")
      .select("is_dealer")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!cancelled) {
          setIsDealer(error ? false : !!(data as any)?.is_dealer);
          setLoaded(true);
        }
      });
    return () => { cancelled = true; };
  }, [user?.id]);

  return { isDealer, loaded };
}

/** 取得目前登入會員是否為經銷商。未登入時為 false。 */
export function useIsDealer(): boolean {
  const { isDealer } = useDealerStatus();
  return isDealer;
}

/**
 * 回傳購買單價。
 * 注意：批發 / 經銷價現在透過伺服器端 RPC（quote_wholesale_price）在加入購物車與結帳時計算，
 * client 端不再直接讀取 products.wholesale_price，因此這裡僅回傳基礎售價。
 */
export function getEffectivePrice(
  product: { price: number; wholesale_price?: number | null } | null | undefined,
  _isDealer: boolean,
): number {
  if (!product) return 0;
  return Number(product.price ?? 0);
}
