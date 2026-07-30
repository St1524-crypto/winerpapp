import { supabase } from "@/integrations/supabase/client";
import type { GiftRule } from "./gift-rules";
import { normalizeRules, GIFT_RULE_SELECT } from "./gift-rules-shared";

export { normalizeRules };

/** 讀取啟用中的贈品規則（含觸發商品與贈品內容）。anon / authenticated 皆可讀。 */
export async function fetchActiveGiftRules(): Promise<GiftRule[]> {
  const { data, error } = await (supabase as any)
    .from("gift_rules")
    .select(GIFT_RULE_SELECT)
    .eq("is_active", true)
    .order("priority", { ascending: false });
  if (error) {
    console.warn("[gift-rules] fetch failed", error.message);
    return [];
  }
  return normalizeRules(data ?? []);
}

/** 後台：讀取全部規則（含停用） */
export async function fetchAllGiftRules(): Promise<GiftRule[]> {
  const { data, error } = await (supabase as any)
    .from("gift_rules")
    .select(GIFT_RULE_SELECT)
    .order("priority", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return normalizeRules(data ?? []);
}
