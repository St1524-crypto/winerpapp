import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type AccountLevel = "retail" | "vip" | "wholesale" | "agent";
export type AccountStatus = "pending" | "approved" | "rejected" | "suspended";

export interface BusinessAccount {
  id: string;
  company_name: string;
  tax_id: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  credit_limit: number;
  credit_used: number;
  payment_terms: number;
  account_level: AccountLevel;
  status: AccountStatus;
  sales_rep_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export const ACCOUNT_LEVEL_LABELS: Record<AccountLevel, string> = {
  retail: "一般會員",
  vip: "VIP 會員",
  wholesale: "批發商",
  agent: "代理商",
};

export const ACCOUNT_STATUS_LABELS: Record<AccountStatus, string> = {
  pending: "待審核",
  approved: "已核准",
  rejected: "已拒絕",
  suspended: "已停用",
};

export const ACCOUNT_STATUS_TONE: Record<AccountStatus, string> = {
  pending: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  approved: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  rejected: "bg-rose-500/15 text-rose-600 border-rose-500/30",
  suspended: "bg-slate-500/15 text-slate-600 border-slate-500/30",
};

export const ACCOUNT_LEVEL_TONE: Record<AccountLevel, string> = {
  retail: "bg-slate-500/10 text-slate-600 border-slate-500/30",
  vip: "bg-violet-500/15 text-violet-600 border-violet-500/30",
  wholesale: "bg-sky-500/15 text-sky-600 border-sky-500/30",
  agent: "bg-amber-500/15 text-amber-600 border-amber-500/30",
};

export function useBusinessAccounts(filters?: { search?: string; status?: AccountStatus | "all"; level?: AccountLevel | "all" }) {
  const [data, setData] = useState<BusinessAccount[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    let q = supabase.from("business_accounts" as any).select("*").order("created_at", { ascending: false });
    if (filters?.search) {
      const s = `%${filters.search}%`;
      q = q.or(`company_name.ilike.${s},tax_id.ilike.${s},contact_name.ilike.${s}`);
    }
    if (filters?.status && filters.status !== "all") q = q.eq("status", filters.status);
    if (filters?.level && filters.level !== "all") q = q.eq("account_level", filters.level);
    const { data } = await q;
    setData((data ?? []) as unknown as BusinessAccount[]);
    setLoading(false);
  }, [JSON.stringify(filters)]);

  useEffect(() => { refresh(); }, [refresh]);

  return { data, loading, refresh };
}

export function useBusinessAccount(id?: string) {
  const [data, setData] = useState<BusinessAccount | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const { data } = await supabase.from("business_accounts" as any).select("*").eq("id", id).maybeSingle();
    setData((data as unknown as BusinessAccount) ?? null);
    setLoading(false);
  }, [id]);

  useEffect(() => { refresh(); }, [refresh]);

  return { data, loading, refresh };
}
