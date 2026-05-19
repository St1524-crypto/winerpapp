import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { CustomerAddress } from "@/types/shop";

export function useAddresses() {
  const { user } = useAuth();
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) { setAddresses([]); setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase
      .from("customer_addresses")
      .select("*")
      .eq("user_id", user.id)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false });
    setAddresses((data ?? []) as CustomerAddress[]);
    setLoading(false);
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  // Atomic switch via SECURITY DEFINER RPC; optimistic UI update first.
  const setDefault = useCallback(async (id: string) => {
    setAddresses((prev) => prev.map((a) => ({ ...a, is_default: a.id === id })));
    const { error } = await supabase.rpc("set_default_address", { _address_id: id });
    if (error) {
      await refresh();
      throw error;
    }
  }, [refresh]);

  const defaultAddress = addresses.find((a) => a.is_default) ?? addresses[0] ?? null;

  return { addresses, defaultAddress, loading, refresh, setDefault };
}
