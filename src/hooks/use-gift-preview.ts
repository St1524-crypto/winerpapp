import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchActiveGiftRules } from "@/lib/gift-rules-client";
import { computeGifts, type GiftCartLine, type GiftChannel, type GiftRule } from "@/lib/gift-rules";

/** 前台即時試算：回傳應贈清單與各規則達標進度 */
export function useGiftPreview(lines: GiftCartLine[], channel: GiftChannel = "shop") {
  const [rules, setRules] = useState<GiftRule[]>([]);
  const [names, setNames] = useState<Record<string, { name: string; image: string | null }>>({});

  useEffect(() => {
    let alive = true;
    fetchActiveGiftRules().then((r) => { if (alive) setRules(r); });
    return () => { alive = false; };
  }, []);

  const result = useMemo(() => computeGifts(lines, rules, channel), [lines, rules, channel]);

  const giftIds = useMemo(
    () => Array.from(new Set(rules.flatMap((r) => r.gifts.map((g) => g.product_id)))),
    [rules],
  );

  useEffect(() => {
    if (!giftIds.length) return;
    let alive = true;
    (supabase as any)
      .from("products")
      .select("id, name, image")
      .in("id", giftIds)
      .then(({ data }: any) => {
        if (!alive) return;
        const map: Record<string, { name: string; image: string | null }> = {};
        for (const p of data ?? []) map[p.id] = { name: p.name, image: p.image ?? null };
        setNames(map);
      });
    return () => { alive = false; };
  }, [giftIds.join(",")]);

  const awards = result.awards.map((a) => ({
    ...a,
    product_name: names[a.product_id]?.name ?? a.product_name ?? "贈品",
    image: names[a.product_id]?.image ?? null,
  }));

  return { awards, progress: result.progress, rules, giftNames: names };
}
