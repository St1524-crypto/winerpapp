import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export interface CompanyOption {
  id: string;
  company_name: string;
  status: string;
  logo_url: string | null;
  role: string;
}

interface CompanyCtx {
  currentCompanyId: string | null;
  current: CompanyOption | null;
  companies: CompanyOption[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  setCurrent: (companyId: string) => Promise<void>;
}

const Ctx = createContext<CompanyCtx>({
  currentCompanyId: null,
  current: null,
  companies: [],
  loading: true,
  error: null,
  refresh: async () => {},
  setCurrent: async () => {},
});

export function CompanyProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [currentCompanyId, setCurrentCompanyId] = useState<string | null>(null);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) {
      setCompanies([]);
      setCurrentCompanyId(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data: mems, error: memErr } = await supabase
        .from("company_members")
        .select("role, company_id, companies:company_id(id, company_name, status, logo_url)")
        .eq("user_id", user.id);
      if (memErr) {
        console.error("[use-current-company] load members error:", memErr);
        throw memErr;
      }

      const list: CompanyOption[] = (mems ?? [])
        .map((m: any) => {
          const c = Array.isArray(m.companies) ? m.companies[0] : m.companies;
          if (!c) return null;
          return {
            id: c.id,
            company_name: c.company_name,
            status: c.status,
            logo_url: c.logo_url ?? null,
            role: m.role,
          };
        })
        .filter(Boolean) as CompanyOption[];

      setCompanies(list);

      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("current_company_id")
        .eq("id", user.id)
        .maybeSingle();
      if (profErr) {
        console.error("[use-current-company] load profile error:", profErr);
        throw profErr;
      }

      let cur = prof?.current_company_id ?? null;
      // Auto-select first if none set or invalid
      if ((!cur || !list.find((x) => x.id === cur)) && list.length > 0) {
        cur = list[0].id;
        const { error: updErr } = await supabase
          .from("profiles")
          .update({ current_company_id: cur })
          .eq("id", user.id);
        if (updErr) console.error("[use-current-company] auto-set profile error:", updErr);
      }
      setCurrentCompanyId(cur);
    } catch (e: any) {
      console.error("[use-current-company] load failed:", e);
      setError(e?.message ?? "載入公司清單失敗");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const setCurrent = useCallback(
    async (companyId: string) => {
      if (!user || companyId === currentCompanyId) return;
      const { error } = await supabase
        .from("profiles")
        .update({ current_company_id: companyId })
        .eq("id", user.id);
      if (error) throw error;
      setCurrentCompanyId(companyId);
      // Invalidate all data queries so the new company's data loads
      qc.invalidateQueries();
    },
    [user, currentCompanyId, qc],
  );

  const current = companies.find((c) => c.id === currentCompanyId) ?? null;

  return (
    <Ctx.Provider value={{ currentCompanyId, current, companies, loading, refresh: load, setCurrent }}>
      {children}
    </Ctx.Provider>
  );
}

export const useCurrentCompany = () => useContext(Ctx);
