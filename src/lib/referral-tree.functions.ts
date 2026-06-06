import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export interface TreeNode {
  id: string;
  name: string | null;
  member_no: string | null;
  phone: string | null;
  email: string | null;
  referral_code: string | null;
  is_vip: boolean;
  is_dealer: boolean;
  created_at: string | null;
  depth: number;
  children: TreeNode[];
}

const ADMIN_ROLES = ["super_admin", "admin", "finance", "sales"];

async function assertAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles").select("role").eq("user_id", userId);
  const ok = (data ?? []).some((r: any) => ADMIN_ROLES.includes(r.role));
  if (!ok) throw new Error("沒有權限查看推薦組織圖");
}

async function resolveRoot(raw: string) {
  const v = raw.trim();
  if (!v) return null;
  const upper = v.toUpperCase();
  const phone = v.replace(/[\s-]/g, "");
  const tries: Array<[string, string]> = [
    ["referral_code", upper],
    ["member_no", upper],
    ["phone", phone],
    ["email", v.toLowerCase()],
  ];
  for (const [col, val] of tries) {
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("id, name, member_no, phone, email, referral_code, is_vip, is_dealer, created_at")
      .eq(col, val)
      .limit(1)
      .maybeSingle();
    if (data) return data as any;
  }
  return null;
}

export const getReferralTree = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      root: z.string().trim().min(2).max(64),
      depth: z.number().int().min(1).max(10),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const root = await resolveRoot(data.root);
    if (!root) return { found: false as const };

    const rootNode: TreeNode = {
      ...root,
      depth: 0,
      children: [],
    };
    const byId = new Map<string, TreeNode>();
    byId.set(root.id, rootNode);

    let frontier: string[] = [root.id];
    let totalCount = 0;
    let vipCount = root.is_vip ? 1 : 0;
    let dealerCount = root.is_dealer ? 1 : 0;
    const byLevel: Record<number, number> = {};

    for (let d = 1; d <= data.depth && frontier.length > 0; d++) {
      const { data: children } = await supabaseAdmin
        .from("profiles")
        .select("id, name, member_no, phone, email, referral_code, is_vip, is_dealer, created_at, referred_by")
        .in("referred_by", frontier)
        .limit(5000);

      const next: string[] = [];
      byLevel[d] = children?.length ?? 0;
      for (const c of children ?? []) {
        const node: TreeNode = {
          id: (c as any).id,
          name: (c as any).name,
          member_no: (c as any).member_no,
          phone: (c as any).phone,
          email: (c as any).email,
          referral_code: (c as any).referral_code,
          is_vip: !!(c as any).is_vip,
          is_dealer: !!(c as any).is_dealer,
          created_at: (c as any).created_at,
          depth: d,
          children: [],
        };
        byId.set(node.id, node);
        const parent = byId.get((c as any).referred_by);
        if (parent) parent.children.push(node);
        next.push(node.id);
        totalCount++;
        if (node.is_vip) vipCount++;
        if (node.is_dealer) dealerCount++;
      }
      frontier = next;
    }

    return {
      found: true as const,
      tree: rootNode,
      stats: {
        total_descendants: totalCount,
        vip_count: vipCount,
        dealer_count: dealerCount,
        by_level: byLevel,
        max_depth: data.depth,
      },
    };
  });
