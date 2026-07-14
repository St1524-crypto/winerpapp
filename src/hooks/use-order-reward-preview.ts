import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  computeItemsRewardSubtotal,
  computeOrderRewardBreakdown,
  type OrderItemLike,
  type OrderRewardBreakdown,
} from "@/lib/order-reward-calc";

const MAX_LEVELS = 10;

interface Args {
  buyerId: string | null | undefined;
  items: OrderItemLike[];
  productRewardsMap: Record<string, number>;
  enabled?: boolean;
}

/**
 * Preview-only projection of the reward points an order should generate,
 * derived from item rules (tier_reward_points → products.reward_points) and
 * VIP bonus parameters (buyer VIP active / repurchase referrer chain).
 *
 * Does NOT hit cap ledgers — actual issuance in point_transactions may still
 * be reduced by 消費回饋上限 / 營業分紅上限.
 */
export function useOrderRewardPreview({ buyerId, items, productRewardsMap, enabled = true }: Args) {
  const itemsSubtotal = computeItemsRewardSubtotal(items, productRewardsMap);

  const q = useQuery({
    queryKey: ["order-reward-preview", buyerId ?? null, itemsSubtotal],
    enabled: enabled && !!buyerId && itemsSubtotal > 0,
    staleTime: 60_000,
    queryFn: async () => {
      // 1. Buyer VIP status
      const { data: prof } = await supabase
        .from("profiles")
        .select("is_vip, vip_expires_at, referred_by")
        .eq("id", buyerId!)
        .maybeSingle();
      const buyerVipActive =
        !!(prof as any)?.is_vip &&
        !!(prof as any)?.vip_expires_at &&
        new Date((prof as any).vip_expires_at) > new Date();

      // 2. Bonus rates (only when we'd need referrer distribution)
      let bonusRates: Array<{ generation_level: number; bonus_rate: number }> = [];
      const referrerChain: Array<{ id: string; vipActive: boolean }> = [];
      if (!buyerVipActive) {
        const { data: rates } = await supabase
          .from("repurchase_bonus_settings")
          .select("generation_level, bonus_rate, enabled")
          .eq("enabled", true)
          .order("generation_level");
        bonusRates = ((rates ?? []) as any[]).map((r) => ({
          generation_level: Number(r.generation_level),
          bonus_rate: Number(r.bonus_rate),
        }));

        // 3. Walk referrer chain (bounded)
        const maxLevel = Math.min(
          MAX_LEVELS,
          bonusRates.reduce((m, r) => Math.max(m, r.generation_level), 0),
        );
        let currentId = ((prof as any)?.referred_by as string | null) ?? null;
        const guard = new Set<string>([buyerId!]);
        for (let i = 0; i < maxLevel && currentId && !guard.has(currentId); i++) {
          guard.add(currentId);
          const { data: up } = await supabase
            .from("profiles")
            .select("id, is_vip, vip_expires_at, referred_by")
            .eq("id", currentId)
            .maybeSingle();
          const u = up as any;
          if (!u) break;
          const active = !!u.is_vip && !!u.vip_expires_at && new Date(u.vip_expires_at) > new Date();
          referrerChain.push({ id: u.id as string, vipActive: active });
          currentId = (u.referred_by as string | null) ?? null;
        }
      }

      const breakdown = computeOrderRewardBreakdown({
        buyerId: buyerId!,
        itemsSubtotal,
        buyerVipActive,
        referrerChain,
        bonusRates,
      });
      return breakdown satisfies OrderRewardBreakdown;
    },
  });

  return {
    itemsSubtotal,
    breakdown: q.data ?? null,
    loading: q.isLoading,
  };
}
