import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export type AppRole = "admin" | "user" | "owner_ceo" | "financier";

export function useRoles() {
  const { user, loading: authLoading } = useAuth();
  const [roles, setRoles] = useState<Set<AppRole>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setRoles(new Set());
      setLoading(false);
      return;
    }
    setLoading(true);
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .then(({ data }) => {
        const s = new Set<AppRole>();
        (data ?? []).forEach((r: { role: string }) => s.add(r.role as AppRole));
        setRoles(s);
        setLoading(false);
      });
  }, [user, authLoading]);

  const has = (r: AppRole) => roles.has(r);
  const hasAny = (...rs: AppRole[]) => rs.some(r => roles.has(r));

  return {
    roles,
    loading,
    isAdmin: has("admin"),
    isCeo: has("owner_ceo"),
    isFinance: has("financier"),
    canApproveAdvances: hasAny("admin", "owner_ceo", "financier"),
    has,
    hasAny,
  };
}
