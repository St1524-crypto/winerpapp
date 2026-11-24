import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { nextRepurchaseDate } from "@/lib/next-repurchase";

function taipeiYm() {
  const s = new Date().toLocaleString("sv-SE", { timeZone: "Asia/Taipei" });
  return s.slice(0, 4) + s.slice(5, 7);
}

/** 顯示下一個應重購日（每月責任額 200 點） */
export function NextRepurchaseDate({ memberId, className }: { memberId: string; className?: string }) {
  const { data } = useQuery({
    queryKey: ["next-repurchase", memberId],
    queryFn: async () => {
      const ym = taipeiYm();
      const { data: rows } = await (supabase as any).from("monthly_responsibility_points")
        .select("ym, points").eq("member_id", memberId).gte("ym", ym);
      return nextRepurchaseDate(rows ?? [], ym, 200);
    },
  });
  if (!data) return null;
  return <span className={className}>下一個應重購日：{data}（每月責任額 200 點）</span>;
}
