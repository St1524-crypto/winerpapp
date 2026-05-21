import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
import { getMyWallet, getMyVip } from "@/lib/points.functions";

export interface WalletBalances {
  shopping_points: number;
  reward_points: number;
  discount_points: number;
}

export function useWallet() {
  const { user } = useAuth();
  const [wallet, setWallet] = useState<WalletBalances>({
    shopping_points: 0,
    reward_points: 0,
    discount_points: 0,
  });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setWallet({ shopping_points: 0, reward_points: 0, discount_points: 0 });
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const w = await getMyWallet();
      setWallet(w);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { wallet, loading, refresh };
}

export function useVipStatus() {
  const { user } = useAuth();
  const [vip, setVip] = useState<{ is_vip: boolean; vip_expires_at: string | null }>({
    is_vip: false,
    vip_expires_at: null,
  });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setVip({ is_vip: false, vip_expires_at: null });
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const v = await getMyVip();
      setVip(v);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { ...vip, loading, refresh };
}
