import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export type TenantInfo = {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
  logo_url: string | null;
};

export type TenantSubscription = {
  status: string;
  current_period_end: string | null;
  trial_ends_at: string | null;
  plan_name: string | null;
};

/**
 * Current company (tenant) of the signed-in user plus its subscription state.
 * All data access is already scoped by row-level tenant isolation in the
 * database; this hook is only for display and subscription gating.
 */
export function useTenant() {
  const { user, loading: authLoading } = useAuth();
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [subscription, setSubscription] = useState<TenantSubscription | null>(null);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    if (authLoading) return;
    if (!user) {
      setTenant(null);
      setSubscription(null);
      setIsPlatformAdmin(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    (async () => {
      const [{ data: t }, { data: s }, { data: pa }] = await Promise.all([
        supabase.from("tenants").select("id, name, slug, is_active, logo_url").limit(1).maybeSingle(),
        supabase
          .from("subscriptions")
          .select("status, current_period_end, trial_ends_at, plans(name)")
          .limit(1)
          .maybeSingle(),
        supabase.rpc("is_platform_admin"),
      ]);
      if (!mounted) return;
      setTenant((t as TenantInfo | null) ?? null);
      setSubscription(
        s
          ? {
              status: (s as any).status,
              current_period_end: (s as any).current_period_end,
              trial_ends_at: (s as any).trial_ends_at,
              plan_name: (s as any).plans?.name ?? null,
            }
          : null,
      );
      setIsPlatformAdmin(!!pa);
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [user, authLoading]);

  const expired =
    !!subscription &&
    (subscription.status === "canceled" ||
      (!!subscription.current_period_end &&
        new Date(subscription.current_period_end) < new Date(new Date().toDateString())));

  return { tenant, subscription, isPlatformAdmin, loading, expired };
}
