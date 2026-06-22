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
      .then(({ data }) => {
        if (!cancelled) {
          setIsDealer(!!(data as any)?.is_dealer);
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

/** 根據是否為經銷商回傳購買單價：經銷商且有經銷價時用經銷價，否則用一般售價。 */
export function getEffectivePrice(
  product: { price: number; wholesale_price: number | null } | null | undefined,
  isDealer: boolean,
): number {
  if (!product) return 0;
  const ws = Number(product.wholesale_price ?? 0);
  if (isDealer && ws > 0) return ws;
  return Number(product.price ?? 0);
}
