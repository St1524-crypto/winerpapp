import { supabase } from "@/integrations/supabase/client";

const PREFIX = "YBL";

/** Generate next SKU for a category code, e.g. YBL-HEALTH-0001 */
export async function generateSku(categoryCode: string): Promise<string> {
  const code = (categoryCode || "GEN").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const like = `${PREFIX}-${code}-%`;
  const { data } = await supabase
    .from("products")
    .select("sku")
    .ilike("sku", like)
    .order("sku", { ascending: false })
    .limit(1);
  const last = data?.[0]?.sku ?? "";
  const m = last.match(/(\d+)$/);
  const next = (m ? parseInt(m[1], 10) : 0) + 1;
  return `${PREFIX}-${code}-${String(next).padStart(4, "0")}`;
}

export async function isSkuUnique(sku: string, excludeId?: string) {
  const q = supabase.from("products").select("id").eq("sku", sku);
  const { data } = excludeId ? await q.neq("id", excludeId) : await q;
  return (data?.length ?? 0) === 0;
}
