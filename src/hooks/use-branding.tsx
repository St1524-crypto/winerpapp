import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import defaultLogo from "@/assets/logo.jpg";

const KEY = "branding.logo_url";

interface BrandingCtx {
  logoUrl: string;
  refresh: () => Promise<void>;
  setLogoUrl: (url: string | null) => Promise<void>;
}

const Ctx = createContext<BrandingCtx>({ logoUrl: defaultLogo, refresh: async () => {}, setLogoUrl: async () => {} });

export function BrandingProvider({ children }: { children: ReactNode }) {
  const [logoUrl, setLogo] = useState<string>(defaultLogo);

  const refresh = useCallback(async () => {
    const { data } = await supabase.from("system_settings").select("value").eq("key", KEY).maybeSingle();
    const url = (data?.value as any)?.url;
    setLogo(typeof url === "string" && url ? url : defaultLogo);
  }, []);

  useEffect(() => {
    refresh();
    const ch = supabase
      .channel("branding-settings")
      .on("postgres_changes", { event: "*", schema: "public", table: "system_settings", filter: `key=eq.${KEY}` }, () => refresh())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [refresh]);

  const setLogoUrl = useCallback(async (url: string | null) => {
    const { data: u } = await supabase.auth.getUser();
    const updated_by = u.user?.id;
    await supabase.from("system_settings").upsert(
      { key: KEY, value: { url }, description: "全站 Logo 圖片", updated_by },
      { onConflict: "key" },
    );
    await refresh();
  }, [refresh]);

  return <Ctx.Provider value={{ logoUrl, refresh, setLogoUrl }}>{children}</Ctx.Provider>;
}

export const useBranding = () => useContext(Ctx);
